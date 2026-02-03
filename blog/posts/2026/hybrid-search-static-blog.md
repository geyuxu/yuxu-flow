---
date: 2026-01-26
tags: [rag, search, cloudflare, javascript]
description: Building a production-ready hybrid search for static blogs - combining BM25 keyword search with OpenAI embeddings, all without a backend server.
---

# Building Hybrid Search for Static Blogs: BM25 + Vector Search with Cloudflare Workers

Static site generators are great until you need search. Most solutions either require a backend server or rely on basic client-side text matching. This post walks through building a **hybrid search system** that combines instant BM25 keyword matching with semantic vector search - all while keeping your site fully static.

## The Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Build Time    │     │   Cloudflare     │     │    Browser      │
│                 │     │     Worker       │     │                 │
│  Markdown       │     │                  │     │  ┌───────────┐  │
│  Posts          │     │  /api/embedding  │     │  │ Keyword   │  │
│      ↓          │     │       ↓          │     │  │ Search    │  │
│  ┌─────────┐    │     │  OpenAI API      │     │  │ (instant) │  │
│  │ Index   │    │     │  (protected)     │     │  └─────┬─────┘  │
│  │ Builder │    │     │       ↓          │     │        │        │
│  └────┬────┘    │     │  512-dim vector  │     │        ▼        │
│       │         │     │                  │     │  ┌───────────┐  │
│       ▼         │     └──────────────────┘     │  │  Merge    │  │
│  search.dat     │◄────────────────────────────►│  │  Results  │  │
│  inverted.json  │                              │  └───────────┘  │
│  metadata.json  │                              │        ▲        │
│                 │                              │  ┌─────┴─────┐  │
└─────────────────┘                              │  │  Vector   │  │
                                                 │  │  Search   │  │
                                                 │  │  (Voy)    │  │
                                                 │  └───────────┘  │
                                                 └─────────────────┘
```

**Key design decisions:**
- **No backend required** - everything runs in the browser or edge
- **API key protection** - OpenAI calls go through Cloudflare Worker
- **Progressive UX** - keyword results appear instantly, AI results merge in
- **Hybrid ranking** - Reciprocal Rank Fusion combines both result sets

## Part 1: Building the Search Index

At build time, we generate three files:

| File | Purpose | Size |
|------|---------|------|
| `search.dat` | Voy vector index | ~50KB |
| `search-inverted.json` | BM25 inverted index | ~10KB |
| `search-metadata.json` | Title, date, preview | ~5KB |

### The Index Builder

```javascript
// scripts/index-builder.mjs
import { Voy } from 'voy-search/voy_search.js';

const CONFIG = {
    postsDir: 'blog/posts',
    dimensions: 512,        // text-embedding-3-small supports 512
    model: 'text-embedding-3-small',
    chunkSize: 500,
};

// Tokenizer for both Chinese and English
function tokenize(text) {
    const normalized = text.toLowerCase().trim();
    const tokens = normalized.match(/[\u4e00-\u9fff]+|[a-z0-9]+/g) || [];

    const result = [];
    for (const token of tokens) {
        if (/[\u4e00-\u9fff]/.test(token)) {
            // Chinese: unigrams + bigrams
            for (let i = 0; i < token.length; i++) {
                result.push(token[i]);
                if (i < token.length - 1) {
                    result.push(token.slice(i, i + 2));
                }
            }
        } else if (token.length >= 2) {
            result.push(token);
        }
    }

    return result.filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

// Build inverted index for BM25
function buildInvertedIndex(documents) {
    const index = {};
    const docLengths = {};

    for (const doc of documents) {
        const tokens = tokenize(doc.title + ' ' + doc.content);
        const termFreq = {};

        for (const token of tokens) {
            termFreq[token] = (termFreq[token] || 0) + 1;
        }

        for (const [term, freq] of Object.entries(termFreq)) {
            if (!index[term]) index[term] = [];
            index[term].push({ id: doc.url, tf: freq });
        }

        docLengths[doc.url] = tokens.length;
    }

    return { index, docLengths, avgDocLength, docCount };
}
```

The bilingual tokenizer is crucial - it handles:
- **English**: standard word tokenization with stopword removal
- **Chinese**: character unigrams + bigrams (no word segmentation library needed)

### Getting Embeddings from OpenAI

```javascript
async function getEmbeddings(texts) {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: texts,
            dimensions: 512,  // Halves storage vs 1536
        }),
    });

    return (await response.json()).data.map(item => item.embedding);
}
```

**Why 512 dimensions?** OpenAI's text-embedding-3-small supports dimension reduction. Using 512 instead of 1536 cuts index size by ~65% with minimal quality loss.

### Embedding Cache for Incremental Updates

Calling OpenAI API on every rebuild is slow and expensive. Content hashing enables incremental updates:

```javascript
import crypto from 'crypto';

// Compute content hash
function contentHash(text) {
    return crypto.createHash('md5').update(text).digest('hex');
}

// Cache format: { [chunkId]: { hash, embedding } }
const cache = loadCache('.cache/embeddings.json');

for (const doc of documents) {
    const hash = contentHash(doc.embeddingText);

    if (cache[doc.id]?.hash === hash) {
        // Cache hit - skip API call
        embeddings[i] = cache[doc.id].embedding;
    } else {
        // Content changed - needs re-embedding
        toEmbed.push({ index: i, text: doc.embeddingText, hash, id: doc.id });
    }
}

// Only call API for new/changed documents
const newEmbeddings = await batchGetEmbeddings(toEmbed.map(t => t.text));
```

**Result**: First build requires full embedding (~93 batches), but subsequent updates only process changed articles. Adding one new post needs just 1-2 API calls instead of re-processing all 135 articles.

## Part 2: The Cloudflare Worker

The Worker acts as a secure proxy, keeping your API key hidden from the browser.

```javascript
// workers/embed-worker.js
export default {
    async fetch(request, env) {
        const corsHeaders = {
            "Access-Control-Allow-Origin": "https://yuxu.ge",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        if (request.method !== "POST") {
            return new Response("Method Not Allowed", { status: 405 });
        }

        try {
            const { text } = await request.json();

            const response = await fetch("https://api.openai.com/v1/embeddings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
                },
                body: JSON.stringify({
                    input: text,
                    model: "text-embedding-3-small",
                    dimensions: 512,
                }),
            });

            const data = await response.json();
            return new Response(
                JSON.stringify({ embedding: data.data[0].embedding }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        } catch (err) {
            return new Response(
                JSON.stringify({ error: err.message }),
                { status: 500, headers: corsHeaders }
            );
        }
    },
};
```

**Cloudflare setup:**
1. Create a Worker at `api-embedding.your-worker.workers.dev`
2. Add route: `yuxu.ge/api/*` → your Worker
3. Set environment variable: `OPENAI_API_KEY`

Now your frontend calls `/api/embedding` and never sees the API key.

## Part 3: The Hybrid Search Client

The magic happens in the browser. We run two searches in parallel:

```javascript
// components/search-client.js
export class SearchClient {
    async init() {
        // Load all indexes in parallel
        const [voyModule, indexRes, metaRes, invertedRes] = await Promise.all([
            import('/public/lib/voy-loader.js').then(m => m.getVoy()),
            fetch('/public/search.dat'),
            fetch('/public/search-metadata.json'),
            fetch('/public/search-inverted.json'),
        ]);

        this.voy = voyModule.deserialize(await indexRes.text());
        this.metadata = await metaRes.json();
        this.invertedIndex = await invertedRes.json();
    }

    // BM25 keyword search - instant, no API call
    keywordSearch(query, limit = 10) {
        const tokens = tokenize(query);
        const { idx, dl, avgDL, N } = this.invertedIndex;
        const scores = {};

        for (const term of tokens) {
            const postings = idx[term];
            if (!postings) continue;

            const df = postings.length;
            const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

            for (const { id, tf } of postings) {
                const docLen = dl[id] || avgDL;
                const k1 = 1.2, b = 0.75;
                const tfNorm = (tf * (k1 + 1)) /
                    (tf + k1 * (1 - b + b * docLen / avgDL));
                scores[id] = (scores[id] || 0) + idf * tfNorm;
            }
        }

        return Object.entries(scores)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit);
    }

    // Semantic search - requires API call
    async semanticSearch(query, limit = 10) {
        const embedding = await this.getVector(query);
        const results = this.voy.search(embedding, limit * 3);
        // Deduplicate by URL...
        return deduplicated;
    }

    // Hybrid search with Reciprocal Rank Fusion
    async search(query, limit = 5) {
        const [keywordResults, semanticResults] = await Promise.all([
            this.keywordSearch(query, limit * 2),
            this.semanticSearch(query, limit * 2),
        ]);

        // RRF merging
        const rrfScores = {};
        const k = 60;

        for (const r of keywordResults) {
            rrfScores[r.url] = (rrfScores[r.url] || 0) +
                0.4 / (k + r.rank);  // 40% weight
        }
        for (const r of semanticResults) {
            rrfScores[r.url] = (rrfScores[r.url] || 0) +
                0.6 / (k + r.rank);  // 60% weight
        }

        return Object.entries(rrfScores)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit);
    }
}
```

### Why Reciprocal Rank Fusion?

RRF is elegantly simple: `score = Σ 1/(k + rank)` for each retriever. It doesn't require score normalization and handles the different scales of BM25 scores vs vector distances gracefully.

## Part 4: Progressive UX

The key insight: **keyword search is instant, semantic search needs an API call**. We show keyword results immediately, then merge in AI results with animation:

```javascript
async function handleSearch(query) {
    // 1. Instant keyword results
    const keywordResults = client.searchKeywordOnly(query);
    showResults(query, keywordResults, showAiLoading: true);

    // 2. AI search runs in background
    const semanticResults = await client.semanticSearch(query);

    // 3. Merge with animation
    mergeResults(semanticResults, keywordResults);
}
```

The CSS animations make the experience feel polished:

```css
@keyframes slideIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
}

.search-result-item.new {
    animation: slideIn 0.3s ease-out;
}
```

Each result shows badges indicating its source:
- **`keyword`** (blue) - matched via BM25
- **`AI`** (pink) - matched via vector similarity
- Both badges if found by both methods

## Performance Characteristics

| Metric | Keyword Search | Semantic Search |
|--------|---------------|-----------------|
| Latency | <10ms | 200-500ms |
| API calls | 0 | 1 |
| Index size | ~10KB | ~50KB |
| Ranking | BM25 (exact match) | Cosine similarity |

The hybrid approach gives you the best of both worlds:
- **Exact matches** via keyword search (searching "Docker" finds "Docker" immediately)
- **Semantic matches** via vectors (searching "container security" finds Docker articles)

## Deployment Checklist

1. **Build indexes**: `OPENAI_API_KEY=sk-xxx node scripts/index-builder.mjs`
2. **Deploy Worker**: Set up Cloudflare Worker with route mapping
3. **Upload static files**: `search.dat`, `search-inverted.json`, `search-metadata.json`
4. **Test**: Open browser console, type in search box

## Conclusion

This architecture proves you don't need a backend server for sophisticated search. By splitting the work between build-time indexing, edge compute (Cloudflare Worker), and browser-side retrieval (Voy WASM), we get:

- **Security**: API keys never touch the browser
- **Speed**: Keyword results appear instantly
- **Quality**: Semantic search understands intent
- **Cost**: Only pay for actual search queries, not server uptime

The full source code is available at [github.com/geyuxu/yuxu.ge](https://github.com/geyuxu/yuxu.ge).

---

*Built with: OpenAI text-embedding-3-small, Voy WASM, Cloudflare Workers, vanilla JavaScript*

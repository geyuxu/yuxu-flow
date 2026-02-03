---
date: 2026-01-26
tags: [rag, search, cloudflare, javascript]
description: 为静态博客构建生产级混合搜索 - 结合 BM25 关键词搜索与 OpenAI 向量搜索，无需后端服务器。
---

# 静态博客的混合搜索方案：BM25 + 向量检索 + Cloudflare Workers

静态网站生成器很好用，直到你需要搜索功能。大多数方案要么需要后端服务器，要么只能做简单的客户端文本匹配。本文介绍如何构建一个**混合搜索系统**——结合即时 BM25 关键词匹配和语义向量搜索，同时保持网站完全静态化。

## 架构概览

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   构建阶段       │     │   Cloudflare     │     │    浏览器        │
│                 │     │     Worker       │     │                 │
│  Markdown       │     │                  │     │  ┌───────────┐  │
│  博客文章        │     │  /api/embedding  │     │  │ 关键词    │  │
│      ↓          │     │       ↓          │     │  │ 搜索      │  │
│  ┌─────────┐    │     │  OpenAI API      │     │  │ (即时)    │  │
│  │ 索引    │    │     │  (密钥保护)       │     │  └─────┬─────┘  │
│  │ 构建器  │    │     │       ↓          │     │        │        │
│  └────┬────┘    │     │  512维向量        │     │        ▼        │
│       │         │     │                  │     │  ┌───────────┐  │
│       ▼         │     └──────────────────┘     │  │  结果     │  │
│  search.dat     │◄────────────────────────────►│  │  融合     │  │
│  inverted.json  │                              │  └───────────┘  │
│  metadata.json  │                              │        ▲        │
│                 │                              │  ┌─────┴─────┐  │
└─────────────────┘                              │  │  向量     │  │
                                                 │  │  搜索     │  │
                                                 │  │  (Voy)    │  │
                                                 │  └───────────┘  │
                                                 └─────────────────┘
```

**核心设计决策：**
- **无需后端** - 所有逻辑运行在浏览器或边缘节点
- **API 密钥保护** - OpenAI 调用通过 Cloudflare Worker 代理
- **渐进式体验** - 关键词结果即时显示，AI 结果动画融入
- **混合排序** - 使用 Reciprocal Rank Fusion 合并两种结果

## 第一部分：构建搜索索引

构建阶段生成三个文件：

| 文件 | 用途 | 大小 |
|------|------|------|
| `search.dat` | Voy 向量索引 | ~50KB |
| `search-inverted.json` | BM25 倒排索引 | ~10KB |
| `search-metadata.json` | 标题、日期、预览 | ~5KB |

### 索引构建器

```javascript
// scripts/index-builder.mjs
import { Voy } from 'voy-search/voy_search.js';

const CONFIG = {
    postsDir: 'blog/posts',
    dimensions: 512,        // text-embedding-3-small 支持 512 维
    model: 'text-embedding-3-small',
    chunkSize: 500,
};

// 中英文双语分词器
function tokenize(text) {
    const normalized = text.toLowerCase().trim();
    const tokens = normalized.match(/[\u4e00-\u9fff]+|[a-z0-9]+/g) || [];

    const result = [];
    for (const token of tokens) {
        if (/[\u4e00-\u9fff]/.test(token)) {
            // 中文：单字 + 二元组
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

// 构建 BM25 倒排索引
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

双语分词器是关键——它处理：
- **英文**：标准词汇分词，过滤停用词
- **中文**：字符单元 + 二元组（无需分词库）

### 调用 OpenAI 获取向量

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
            dimensions: 512,  // 相比 1536 维，存储减半
        }),
    });

    return (await response.json()).data.map(item => item.embedding);
}
```

**为什么选择 512 维？** OpenAI 的 text-embedding-3-small 支持降维。使用 512 而非 1536 维可以减少约 65% 的索引体积，质量损失极小。

### Embedding 缓存机制

每次重建索引都调用 OpenAI API 既慢又费钱。通过内容哈希实现增量更新：

```javascript
import crypto from 'crypto';

// 计算内容哈希
function contentHash(text) {
    return crypto.createHash('md5').update(text).digest('hex');
}

// 缓存格式: { [chunkId]: { hash, embedding } }
const cache = loadCache('.cache/embeddings.json');

for (const doc of documents) {
    const hash = contentHash(doc.embeddingText);

    if (cache[doc.id]?.hash === hash) {
        // 缓存命中，跳过 API 调用
        embeddings[i] = cache[doc.id].embedding;
    } else {
        // 内容变化，需要重新生成
        toEmbed.push({ index: i, text: doc.embeddingText, hash, id: doc.id });
    }
}

// 只对新增/修改的文档调用 API
const newEmbeddings = await batchGetEmbeddings(toEmbed.map(t => t.text));
```

**效果**：首次构建需要完整 embedding（约 93 批次），后续增量更新只处理变化的文章。添加一篇新文章只需 1-2 次 API 调用，而非重新处理全部 135 篇。

## 第二部分：Cloudflare Worker

Worker 作为安全代理，将 API 密钥隐藏在浏览器之外。

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

**Cloudflare 配置步骤：**
1. 创建 Worker：`api-embedding.your-worker.workers.dev`
2. 添加路由：`yuxu.ge/api/*` → 你的 Worker
3. 设置环境变量：`OPENAI_API_KEY`

现在前端调用 `/api/embedding` 接口，永远不会暴露 API 密钥。

## 第三部分：混合搜索客户端

魔法发生在浏览器端。我们并行运行两种搜索：

```javascript
// components/search-client.js
export class SearchClient {
    async init() {
        // 并行加载所有索引
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

    // BM25 关键词搜索 - 即时，无需 API 调用
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

    // 语义搜索 - 需要 API 调用
    async semanticSearch(query, limit = 10) {
        const embedding = await this.getVector(query);
        const results = this.voy.search(embedding, limit * 3);
        // 按 URL 去重...
        return deduplicated;
    }

    // 混合搜索 + Reciprocal Rank Fusion
    async search(query, limit = 5) {
        const [keywordResults, semanticResults] = await Promise.all([
            this.keywordSearch(query, limit * 2),
            this.semanticSearch(query, limit * 2),
        ]);

        // RRF 融合
        const rrfScores = {};
        const k = 60;

        for (const r of keywordResults) {
            rrfScores[r.url] = (rrfScores[r.url] || 0) +
                0.4 / (k + r.rank);  // 40% 权重
        }
        for (const r of semanticResults) {
            rrfScores[r.url] = (rrfScores[r.url] || 0) +
                0.6 / (k + r.rank);  // 60% 权重
        }

        return Object.entries(rrfScores)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit);
    }
}
```

### 为什么选择 Reciprocal Rank Fusion？

RRF 简洁优雅：`score = Σ 1/(k + rank)`。它不需要分数归一化，能优雅地处理 BM25 分数和向量距离的不同量级。

## 第四部分：渐进式用户体验

关键洞察：**关键词搜索是即时的，语义搜索需要 API 调用**。我们先显示关键词结果，然后用动画融入 AI 结果：

```javascript
async function handleSearch(query) {
    // 1. 即时显示关键词结果
    const keywordResults = client.searchKeywordOnly(query);
    showResults(query, keywordResults, showAiLoading: true);

    // 2. AI 搜索在后台运行
    const semanticResults = await client.semanticSearch(query);

    // 3. 动画融合结果
    mergeResults(semanticResults, keywordResults);
}
```

CSS 动画让体验更流畅：

```css
@keyframes slideIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
}

.search-result-item.new {
    animation: slideIn 0.3s ease-out;
}
```

每个结果显示来源标签：
- **`keyword`**（蓝色）- BM25 匹配
- **`AI`**（粉色）- 向量相似度匹配
- 如果两种方法都匹配到，显示双标签

## 性能特征

| 指标 | 关键词搜索 | 语义搜索 |
|------|-----------|---------|
| 延迟 | <10ms | 200-500ms |
| API 调用 | 0 | 1 |
| 索引大小 | ~10KB | ~50KB |
| 排序方式 | BM25（精确匹配）| 余弦相似度 |

混合方案兼得两者优势：
- **精确匹配** via 关键词搜索（搜"Docker"立即找到"Docker"）
- **语义匹配** via 向量搜索（搜"容器安全"也能找到 Docker 文章）

## 部署清单

1. **构建索引**：`OPENAI_API_KEY=sk-xxx node scripts/index-builder.mjs`
2. **部署 Worker**：配置 Cloudflare Worker 和路由映射
3. **上传静态文件**：`search.dat`、`search-inverted.json`、`search-metadata.json`
4. **测试**：打开浏览器控制台，在搜索框输入测试

## 总结

这个架构证明了精密的搜索功能不需要后端服务器。通过在构建时生成索引、边缘计算（Cloudflare Worker）和浏览器端检索（Voy WASM）之间分工，我们实现了：

- **安全**：API 密钥永远不会到达浏览器
- **速度**：关键词结果即时显示
- **质量**：语义搜索理解用户意图
- **成本**：只为实际搜索请求付费，无需服务器运行费用

完整源代码：[github.com/geyuxu/yuxu.ge](https://github.com/geyuxu/yuxu.ge)

---

*技术栈：OpenAI text-embedding-3-small、Voy WASM、Cloudflare Workers、原生 JavaScript*

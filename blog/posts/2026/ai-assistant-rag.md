---
date: 2026-01-28
tags: [ai, rag, cloudflare-workers, javascript, llm]
description: Building a RAG-powered AI assistant for my personal website using hybrid search, Cloudflare Workers, and OpenAI API.
---

# Building a RAG-Powered AI Assistant for My Personal Website

I recently added an AI chat assistant to my personal website that can answer questions about my blog posts, projects, and background. This post documents the implementation journey, from architecture design to security considerations.

## The Goal

Create a floating chat widget that:
- Answers questions about blog content using RAG (Retrieval-Augmented Generation)
- Provides friendly technical discussions
- Handles sensitive topics gracefully
- Works entirely on static hosting (GitHub Pages) with Cloudflare Workers as the API layer

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Frontend)                        │
├─────────────────────────────────────────────────────────────────┤
│  Chat Widget ──────▶ Search Client                              │
│       │              ├─ BM25 Keyword Search (local)             │
│       │              └─ Voy WASM Semantic Search                │
│       │                        │                                │
│       │◀───────────────────────┘ (Top 3 chunks as context)      │
└───────┼─────────────────────────────────────────────────────────┘
        │ POST /api/chat { messages, context }
        ▼
┌─────────────────────────────────────────────────────────────────┐
│              Cloudflare Worker (yuxu.ge/api/*)                  │
│  ┌─────────────────┐        ┌─────────────────┐                 │
│  │ /api/embedding  │        │   /api/chat     │                 │
│  │ (query vector)  │        │ system_prompt   │                 │
│  └────────┬────────┘        │ + RAG context   │                 │
│           │                 └────────┬────────┘                 │
└───────────┼──────────────────────────┼──────────────────────────┘
            │                          │
            ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                         OpenAI API                              │
│  text-embedding-3-small (512d)    gpt-4o-mini                   │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation

### 1. Chat Widget (Frontend)

The chat widget is a self-contained JavaScript module that creates a floating bubble UI:

```javascript
export class ChatWidget {
    constructor() {
        this.messages = [];
        this.isOpen = false;
        this.searchClient = null;
    }

    async sendMessage(text) {
        // Get RAG context from search client
        let context = '';
        if (this.searchClient?.isReady()) {
            const results = await this.searchClient.search(text, 3);
            context = results.map(r => `[${r.title}]\n${r.text}`).join('\n\n');
        }

        // Call chat API with context
        const response = await fetch('https://yuxu.ge/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: this.messages,
                context,
            }),
        });

        const data = await response.json();
        return data.reply;
    }
}
```

Key features:
- **Markdown rendering**: Converts `**bold**` and `[links](url)` to HTML
- **CSS-in-JS**: All styles are injected dynamically, no external dependencies
- **ESC to close**: Keyboard accessibility
- **Mobile responsive**: Adapts to screen size

### 2. Hybrid Search for RAG

I already had a search system built with:
- **BM25 keyword search**: Local inverted index for exact term matching
- **Voy WASM semantic search**: Vector similarity using pre-computed embeddings
- **RRF fusion**: Combines both results using Reciprocal Rank Fusion

The chat widget reuses this existing infrastructure:

```javascript
const [keywordResults, semanticResults] = await Promise.all([
    this.keywordSearch(query, limit * 2),
    this.semanticSearch(query, limit * 2),
]);

// Merge using RRF
for (const result of keywordResults) {
    rrfScores[result.url] = keywordWeight / (k + result.rank);
}
for (const result of semanticResults) {
    rrfScores[result.url] += semanticWeight / (k + result.rank);
}
```

### 3. Cloudflare Worker (API Proxy)

The Worker handles two endpoints:

**`/api/embedding`** - Converts query text to vector for semantic search:
```javascript
const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
        dimensions: 512,
    }),
});
```

**`/api/chat`** - Chat completion with RAG context:
```javascript
const systemMessage = context
    ? `${env.system_prompt}\n\n## Related blog content:\n${context}`
    : env.system_prompt;

const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemMessage },
            ...messages,
        ],
    }),
});
```

### 4. Security: Handling Sensitive Topics

For a personal website, I needed the assistant to:
- Freely discuss the website owner (me)
- Refuse political/sensitive topics gracefully

This is handled in the system prompt (stored as environment variable):

```
## About the website owner
Yuxu Ge is the website owner. You can freely discuss:
- Professional background, technical experience, projects
- Blog content, technical opinions
- Public information (education, work history)

## Conversation boundaries
Politely decline and redirect for:
- Political figures, government policies, geopolitical disputes
- Religious or ideological debates

When declining: "This is beyond my scope as a technical assistant.
Shall we discuss something technical instead?"

## Public contact info (can share)
- Email: me@yuxu.ge
- GitHub: https://github.com/geyuxu
- LinkedIn: https://linkedin.com/in/yuxuge
```

### 5. Conversation History with localStorage

For better UX, the chat widget persists conversation history in the browser's localStorage:

```javascript
const CHAT_CONFIG = {
    storageKey: 'chat_history',
    historyTTL: 24 * 60 * 60 * 1000, // 24 hours
};

// Save after each successful response
saveHistory() {
    const data = {
        messages: this.messages.slice(-20),
        timestamp: Date.now(),
    };
    localStorage.setItem(CHAT_CONFIG.storageKey, JSON.stringify(data));
}

// Load on widget initialization
loadHistory() {
    const raw = localStorage.getItem(CHAT_CONFIG.storageKey);
    if (!raw) return;

    const data = JSON.parse(raw);

    // Check TTL expiration
    if (Date.now() - data.timestamp > CHAT_CONFIG.historyTTL) {
        localStorage.removeItem(CHAT_CONFIG.storageKey);
        return;
    }

    this.messages = data.messages;
    this.renderHistory();
}
```

Features:
- **Auto-save**: Saves after each assistant response
- **Auto-restore**: Restores conversation when page loads
- **24-hour TTL**: Automatically clears stale conversations
- **Clear button**: Manual clear via trash icon in header

This is a pragmatic choice over server-side storage (Cloudflare KV) because:
- Most visitors have one-time conversations
- No user identification needed
- Zero additional cost
- Simpler implementation

## Lessons Learned

1. **Environment variables > hardcoded prompts**: Storing `system_prompt` as a Cloudflare environment variable allows prompt iteration without code deployment.

2. **Reuse existing search infrastructure**: Building RAG on top of an existing hybrid search system saved significant effort.

3. **Nuanced content filtering**: Initial attempts at sensitive topic filtering were too aggressive (blocking questions about myself). The key is explicitly whitelisting allowed topics.

4. **Markdown in chat**: Simple regex-based markdown parsing is sufficient for bold and links. No need for heavy libraries.

5. **Start simple with state management**: localStorage is sufficient for conversation history. Server-side storage (KV) adds complexity without clear benefit for a personal site.

## Cost Analysis

With `gpt-4o-mini` and `text-embedding-3-small`:
- Embedding: ~$0.00002 per query
- Chat: ~$0.0001-0.0005 per response (depending on context length)
- Estimated monthly cost: < $5 for moderate traffic

## Next Steps

- [ ] Add streaming responses for better UX
- [x] ~~Implement conversation memory~~ (Done with localStorage)
- [ ] Add usage analytics
- [ ] Support image understanding for blog screenshots

The complete implementation is open source in my website repository. Feel free to adapt it for your own projects!

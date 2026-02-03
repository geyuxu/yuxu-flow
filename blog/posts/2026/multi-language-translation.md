---
date: 2026-01-28
tags: [ai, translation, cloudflare-workers, javascript, llm]
description: Adding real-time AI translation to a static blog with GPT-4o-mini and Cloudflare Workers, supporting 10 languages with dual-layer caching.
---

# Adding Multi-Language AI Translation to My Blog

After implementing the [RAG-powered AI assistant](/blog/post.html?p=posts/2026/ai-assistant-rag), I wanted to make my blog content accessible to a global audience. Instead of manually translating each post, I built an on-demand AI translation system that supports 10 languages.

## The Goal

Create a seamless translation experience:
- Translate any blog post to 10 major languages on demand
- Preserve Markdown formatting (headers, code blocks, links)
- Cache translations to minimize API costs
- Show loading feedback during translation

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Browser (Frontend)                          │
├─────────────────────────────────────────────────────────────────┤
│  Language Selector ──▶ Check localStorage cache                 │
│         │                     │                                 │
│         │◀── Cache hit ───────┘                                 │
│         │                                                       │
│         ▼ Cache miss                                            │
│  POST /api/translate { content, targetLang, slug }              │
└─────────┼───────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│              Cloudflare Worker (/api/translate)                 │
│  ┌─────────────────┐        ┌─────────────────┐                 │
│  │  Check KV Cache │───hit──▶│  Return cached  │                 │
│  └────────┬────────┘        └─────────────────┘                 │
│           │ miss                                                │
│           ▼                                                     │
│  ┌─────────────────┐        ┌─────────────────┐                 │
│  │ Call OpenAI API │───────▶│ Cache in KV     │                 │
│  │  (gpt-4o-mini)  │        │ (30 days TTL)   │                 │
│  └─────────────────┘        └─────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

## Supported Languages

The system supports 10 languages covering most of the world's population:

| Code | Language | Code | Language |
|------|----------|------|----------|
| en | English | fr | Français |
| zh | 中文 | de | Deutsch |
| ja | 日本語 | pt | Português |
| ko | 한국어 | ru | Русский |
| es | Español | ar | العربية |

## Implementation

### 1. Language Selector UI

A clean dropdown that appears on every blog post:

```html
<div class="lang-selector" id="lang-selector">
    <span class="lang-selector-label">
        <svg><!-- translate icon --></svg>
        Language
    </span>
    <select class="lang-select" id="lang-select">
        <option value="en">🇺🇸 English</option>
        <option value="zh">🇨🇳 中文</option>
        <option value="ja">🇯🇵 日本語</option>
        <!-- ... more languages -->
    </select>
    <button class="lang-original-btn" id="lang-original-btn">
        Show Original
    </button>
    <span class="lang-status" id="lang-status"></span>
</div>
```

### 2. Loading Animation

A CSS-only spinner that shows during translation:

```css
.lang-status.translating {
    color: var(--vermilion);
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.lang-status.translating::before {
    content: '';
    width: 14px;
    height: 14px;
    border: 2px solid #f0f0f0;
    border-top-color: var(--vermilion);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}
```

### 3. Dual-Layer Caching Strategy

To minimize API costs, I implemented caching at two levels:

**Frontend (localStorage)** - 7 day TTL:
```javascript
function getTranslationCache(key) {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const data = JSON.parse(raw);
    if (Date.now() - data.timestamp > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(key);
        return null;
    }
    return data.content;
}
```

**Backend (Cloudflare KV)** - 30 day TTL:
```javascript
// Check cache
const cached = await env.TRANSLATIONS.get(cacheKey);
if (cached) {
    return Response.json({ translated: cached, cached: true });
}

// After translation, cache result
await env.TRANSLATIONS.put(cacheKey, translated, {
    expirationTtl: 30 * 24 * 60 * 60
});
```

### 4. Translation API (Cloudflare Worker)

The worker handles translation requests with careful prompt engineering:

```javascript
if (path === "/api/translate") {
    const { content, targetLang, slug } = await request.json();

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{
                role: "system",
                content: `You are a professional translator. Translate to ${langName}.

Rules:
- Preserve all Markdown formatting
- Keep code blocks unchanged
- Keep technical terms in original form when appropriate
- Do not add explanations
- Return only the translated content`
            }, {
                role: "user",
                content
            }],
            max_tokens: 4096,
            temperature: 0.3,
        }),
    });

    const data = await response.json();
    return Response.json({ translated: data.choices[0].message.content });
}
```

### 5. Smart Language Detection

The frontend auto-detects the original language to set the correct default:

```javascript
function detectLanguage(text) {
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const totalChars = text.length;
    if (chineseChars / totalChars > 0.3) return 'zh';
    return 'en';
}
```

## Key Design Decisions

1. **Translate Markdown, not HTML**: When available, I translate the raw Markdown source and re-render it. This preserves formatting better than translating rendered HTML.

2. **Low temperature (0.3)**: Translation needs consistency, not creativity. A low temperature produces more reliable results.

3. **Content hash for cache keys**: Using `slug_hash_lang` as the cache key ensures that if the original content changes, the translation cache is automatically invalidated.

4. **Optional KV binding**: The worker works without KV storage - it just won't have server-side caching. This makes development easier.

## Cost Analysis

Using `gpt-4o-mini` for translation:
- Average blog post: ~3000 tokens input, ~3000 tokens output
- Cost per translation: ~$0.003
- With caching, repeated requests are free

For a blog with moderate traffic, expect < $5/month in translation costs.

## Future Improvements

- [ ] Pre-translate popular posts at build time
- [ ] Add streaming for long articles
- [ ] Support RTL languages (Arabic) with proper CSS
- [ ] Add translation quality feedback

The complete implementation is in my [website repository](https://github.com/geyuxu/yuxu.ge).

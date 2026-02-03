---
date: 2026-01-28
tags: [ai, translation, cloudflare-workers, javascript, llm]
description: 使用 GPT-4o-mini 和 Cloudflare Workers 为静态博客添加实时 AI 翻译功能，支持 10 种语言，采用双层缓存策略。
---

# 为博客添加多语言 AI 翻译功能

在实现了 [RAG 驱动的 AI 助手](/blog/post.html?p=posts/2026/ai-assistant-rag)之后，我希望让博客内容能被全球读者访问。与其手动翻译每篇文章，我构建了一个按需 AI 翻译系统，支持 10 种语言。

## 目标

创建无缝的翻译体验：
- 按需将任何博客文章翻译成 10 种主要语言
- 保留 Markdown 格式（标题、代码块、链接）
- 缓存翻译结果以降低 API 成本
- 翻译时显示加载反馈

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     浏览器（前端）                               │
├─────────────────────────────────────────────────────────────────┤
│  语言选择器 ──▶ 检查 localStorage 缓存                          │
│         │                     │                                 │
│         │◀── 缓存命中 ────────┘                                 │
│         │                                                       │
│         ▼ 缓存未命中                                            │
│  POST /api/translate { content, targetLang, slug }              │
└─────────┼───────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│              Cloudflare Worker (/api/translate)                 │
│  ┌─────────────────┐        ┌─────────────────┐                 │
│  │  检查 KV 缓存   │───命中──▶│  返回缓存结果   │                 │
│  └────────┬────────┘        └─────────────────┘                 │
│           │ 未命中                                              │
│           ▼                                                     │
│  ┌─────────────────┐        ┌─────────────────┐                 │
│  │ 调用 OpenAI API │───────▶│ 存入 KV 缓存    │                 │
│  │  (gpt-4o-mini)  │        │ (30天 TTL)      │                 │
│  └─────────────────┘        └─────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

## 支持的语言

系统支持 10 种语言，覆盖全球大部分人口：

| 代码 | 语言 | 代码 | 语言 |
|------|----------|------|----------|
| en | English | fr | Français |
| zh | 中文 | de | Deutsch |
| ja | 日本語 | pt | Português |
| ko | 한국어 | ru | Русский |
| es | Español | ar | العربية |

## 实现

### 1. 语言选择器 UI

一个简洁的下拉菜单，出现在每篇博客文章上：

```html
<div class="lang-selector" id="lang-selector">
    <span class="lang-selector-label">
        <svg><!-- 翻译图标 --></svg>
        Language
    </span>
    <select class="lang-select" id="lang-select">
        <option value="en">🇺🇸 English</option>
        <option value="zh">🇨🇳 中文</option>
        <option value="ja">🇯🇵 日本語</option>
        <!-- ... 更多语言 -->
    </select>
    <button class="lang-original-btn" id="lang-original-btn">
        Show Original
    </button>
    <span class="lang-status" id="lang-status"></span>
</div>
```

### 2. 加载动画

翻译期间显示纯 CSS 旋转动画：

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

### 3. 双层缓存策略

为了降低 API 成本，我在两个层面实现了缓存：

**前端（localStorage）** - 7 天 TTL：
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

**后端（Cloudflare KV）** - 30 天 TTL：
```javascript
// 检查缓存
const cached = await env.TRANSLATIONS.get(cacheKey);
if (cached) {
    return Response.json({ translated: cached, cached: true });
}

// 翻译后缓存结果
await env.TRANSLATIONS.put(cacheKey, translated, {
    expirationTtl: 30 * 24 * 60 * 60
});
```

### 4. 翻译 API（Cloudflare Worker）

Worker 通过精心设计的提示词处理翻译请求：

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

### 5. 智能语言检测

前端自动检测原始语言以设置正确的默认值：

```javascript
function detectLanguage(text) {
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const totalChars = text.length;
    if (chineseChars / totalChars > 0.3) return 'zh';
    return 'en';
}
```

## 关键设计决策

1. **翻译 Markdown 而非 HTML**：在可用时，我翻译原始 Markdown 源码并重新渲染。这比翻译渲染后的 HTML 能更好地保留格式。

2. **低温度值（0.3）**：翻译需要一致性，而非创造性。低温度值能产生更可靠的结果。

3. **内容哈希作为缓存键**：使用 `slug_hash_lang` 作为缓存键确保原始内容变化时，翻译缓存自动失效。

4. **可选的 KV 绑定**：Worker 在没有 KV 存储的情况下也能工作——只是没有服务端缓存。这使开发更容易。

## 成本分析

使用 `gpt-4o-mini` 进行翻译：
- 平均博客文章：约 3000 tokens 输入，约 3000 tokens 输出
- 每次翻译成本：约 $0.003
- 有缓存后，重复请求免费

对于中等流量的博客，预计翻译成本每月不超过 $5。

## 未来改进

- [ ] 构建时预翻译热门文章
- [ ] 为长文章添加流式传输
- [ ] 支持 RTL 语言（阿拉伯语）的正确 CSS
- [ ] 添加翻译质量反馈

完整实现在我的[网站仓库](https://github.com/geyuxu/yuxu.ge)中。

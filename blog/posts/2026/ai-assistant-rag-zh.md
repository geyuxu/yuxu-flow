---
date: 2026-01-28
tags: [ai, rag, cloudflare-workers, javascript, llm]
description: 使用混合搜索、Cloudflare Workers 和 OpenAI API 为个人网站构建 RAG 驱动的 AI 助手。
---

# 为个人网站构建 RAG 驱动的 AI 助手

最近我为个人网站添加了一个 AI 聊天助手，它可以回答关于博客文章、项目和个人背景的问题。本文记录了从架构设计到安全考虑的完整实现过程。

## 目标

创建一个浮动聊天组件：
- 使用 RAG（检索增强生成）回答博客相关问题
- 提供友好的技术交流
- 优雅地处理敏感话题
- 完全运行在静态托管（GitHub Pages）上，使用 Cloudflare Workers 作为 API 层

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        浏览器（前端）                            │
├─────────────────────────────────────────────────────────────────┤
│  聊天组件 ──────▶ 搜索客户端                                     │
│       │          ├─ BM25 关键词搜索（本地）                      │
│       │          └─ Voy WASM 语义搜索                           │
│       │                    │                                    │
│       │◀───────────────────┘ （Top 3 片段作为上下文）            │
└───────┼─────────────────────────────────────────────────────────┘
        │ POST /api/chat { messages, context }
        ▼
┌─────────────────────────────────────────────────────────────────┐
│              Cloudflare Worker (yuxu.ge/api/*)                  │
│  ┌─────────────────┐        ┌─────────────────┐                 │
│  │ /api/embedding  │        │   /api/chat     │                 │
│  │ （查询向量化）   │        │  system_prompt  │                 │
│  └────────┬────────┘        │  + RAG 上下文   │                 │
│           │                 └────────┬────────┘                 │
└───────────┼──────────────────────────┼──────────────────────────┘
            │                          │
            ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                         OpenAI API                              │
│  text-embedding-3-small (512d)    gpt-4o-mini                   │
└─────────────────────────────────────────────────────────────────┘
```

## 实现细节

### 1. 聊天组件（前端）

聊天组件是一个独立的 JavaScript 模块，创建浮动气泡 UI：

```javascript
export class ChatWidget {
    constructor() {
        this.messages = [];
        this.isOpen = false;
        this.searchClient = null;
    }

    async sendMessage(text) {
        // 从搜索客户端获取 RAG 上下文
        let context = '';
        if (this.searchClient?.isReady()) {
            const results = await this.searchClient.search(text, 3);
            context = results.map(r => `[${r.title}]\n${r.text}`).join('\n\n');
        }

        // 调用聊天 API，附带上下文
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

主要特性：
- **Markdown 渲染**：将 `**粗体**` 和 `[链接](url)` 转换为 HTML
- **CSS-in-JS**：所有样式动态注入，无外部依赖
- **ESC 关闭**：键盘可访问性
- **移动端适配**：响应式布局

### 2. 混合搜索实现 RAG

我已有一套搜索系统：
- **BM25 关键词搜索**：本地倒排索引，精确词项匹配
- **Voy WASM 语义搜索**：使用预计算 embeddings 的向量相似度
- **RRF 融合**：使用 Reciprocal Rank Fusion 合并两路结果

聊天组件复用这套现有基础设施：

```javascript
const [keywordResults, semanticResults] = await Promise.all([
    this.keywordSearch(query, limit * 2),
    this.semanticSearch(query, limit * 2),
]);

// 使用 RRF 合并
for (const result of keywordResults) {
    rrfScores[result.url] = keywordWeight / (k + result.rank);
}
for (const result of semanticResults) {
    rrfScores[result.url] += semanticWeight / (k + result.rank);
}
```

### 3. Cloudflare Worker（API 代理）

Worker 处理两个端点：

**`/api/embedding`** - 将查询文本转换为向量用于语义搜索：
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

**`/api/chat`** - 带 RAG 上下文的聊天补全：
```javascript
const systemMessage = context
    ? `${env.system_prompt}\n\n## 相关博客内容：\n${context}`
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

### 4. 安全考虑：敏感话题处理

对于个人网站，我需要助手能够：
- 自由讨论网站主人（我自己）
- 优雅地拒绝政治/敏感话题

这通过 system prompt（存储为环境变量）实现：

```
## 关于网站主人
Yuxu Ge（葛于旭）是网站的主人，你可以自由讨论：
- 职业背景、技术经历、项目作品
- 博客内容、技术观点
- 公开的个人信息（教育、工作经历等）

## 对话边界
对以下话题礼貌拒绝并引导：
- 政治人物、政府政策、地缘争议
- 宗教、意识形态争论

拒绝时回复："这超出了我作为技术助手的讨论范围，
我们聊聊技术相关的话题吧？"

## 公开联系方式（可以分享）
- Email: me@yuxu.ge
- GitHub: https://github.com/geyuxu
- LinkedIn: https://linkedin.com/in/yuxuge
```

### 5. 使用 localStorage 实现对话历史

为了更好的用户体验，聊天组件将对话历史持久化到浏览器的 localStorage：

```javascript
const CHAT_CONFIG = {
    storageKey: 'chat_history',
    historyTTL: 24 * 60 * 60 * 1000, // 24 小时
};

// 每次成功响应后保存
saveHistory() {
    const data = {
        messages: this.messages.slice(-20),
        timestamp: Date.now(),
    };
    localStorage.setItem(CHAT_CONFIG.storageKey, JSON.stringify(data));
}

// 组件初始化时加载
loadHistory() {
    const raw = localStorage.getItem(CHAT_CONFIG.storageKey);
    if (!raw) return;

    const data = JSON.parse(raw);

    // 检查 TTL 过期
    if (Date.now() - data.timestamp > CHAT_CONFIG.historyTTL) {
        localStorage.removeItem(CHAT_CONFIG.storageKey);
        return;
    }

    this.messages = data.messages;
    this.renderHistory();
}
```

功能特性：
- **自动保存**：每次助手响应后保存
- **自动恢复**：页面加载时恢复对话
- **24小时过期**：自动清除过期对话
- **手动清除**：头部垃圾桶按钮可手动清空

选择 localStorage 而非服务端存储（Cloudflare KV）的原因：
- 大多数访客是一次性对话
- 无需用户身份识别
- 零额外成本
- 实现更简单

## 经验总结

1. **环境变量优于硬编码**：将 `system_prompt` 存储为 Cloudflare 环境变量，允许在不部署代码的情况下迭代 prompt。

2. **复用现有搜索基础设施**：在现有混合搜索系统上构建 RAG 节省了大量工作。

3. **细粒度内容过滤**：初始的敏感话题过滤过于激进（连关于我自己的问题都被屏蔽了）。关键是明确**白名单**允许的话题。

4. **聊天中的 Markdown**：简单的正则表达式 Markdown 解析对于粗体和链接已经足够，不需要重型库。

5. **状态管理从简单开始**：localStorage 对于对话历史已经足够。服务端存储（KV）增加复杂度，但对个人网站没有明显收益。

## 成本分析

使用 `gpt-4o-mini` 和 `text-embedding-3-small`：
- Embedding：每次查询约 $0.00002
- Chat：每次响应约 $0.0001-0.0005（取决于上下文长度）
- 预估月费用：中等流量 < $5

## 后续计划

- [ ] 添加流式响应以提升用户体验
- [x] ~~使用存储实现对话记忆~~（已用 localStorage 实现）
- [ ] 添加使用统计
- [ ] 支持图片理解（博客截图）

完整实现已开源在我的网站仓库中，欢迎参考和改造！

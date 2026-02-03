---
title: "Static Flow: 现代化静态网站生成器"
date: 2026-02-03
tags: [static-flow, introduction, deno]
description: "介绍 Static Flow —— 一个基于 Deno 构建的现代静态网站生成器"
---

# Static Flow: 现代化静态网站生成器

Static Flow 是一个基于 Deno 构建的现代静态网站生成器，编译后仅需一个约 34MB 的二进制文件即可运行。

## 为什么选择 Static Flow？

### 多格式内容支持

不同于传统静态网站生成器只支持 Markdown，Static Flow 支持多种内容格式：

- **Markdown** - 标准博客文章
- **Jupyter Notebook** - 数据科学和技术教程
- **LaTeX** - 学术论文和数学公式
- **Office 文档** - Word、Excel、PowerPoint
- **PDF** - 直接嵌入展示

### 智能搜索

内置混合搜索引擎，结合关键词搜索和语义搜索：

- **BM25 关键词搜索** - 即时响应，无需 API
- **语义搜索 (RAG)** - 基于 OpenAI Embeddings，理解查询意图
- **浏览器端向量搜索** - 使用 Voy WASM 引擎，保护隐私

### AI 助手

集成 AI 聊天助手，基于博客内容回答问题：

- 自动检索相关上下文
- 流式响应
- 本地历史记录

### 相册功能

完整的相册管理：

- HEIC 自动转换
- 智能压缩
- AI 生成描述
- 按日期和地点分组

## 快速开始

```bash
# 1. 编译工具
deno task compile

# 2. 复制示例网站
cp -r example ~/my-website
cd ~/my-website

# 3. 编辑配置
vim staticflow.config.yaml

# 4. 构建并预览
staticflow build
staticflow serve
```

## 配置说明

### sidebar-config.json

控制边栏和功能开关：

```json
{
  "name": "Your Name",
  "title": "Your Title",
  "search": true,
  "semanticSearch": true,
  "chat": true,
  "translation": false
}
```

### staticflow.config.yaml

核心构建配置：

```yaml
site:
  name: "My Blog"
  url: "https://example.com"

features:
  search: true
  vectorSearch: true
  gallery: true
```

## 开源计划

Static Flow 即将开源！我们正在：

1. 完善文档
2. 减少外部依赖
3. 添加更多主题
4. 编写测试用例

敬请期待！

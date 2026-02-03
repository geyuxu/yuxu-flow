---
title: "从 Shell 脚本到 Deno：Static Flow 的技术迁移"
date: 2026-02-03
tags: [static-flow, deno, typescript, migration]
description: "记录 Static Flow 从 Shell 脚本迁移到 Deno 平台的技术历程"
---

# 从 Shell 脚本到 Deno：Static Flow 的技术迁移

经过一夜的 vibe coding，我成功将 Static Flow 从混乱的 Shell 脚本迁移到了现代化的 Deno 平台。这篇文章记录了这次技术迁移的过程和思考。

## 迁移前的状态

最初的 Static Flow 是一个典型的"胶水代码"项目：

```
旧架构:
├── build.sh          # 主构建脚本
├── compress.sh       # 图片压缩
├── convert-heic.sh   # HEIC 转换
├── blog/
│   └── build.ts      # Node.js 脚本
└── 各种零散的脚本...
```

问题很明显：
- Shell 脚本难以维护和测试
- Node.js 和 Shell 混用，依赖管理混乱
- 跨平台兼容性差
- 没有类型安全

## 为什么选择 Deno？

### 1. 单文件可执行

Deno 可以将 TypeScript 项目编译成单个二进制文件：

```bash
deno compile --output staticflow --allow-all scripts/cli.ts
```

生成的 `staticflow` 二进制文件约 34MB，包含所有依赖，无需安装 Node.js 或 Deno 运行时。

### 2. 原生 TypeScript 支持

无需配置 tsconfig.json、babel 或 webpack，直接运行 TypeScript：

```typescript
// 直接导入，无需编译步骤
import { parse } from "@std/yaml";
import { join } from "@std/path";
```

### 3. 现代化标准库

Deno 的标准库设计精良：

```typescript
// 文件操作
await Deno.readTextFile("config.yaml");
await Deno.writeTextFile("output.json", data);

// HTTP 服务器
Deno.serve({ port: 8080 }, handler);
```

### 4. 安全沙箱

默认禁止文件、网络访问，需要显式授权：

```bash
deno run --allow-read --allow-write --allow-net script.ts
```

## 迁移过程

### 第一步：统一配置

创建 `staticflow.config.yaml` 作为单一配置源：

```yaml
site:
  name: "My Blog"
  url: "https://example.com"

paths:
  posts: "content/posts"
  photos: "content/photos"
  output: "dist"

features:
  search: true
  vectorSearch: true
  gallery: true

build:
  imageCompression: true
  maxImageWidth: 2000
```

### 第二步：重构脚本

将所有 Shell 脚本转换为 TypeScript 模块：

| 旧文件 | 新文件 |
|--------|--------|
| `compress.sh` | `scripts/compress-photos.ts` |
| `convert-heic.sh` | `scripts/convert-heic.ts` |
| `build.sh` | `scripts/cli.ts` |

### 第三步：统一入口

创建 CLI 工具统一所有命令：

```typescript
// scripts/cli.ts
const commands = {
  build: () => runBuild(options),
  serve: () => startServer(port),
  setup: () => checkDependencies(),
  clean: () => cleanGenerated(),
};
```

### 第四步：配置化功能

将硬编码的功能改为可配置：

```json
// sidebar-config.json
{
  "search": true,
  "semanticSearch": true,
  "chat": true,
  "translation": false,
  "embeddingApi": "https://api.example.com/embedding"
}
```

## 技术亮点

### WASM 向量搜索

使用 Voy 实现浏览器端向量搜索：

```typescript
import { Voy } from "voy-search";

const index = Voy.deserialize(indexData);
const results = index.search(embedding, 10);
```

需要正确配置 MIME 类型：

```typescript
const mimeTypes = {
  ".wasm": "application/wasm",  // 关键！
};
```

### 混合搜索架构

```
用户查询
    │
    ├─→ BM25 关键词搜索 (即时)
    │         │
    │         ▼
    │   关键词结果 ──┐
    │               │
    └─→ 语义搜索 ───┤
          │         │
          ▼         ▼
    语义结果 ──→ RRF 融合 ──→ 最终结果
```

### 渐进式加载

先显示关键词结果，再异步加载语义结果：

```javascript
// 立即显示关键词结果
const keywordResults = client.searchKeywordOnly(query);
showResults(keywordResults);

// 异步加载语义结果
const semanticResults = await client.semanticSearch(query);
mergeResults(semanticResults);
```

## 仍需外部依赖

目前还有一些功能依赖外部程序：

| 功能 | 依赖 | 未来计划 |
|------|------|----------|
| 图片压缩 | ImageMagick | WASM 方案 |
| HEIC 转换 | ImageMagick | libheif WASM |
| Office 转 PDF | LibreOffice | 考虑中 |
| LaTeX 编译 | pdflatex | TeX WASM |

## 总结

这次迁移的收获：

1. **代码质量提升** - TypeScript 类型系统消除了大量 bug
2. **部署简化** - 单文件分发，无需配置环境
3. **跨平台** - 同一份代码运行于 macOS、Linux、Windows
4. **可维护性** - 模块化结构，易于扩展

Deno 证明了它是构建现代 CLI 工具的绝佳选择。

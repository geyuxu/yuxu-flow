# StaticFlow 产品化计划书

> 基于 yuxu.ge 博客系统的产品化方案

## 1. 产品定位

### 1.1 产品名称
**StaticFlow** — AI-Native 静态站点生成器

### 1.2 一句话描述
面向开发者和知识工作者的下一代静态博客系统，内置混合搜索、AI 助手和多格式内容支持。

### 1.3 目标用户
| 用户群体 | 痛点 | StaticFlow 解决方案 |
|---------|------|-------------------|
| 技术博主 | Markdown 单一、搜索需付费 | 40+ 格式 + 免费内置搜索 |
| 数据科学家 | Jupyter 发布困难 | 原生 Notebook 渲染 |
| 知识管理者 | 需要多种工具 | 一站式发布平台 |
| 独立开发者 | 不想依赖框架 | 零框架锁定 |

### 1.4 核心差异化
```
传统 SSG (Hugo/Jekyll/Astro)          StaticFlow
─────────────────────────────────────────────────────
Markdown Only                    →    40+ 格式原生支持
需要 Algolia/MeiliSearch         →    内置混合搜索 (BM25 + 向量)
无 AI 功能                        →    RAG Chat + 自动翻译
框架锁定                          →    纯 Vanilla JS
搜索按量付费                      →    一次构建，永久免费
```

---

## 2. 技术方案

### 2.1 核心决策：保持 Shell 脚本

经过对多种技术方案的评估（Go、Rust、Deno、Node.js），决定采用**渐进式产品化**策略：

```
┌─────────────────────────────────────────────────────────────┐
│  为什么不用 Go/Rust/Deno 重写？                              │
├─────────────────────────────────────────────────────────────┤
│  • 单文件分发无法完整支持 Office/LaTeX/视频处理               │
│  • HEIC 等格式的纯原生方案不成熟                             │
│  • 重写成本高，收益不确定                                    │
│  • 保持功能完整性比分发便利性更重要                           │
└─────────────────────────────────────────────────────────────┘

结论：保持 Shell + Node.js 方案，用户自行安装依赖
```

### 2.2 系统架构
```
┌─────────────────────────────────────────────────────────────┐
│                        StaticFlow                            │
├─────────────────────────────────────────────────────────────┤
│  Content Layer                                               │
│  ├── Markdown (.md)                                         │
│  ├── Jupyter Notebook (.ipynb)                              │
│  ├── Office Documents (.docx, .xlsx, .pptx)                 │
│  ├── PDF, LaTeX, Code files                                 │
│  └── Media (images, video, audio)                           │
├─────────────────────────────────────────────────────────────┤
│  Build Pipeline (Shell + Node.js)                           │
│  ├── Content Discovery & Metadata Generation                │
│  ├── Search Index Builder (BM25 + Vector Embeddings)        │
│  ├── Image Processing (HEIC→JPG, Compression)               │
│  ├── Static HTML Generation (SEO)                           │
│  └── Medium Export Generation                               │
├─────────────────────────────────────────────────────────────┤
│  Runtime Layer (Browser)                                     │
│  ├── Dynamic Content Viewer                                 │
│  ├── Hybrid Search Client                                   │
│  ├── AI Chat Widget (RAG)                                   │
│  └── Translation Service                                    │
├─────────────────────────────────────────────────────────────┤
│  Edge Layer (Cloudflare Workers)                            │
│  ├── OpenAI API Proxy                                       │
│  ├── Translation Cache (KV)                                 │
│  └── CORS Protection                                        │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 技术栈
- **前端**: Vanilla JavaScript (无框架依赖)
- **构建**: Shell Scripts + Node.js
- **搜索**: Voy WASM (向量) + 自研 BM25
- **AI**: OpenAI API (text-embedding-3-small, GPT-4)
- **边缘计算**: Cloudflare Workers + KV
- **部署**: GitHub Pages / 任意静态托管

### 2.4 平台支持策略

```
MVP 阶段               有用户后                需求明确后
─────────────────────────────────────────────────────────────
macOS + Linux          + Windows 脚本          按需重构
Shell 脚本             PowerShell/WSL          Docker 或其他
用户自装依赖           安装脚本辅助            自动化方案
```

| 阶段 | 平台支持 | 依赖管理 |
|------|---------|---------|
| MVP | macOS, Linux | 用户自行安装，文档说明 |
| v1.1 | + Windows (WSL/PowerShell) | 提供安装检测脚本 |
| v2.0 | 按需决定 | Docker 镜像或重构 |

### 2.5 依赖安装方案

**setup.sh (macOS/Linux)**
```bash
#!/bin/bash
echo "=== StaticFlow 依赖检测 ==="

check() {
  if command -v $1 &>/dev/null; then
    echo "✓ $1"
    return 0
  else
    echo "✗ $1 — $2"
    return 1
  fi
}

MISSING=0

# 必需依赖
check node    "brew install node / apt install nodejs"    || MISSING=1
check npm     "随 node 一起安装"                           || MISSING=1

# 图片处理
check convert "brew install imagemagick / apt install imagemagick" || MISSING=1

# 可选依赖
echo ""
echo "=== 可选依赖 (按需安装) ==="
check ffmpeg      "brew install ffmpeg (视频处理)"
check libreoffice "brew install --cask libreoffice (Office 文档)"
check pdflatex    "brew install --cask mactex (LaTeX 文档)"

if [ $MISSING -eq 1 ]; then
  echo ""
  echo "请安装上述必需依赖后重试"
  exit 1
fi

echo ""
echo "✓ 所有必需依赖已安装，运行 ./build.sh 开始构建"
```

**备选：Docker 一键运行**
```bash
# 不想装依赖的用户
docker run --rm -v $(pwd):/site ghcr.io/staticflow/staticflow build
```

---

## 3. 产品化路线图

### Phase 1: MVP 开源 (1-2周)

#### 3.1.1 最小改动清单
- [ ] 提取硬编码配置到 `staticflow.config.yaml`
- [ ] 编写 `setup.sh` 依赖检测脚本
- [ ] 整理目录结构，分离内容和代码
- [ ] 编写 README.md (英文)
- [ ] 编写 INSTALL.md 安装指南
- [ ] 创建 GitHub template 仓库

#### 3.1.2 配置文件
```yaml
# staticflow.config.yaml
site:
  name: "My Blog"
  url: "https://example.com"
  language: ["zh", "en"]

paths:
  posts: "content/posts"
  photos: "content/photos"
  output: "dist"

features:
  search: true
  vectorSearch: true  # 需要 OPENAI_API_KEY
  chat: true
  translation: true
  gallery: true

build:
  imageCompression: true
  staticHtml: true      # SEO 预渲染
  mediumExport: false   # Medium.com 导出
```

#### 3.1.3 目录结构
```
staticflow/                    # 或 my-blog/
├── staticflow.config.yaml
├── setup.sh                   # 依赖检测
├── build.sh                   # 主构建脚本
├── content/
│   ├── posts/
│   │   └── 2026/
│   │       └── hello-world.md
│   └── photos/
│       └── 2026/
├── scripts/                   # 构建脚本
│   ├── build-posts-json.js
│   ├── build-static.js
│   ├── index-builder.mjs
│   └── ...
├── themes/
│   └── default/
│       ├── index.html
│       ├── blog/
│       └── gallery/
├── dist/                      # 构建输出
└── README.md
```

#### 3.1.4 使用流程
```bash
# 1. 克隆模板
git clone https://github.com/staticflow/staticflow-template my-blog
cd my-blog

# 2. 检测依赖
./setup.sh

# 3. 添加内容
cp ~/my-post.md content/posts/2026/

# 4. 构建
./build.sh

# 5. 本地预览
python3 -m http.server -d dist

# 6. 部署 (GitHub Pages)
./build.sh --push
```

---

### Phase 2: 开源发布 (1周)

#### 3.2.1 发布渠道
| 平台 | 目标 |
|------|------|
| GitHub | 开源仓库 + template |
| Hacker News | Show HN 帖子 |
| Reddit | r/webdev, r/selfhosted |
| 掘金/V2EX | 中文社区 |
| Twitter/X | 技术圈传播 |

#### 3.2.2 发布内容
- README：快速开始 + 功能展示
- 博客文章："我为什么放弃 Hugo 自建博客系统"
- Demo 站点：staticflow.dev

---

### Phase 3: 用户反馈驱动 (1-2月)

#### 3.3.1 收集反馈
- GitHub Issues / Discussions
- 关注 Windows 用户需求量
- 收集常见安装问题

#### 3.3.2 按需迭代
| 反馈 | 应对 |
|------|------|
| Windows 用户多 | 添加 PowerShell 脚本或 WSL 指南 |
| 依赖安装困难 | 提供 Docker 镜像 |
| 需要更多主题 | 开放主题贡献 |
| 性能问题 | 优化构建脚本 |

#### 3.3.3 关键指标
| 指标 | MVP 目标 | 说明 |
|------|---------|------|
| GitHub Stars | 200+ | 基础关注度 |
| Fork/Clone | 50+ | 实际使用意向 |
| Issues | 20+ | 用户参与 |
| Windows 相关 Issue | 观察 | 决定是否投入 |

---

### Phase 4: 按需扩展 (基于验证结果)

**如果 Windows 需求强烈：**
```
选项 A: PowerShell 脚本
选项 B: WSL 安装指南
选项 C: Docker 镜像 (推荐)
选项 D: 用 Node.js 重写构建脚本 (大改动)
```

**如果用户量可观：**
- 主题系统
- 插件系统
- 商业化探索

---

## 4. 技术方案对比 (决策记录)

### 4.1 构建工具语言评估

| 语言 | 单文件分发 | HEIC | Office/LaTeX | 开发成本 | 结论 |
|------|-----------|------|--------------|---------|------|
| Go | ✓ | 勉强 | ✗ | 中 | 功能不完整 |
| Rust | ✓ | ✗ | ✗ | 高 | 功能不完整 |
| Deno | ✓ | ✓ | ✗ | 中 | 功能不完整 |
| Node.js | ✗ | ✓ | ✗ | 低 | 分发不便 |
| **Shell** | - | ✓ | ✓ | **零** | **功能完整** |

### 4.2 分发方案评估

| 方案 | 用户体验 | 功能完整性 | 维护成本 |
|------|---------|-----------|---------|
| 单文件 (Go/Deno) | 极好 | 差 | 高 |
| npm 包 | 中 | 中 | 中 |
| Docker | 中 | **完整** | 低 |
| **Shell + 文档** | 一般 | **完整** | **最低** |

### 4.3 最终决策

```
保持 Shell 脚本方案

理由：
1. 功能完整性 > 分发便利性
2. 目标用户是开发者，能接受装依赖
3. 先验证产品价值，再优化体验
4. 可随时提供 Docker 作为备选
```

---

## 5. 竞品分析

### 5.1 竞品对比矩阵

| 特性 | Hugo | Jekyll | Astro | Gatsby | **StaticFlow** |
|------|------|--------|-------|--------|----------------|
| 构建速度 | 极快 | 慢 | 快 | 慢 | 快 |
| 学习曲线 | 中 | 低 | 中 | 高 | **低** |
| 内容格式 | MD | MD | MD | MD | **40+** |
| 内置搜索 | 无 | 无 | 无 | 无 | **混合搜索** |
| AI 功能 | 无 | 无 | 无 | 无 | **RAG + 翻译** |
| 框架依赖 | Go | Ruby | Node | React | **无** |
| Notebook 支持 | 无 | 无 | 插件 | 插件 | **原生** |
| 离线搜索 | 无 | 无 | 无 | 无 | **支持** |

### 5.2 竞品定价参考
| 产品 | 免费版 | 付费版 |
|------|--------|--------|
| Algolia | 10K 请求/月 | $29+/月 |
| Vercel | 个人免费 | $20+/月 |
| Netlify | 个人免费 | $19+/月 |
| Ghost Pro | 无 | $9+/月 |

---

## 6. 风险与应对

### 6.1 技术风险
| 风险 | 概率 | 影响 | 应对策略 |
|------|------|------|---------|
| OpenAI API 价格上涨 | 中 | 中 | 支持替代模型 (Ollama 本地) |
| Cloudflare Worker 限制 | 低 | 中 | 支持其他 Edge 平台 |
| 浏览器兼容性 | 低 | 低 | 渐进增强设计 |

### 6.2 市场风险
| 风险 | 概率 | 影响 | 应对策略 |
|------|------|------|---------|
| 用户量不足 | 中 | 高 | 聚焦垂直人群 (数据科学家) |
| 大厂进入 | 中 | 中 | 保持开源免费，社区驱动 |
| 维护负担 | 中 | 中 | 建立贡献者社区 |

---

## 7. 资源需求

### 7.1 Phase 1 (MVP 开源)
| 任务 | 工时估算 | 说明 |
|------|---------|------|
| 配置外部化 | 1天 | 提取硬编码到 YAML |
| setup.sh | 0.5天 | 依赖检测脚本 |
| 目录结构整理 | 0.5天 | 分离内容和代码 |
| README/INSTALL | 1天 | 英文文档 |
| GitHub template | 0.5天 | 创建模板仓库 |
| **总计** | **3-4天** | |

### 7.2 持续成本
| 项目 | 月成本 |
|------|--------|
| 域名 (staticflow.dev) | ~$1 |
| GitHub Pages 托管 | $0 |
| Cloudflare Worker | $0 (免费额度) |
| OpenAI API (Demo) | ~$5-10 |

---

## 8. 成功标准

### 8.1 MVP 目标 (1个月)
- [ ] GitHub template 仓库上线
- [ ] README + INSTALL 文档完成
- [ ] 至少 1 个外部用户成功部署
- [ ] 收集首批反馈

### 8.2 短期目标 (3个月)
- [ ] GitHub 200+ Stars
- [ ] 5+ 真实用户站点
- [ ] 明确 Windows 需求优先级

### 8.3 中期目标 (6个月，按需)
- [ ] 根据反馈决定是否投入多平台支持
- [ ] 根据用户量决定是否优化安装体验
- [ ] 探索社区贡献模式

---

## 9. 下一步行动

### 立即执行 (本周)
1. [ ] 提取配置到 `staticflow.config.yaml`
2. [ ] 编写 `setup.sh` 依赖检测脚本
3. [ ] 整理目录结构

### 近期执行 (1-2周)
1. [ ] 编写 README.md (英文)
2. [ ] 编写 INSTALL.md 安装指南
3. [ ] 创建 GitHub template 仓库
4. [ ] 发布并收集反馈

---

## 附录: 现有系统亮点

### A. 混合搜索系统
- BM25 关键词搜索 (即时响应，离线可用)
- 向量语义搜索 (OpenAI embeddings + Voy WASM)
- Reciprocal Rank Fusion 融合算法
- 中英双语分词支持

### B. 多格式内容渲染
- Markdown (marked.js + Prism.js)
- Jupyter Notebook (自研渲染器)
- Office 文档 (mammoth.js + SheetJS)
- PDF, LaTeX, 代码文件

### C. AI 功能集成
- RAG Chat (基于博客内容回答问题)
- 多语言翻译 (10+ 语言)
- Cloudflare KV 缓存优化

### D. 图片处理管道
- HEIC/RAW → JPG 自动转换
- 智能压缩 (带缓存)
- 时间线相册 UI

---

*文档版本: v1.1*
*创建日期: 2026-02-02*
*更新日期: 2026-02-02*
*作者: Yuxu Ge*

---

## 变更记录

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| v1.0 | 2026-02-02 | 初版，计划用 Deno/Go 重写 |
| v1.1 | 2026-02-02 | 改为渐进式方案：保持 Shell，按需扩展 |

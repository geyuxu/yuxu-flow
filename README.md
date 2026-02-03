# YXFlow

A modern static site generator built with Deno. Zero runtime dependencies - compiles to a single binary.

## Features

- **Single Binary** - No Node.js, no npm, just one executable
- **Multi-format Content** - Markdown, Jupyter Notebooks, PDF, LaTeX, Office documents
- **Hybrid Search** - BM25 keyword + semantic vector search (WASM)
- **AI Powered** - RAG chat assistant, auto-translation, photo descriptions
- **Photo Gallery** - HEIC conversion, smart compression
- **Fast Deploy** - Git worktree integration, 3-second deploys

## Quick Start

```bash
# Install
curl -fsSL https://github.com/geyuxu/yuxu-flow/releases/download/latest/install.sh | sh

# Create site
yxflow init my-blog
cd my-blog

# Build and preview
yxflow build
yxflow serve

# Deploy to GitHub Pages
yxflow deploy
```

## CLI Commands

```bash
yxflow build              # Full build
yxflow build --static     # Static HTML only
yxflow build --photos     # Process photos only
yxflow serve              # Dev server at :8080
yxflow deploy             # Deploy to gh-pages
yxflow deploy --build     # Build + deploy
yxflow setup              # Check dependencies
```

## Configuration

```yaml
# staticflow.config.yaml
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
  chat: false
```

## Project Structure

```
my-blog/
├── content/
│   ├── posts/           # Blog posts (md, ipynb, pdf, tex...)
│   └── photos/          # Photo albums
├── themes/default/      # HTML templates
├── static/              # Favicon, CNAME, etc.
├── dist/                # Build output (gh-pages worktree)
└── staticflow.config.yaml
```

## Supported Formats

| Format | Extension | Preview |
|--------|-----------|---------|
| Markdown | `.md` | Full render |
| Jupyter Notebook | `.ipynb` | Full render |
| PDF | `.pdf` | Embedded viewer |
| LaTeX | `.tex` | PDF preview |
| Office | `.docx`, `.xlsx`, `.pptx`, `.odt` | PDF preview |
| Images | `.jpg`, `.png`, `.gif`, `.webp`, `.svg` | Gallery |
| Video | `.mp4`, `.webm` | Player |
| Audio | `.mp3`, `.wav`, `.ogg` | Player |
| Code | `.py`, `.js`, `.ts`, `.go`, etc. | Syntax highlight |

## Development

```bash
# Clone
git clone https://github.com/geyuxu/yuxu-flow.git
cd static-flow

# Run directly
deno run -A scripts/cli.ts build

# Compile binary
deno task compile
```

## External Dependencies (Optional)

Some features require external programs:

| Feature | Dependency | Install |
|---------|------------|---------|
| Image compression | ImageMagick | `brew install imagemagick` |
| HEIC conversion | ImageMagick | `brew install imagemagick` |
| Office → PDF | LibreOffice | `brew install --cask libreoffice` |
| LaTeX → PDF | pdflatex | `brew install --cask mactex-no-gui` |

## License

MIT

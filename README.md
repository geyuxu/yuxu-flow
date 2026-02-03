# Static Flow

A modern static site generator built with Deno. Compiles to a single binary (~122MB).

## Features

- **Multi-format Content**: Markdown, Jupyter Notebooks, PDF, Office documents (DOCX/XLSX/PPTX/ODT), LaTeX
- **Photo Gallery**: HEIC/HEIF conversion, smart compression, AI-generated descriptions
- **Hybrid Search**: BM25 keyword search + semantic vector search (OpenAI embeddings + Voy WASM)
- **AI Assistant**: RAG-powered chat widget with streaming responses
- **Medium Export**: Convert posts to Medium-compatible HTML with GitHub Gists for code blocks
- **Single Binary**: No runtime dependencies after compilation

## Project Structure

```
static-flow/
├── scripts/           # Build tools (TypeScript)
├── example/           # Example site template
│   ├── content/       # User content (posts, photos)
│   ├── themes/        # HTML templates & components
│   ├── dist/          # Build output
│   └── staticflow.config.yaml
├── docs/              # GitHub Pages (built from example)
├── build.sh           # One-click build script
└── deno.json          # Deno configuration
```

## Quick Start

```bash
# 1. Build and install
./build.sh --compile

# 2. Create your website
cp -r example ~/my-website
cd ~/my-website

# 3. Edit configuration
vim staticflow.config.yaml
vim sidebar-config.json

# 4. Build and preview
staticflow build
staticflow serve
```

## CLI Commands

```bash
staticflow build              # Full build (photos + blog + search)
staticflow build --photos     # Process photos only
staticflow build --static     # Static HTML only
staticflow build --medium     # Medium export only
staticflow build --push       # Build and git push
staticflow serve              # Dev server at :8080
staticflow serve --port=3000  # Custom port
staticflow setup              # Check dependencies
staticflow clean              # Clean generated files
staticflow init               # Initialize new project
```

## Site Structure

```
my-website/
├── staticflow.config.yaml    # Site configuration
├── sidebar-config.json       # Sidebar links & features
├── home-config.json          # Homepage sections
├── content/
│   ├── posts/               # Blog posts (md, ipynb, pdf, tex, odt...)
│   └── photos/              # Photo albums (YYYY/YYYYMMDD-Location/)
├── themes/
│   └── default/             # Theme files
│       ├── index.html       # Homepage template
│       ├── blog/            # Blog templates
│       ├── gallery/         # Gallery template
│       ├── components/      # JS components (sidebar, search, chat)
│       ├── lib/             # Voy WASM search library
│       └── assets/          # Favicon, avatar, etc.
└── dist/                    # Build output (deploy this)
```

## Configuration

### staticflow.config.yaml

```yaml
site:
  name: "My Blog"
  url: "https://example.com"
  author: "Your Name"
  language: ["en"]

paths:
  posts: "content/posts"
  photos: "content/photos"
  output: "dist"
  theme: "themes/default"

features:
  search: true
  vectorSearch: true    # Requires OPENAI_API_KEY
  gallery: true
  mediumExport: false

build:
  imageCompression: true
  maxImageWidth: 2000
  imageQuality: 85
```

### sidebar-config.json

```json
{
  "name": "Your Name",
  "title": "Your Title",
  "avatar": "/assets/photo.jpg",
  "email": "you@example.com",
  "search": true,
  "semanticSearch": true,
  "chat": true,
  "links": [
    { "type": "github", "url": "https://github.com/you", "label": "GitHub" },
    { "type": "blog", "url": "/blog/", "label": "Blog" }
  ]
}
```

## Environment Variables

```bash
# Vector search & AI features (OpenAI)
export OPENAI_API_KEY="sk-..."

# Medium export with GitHub Gists
export GITHUB_TOKEN_CREATE_GIST="ghp-..."
```

## External Dependencies

### Required

| Dependency | Version | Purpose |
|------------|---------|---------|
| **Deno** | >= 1.40 | Runtime & compilation |

### Optional (Feature-dependent)

| Dependency | Purpose | Install |
|------------|---------|---------|
| **ImageMagick** | Photo compression, HEIC conversion | `brew install imagemagick` / `apt install imagemagick` |
| **LibreOffice** | Office docs to PDF (DOCX, XLSX, PPTX, ODT, ODS, ODP) | `brew install --cask libreoffice` / `apt install libreoffice` |
| **pdflatex** | LaTeX to PDF | `brew install --cask mactex-no-gui` / `apt install texlive-latex-base` |
| **Chrome/Chromium** | Table to PNG for Medium export | Usually pre-installed |

### External APIs (Optional)

| API | Purpose | Required For |
|-----|---------|--------------|
| **OpenAI API** | Embeddings for semantic search, AI descriptions | `vectorSearch`, `chat`, AI photo descriptions |
| **GitHub API** | Create Gists for long code blocks | `mediumExport` with code blocks > 15 lines |

Run `staticflow setup` to check installed dependencies.

## Supported Content Formats

| Format | Extension | Features |
|--------|-----------|----------|
| Markdown | `.md` | Full support with frontmatter |
| Jupyter Notebook | `.ipynb` | Code cells, outputs, images |
| PDF | `.pdf` | Embedded viewer |
| LaTeX | `.tex` | Converts to PDF (requires pdflatex) |
| Word | `.docx` | Converts to PDF (requires LibreOffice) |
| Excel | `.xlsx` | Converts to PDF |
| PowerPoint | `.pptx` | Converts to PDF |
| OpenDocument | `.odt`, `.ods`, `.odp` | Converts to PDF |
| Images | `.jpg`, `.png`, `.gif`, `.webp`, `.svg` | Direct display |
| Code | `.py`, `.js`, `.ts`, `.go`, etc. | Syntax highlighted |

## Development

```bash
# Run from source
cd example
deno run -A ../scripts/cli.ts build
deno run -A ../scripts/cli.ts serve

# Compile to binary
deno compile -A --output staticflow scripts/cli.ts

# Or use build script
./build.sh --compile
```

## Deployment

### GitHub Pages

1. Build site: `staticflow build`
2. Copy `dist/` contents to `docs/` or deploy branch
3. Enable GitHub Pages from repository settings

### Other Platforms

The `dist/` directory contains static files that can be deployed to any static hosting:
- Netlify
- Vercel
- Cloudflare Pages
- AWS S3 + CloudFront

## License

MIT

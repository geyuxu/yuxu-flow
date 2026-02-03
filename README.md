# yuxu.ge

Personal website for Yuxu Ge.

## Quick Start

```bash
# One-click setup (installs dependencies)
./setup.sh

# Start local server
python3 -m http.server 8080

# Build site
./build.sh
```

## Features

- **Multi-format Blog**: Supports Markdown, Jupyter Notebooks, PDF, Word, Excel, PowerPoint, TXT, CSV
- **Vector Search**: Hybrid search with semantic + full-text capabilities
- **Photo Gallery**: Timeline-based gallery with album support
- **Client-side Rendering**: No server required, works on any static hosting

## Structure

```
├── index.html              # Home page
├── blog/                   # Blog system
│   ├── index.html          # Blog list with search
│   ├── post.html           # Dynamic post viewer (multi-format)
│   ├── posts.json          # Post metadata (generated)
│   ├── posts/              # Post files (any supported format)
│   ├── build-posts-json.js # Generate posts.json
│   ├── build-pptx-pdf.js   # Convert PPTX to PDF
│   ├── static/             # Static HTML (generated)
│   └── medium/             # Medium-friendly HTML (generated)
├── gallery/                # Photo gallery
│   ├── index.html          # Gallery with timeline
│   └── photos.json         # Album metadata (generated)
├── photos/                 # Photo albums
│   └── YYYY/YYYYMMDD-Location/
│       ├── *.JPG
│       └── description.md  # Album description (optional)
├── components/             # Shared components
│   └── sidebar.js          # Sidebar (injected via JS)
├── scripts/                # Build scripts
│   ├── convert-heic.sh     # HEIC to JPG conversion
│   └── compress-photos.sh  # Image compression
└── setup.sh                # One-click setup script
```

## Development

```bash
python3 -m http.server 8080
```

## Build

```bash
./build.sh           # Build all (photos + blog + gallery + search index)
./build.sh --static  # Static HTML only
./build.sh --medium  # Medium HTML only
./build.sh --photos  # Process photos only (convert HEIC + compress)

./clear.sh           # Clean generated files
```

### npm Scripts

```bash
npm run build          # Full build (same as ./build.sh)
npm run build:blog     # Build blog (PPTX conversion + posts.json)
npm run build:pptx     # Convert PPTX to PDF only
npm run build:posts    # Generate posts.json only
npm run build:photos   # Generate photos.json only
npm run build:search   # Build vector search index
```

### Environment Variables

```bash
OPENAI_API_KEY=xxx ./build.sh           # Enable vector search
GITHUB_TOKEN_CREATE_GIST=xxx ./build.sh # Enable code gists
```

## Gallery

Photo albums are organized by date:

```
photos/2026/20260120-Leeds/
├── A7C00267.JPG
├── A7C00274.JPG
└── description.md    # Optional album description
```

Run `./build.sh` to regenerate `gallery/photos.json`.

### Convert HEIC/HIF/ARW to JPG

```bash
./scripts/convert-heic.sh           # Convert all HEIC/HIF/ARW to JPG
./scripts/convert-heic.sh --dry-run # Preview only
```

Uses macOS `sips` (built-in) or ImageMagick. ARW (Sony RAW) requires ImageMagick.

### Compress Photos

```bash
./scripts/compress-photos.sh           # Compress new photos (uses cache)
./scripts/compress-photos.sh --dry-run # Preview only
./scripts/compress-photos.sh --force   # Ignore cache, reprocess all
```


Uses cache file (`.compress-cache`) to skip already processed images. Requires ImageMagick: `brew install imagemagick`

## Blog Posts

### Supported Formats

| Format | Extension | Rendering |
|--------|-----------|-----------|
| Markdown | `.md` | marked.js + Prism.js + KaTeX |
| Jupyter Notebook | `.ipynb` | Native renderer with code cells |
| PDF | `.pdf` | Native browser viewer |
| Word | `.docx` | mammoth.js |
| Excel | `.xlsx` | SheetJS (xlsx) |
| PowerPoint | `.pptx` | PDF preview (via LibreOffice) |
| CSV | `.csv` | SheetJS table view |
| Text | `.txt` | Plain text |
| **Images** | `.jpg`, `.png`, `.gif`, `.webp`, `.svg` | Native `<img>` |
| **Video** | `.mp4`, `.webm` | HTML5 `<video>` |
| **Audio** | `.mp3`, `.wav`, `.ogg` | HTML5 `<audio>` |
| **JSON** | `.json` | Syntax highlighted |
| **HTML** | `.html` | iframe embed |
| **Code** | `.py`, `.js`, `.ts`, `.go`, `.java`, `.rs`, `.cpp`, `.c`, `.rb`, `.php`, `.sh` | Prism.js syntax highlighting |
| **XML/YAML** | `.xml`, `.yaml`, `.yml` | Syntax highlighted |
| **LaTeX** | `.tex` | Source view with highlighting |
| **RTF** | `.rtf` | Download only |

### Creating Posts

**Markdown** - Create in `blog/posts/YYYY/` with YAML frontmatter:

```markdown
---
date: 2026-01-26
tags: [python, backend]
description: Optional description
---
# Post Title

Content...
```

**Other formats** - Use date prefix in filename: `YYYYMMDD-title.ext`

```
blog/posts/2026/
├── my-post.md              # Requires date in frontmatter
├── 20260126-slides.pptx    # Date from filename
└── 20260126-data.xlsx      # Date from filename
```

### PowerPoint Preview

PowerPoint files are converted to PDF for browser preview:

```bash
# Manual conversion
npm run build:pptx

# Requires LibreOffice (one-time install)
# macOS:  brew install --cask libreoffice
# Linux:  sudo apt install libreoffice
```

When both `.pptx` and `.pdf` exist, the PDF is used for preview and PPTX for download.

Run `./build.sh` to regenerate `blog/posts.json`.

## Dependencies

### Required

- **Node.js** >= 18.0.0
- **npm** packages (auto-installed):
  - `voy-search` - Vector search engine

### Optional (for full functionality)

| Tool | Purpose | Install |
|------|---------|---------|
| LibreOffice | PPTX to PDF conversion | `brew install --cask libreoffice` |
| ImageMagick | Photo compression & RAW conversion | `brew install imagemagick` |
| OpenAI API | Vector search embeddings | Set `OPENAI_API_KEY` |
| GitHub Token | Code gists in static HTML | Set `GITHUB_TOKEN_CREATE_GIST` |

### CDN Libraries (loaded at runtime)

- marked.js - Markdown rendering
- Prism.js - Code syntax highlighting
- KaTeX - Math rendering
- mammoth.js - Word document rendering
- SheetJS (xlsx) - Excel/CSV rendering

## SVG to PNG

```bash
# ImageMagick
magick input.svg output.png
magick -density 300 input.svg -resize 512x512 output.png

# Inkscape
inkscape input.svg -o output.png -w 512

# librsvg
rsvg-convert -w 512 -h 512 input.svg -o output.png
```

Install: `brew install imagemagick inkscape librsvg`
# static-flow
# static-flow
# static-flow

# Static Flow

A modern static site generator built with Deno. Create blogs, photo galleries, and documentation with markdown, Jupyter notebooks, and more.

## Features

- **Blog Engine**: Markdown posts with syntax highlighting, math support, and automatic TOC
- **Photo Gallery**: HEIC to JPG conversion, automatic compression, AI-powered descriptions
- **Vector Search**: OpenAI embeddings for semantic search across your content
- **Medium Export**: Convert posts to Medium-compatible HTML with GitHub Gists
- **PDF Support**: LaTeX and Office document conversion
- **Single Binary**: Compile to a standalone executable (~34MB)

## Quick Start

```bash
# Clone the repository
git clone https://github.com/your-username/static-flow.git
cd static-flow

# Compile to binary
deno task compile

# Check dependencies
./staticflow setup

# Build the site
./staticflow build

# Start dev server
./staticflow serve
```

Open http://localhost:8080 to view your site.

## CLI Commands

```bash
# Full build (photos + blog + search)
./staticflow build

# Process photos only (HEIC conversion, compression)
./staticflow build --photos

# Build static HTML only (for crawlers)
./staticflow build --static

# Build Medium export only
./staticflow build --medium

# Build and push to git
./staticflow build --push
./staticflow build --push "custom commit message"

# Start development server
./staticflow serve
./staticflow serve --port=3000

# Check/install dependencies
./staticflow setup

# Initialize new project
./staticflow init

# Clean generated files
./staticflow clean
./staticflow clean --all    # Include caches
```

## Directory Structure

```
static-flow/
├── staticflow.config.yaml    # Site configuration
├── deno.json                 # Deno tasks and imports
├── staticflow                # Compiled binary
├── content/
│   ├── posts/                # Markdown, Jupyter, PDF, LaTeX files
│   └── photos/               # Images for gallery
├── scripts/
│   ├── cli.ts                # Main CLI entry point
│   ├── config.ts             # Configuration loader
│   └── *.ts                  # Build scripts
├── themes/
│   └── default/
│       ├── index.html        # Homepage template
│       ├── blog/             # Blog templates
│       ├── gallery/          # Gallery templates
│       └── components/       # Shared components
├── blog/                     # Generated blog output
└── docs/                     # Documentation
```

## Configuration

Edit `staticflow.config.yaml`:

```yaml
site:
  name: "My Blog"
  url: "https://example.com"
  description: "A personal blog"
  author: "Your Name"

paths:
  posts: "content/posts"
  photos: "content/photos"
  output: "dist"

features:
  search: true
  vectorSearch: true      # Requires OPENAI_API_KEY
  gallery: true
  mediumExport: false

build:
  imageCompression: true
  maxImageWidth: 2000
  imageQuality: 85
```

## Content Types

### Markdown Posts

Create `.md` files in `content/posts/`:

```markdown
---
date: 2024-01-01
tags: [python, backend]
description: My first post
---
# My First Post

Content here...
```

### Jupyter Notebooks

Place `.ipynb` files in `content/posts/`. They will be automatically converted to HTML with code cells and outputs preserved.

### PDF and LaTeX

- `.pdf` files are served directly
- `.tex` files are compiled to PDF (requires pdflatex)
- Office documents (.docx, .pptx) are converted to PDF (requires LibreOffice)

### Photo Gallery

Add images to `content/photos/`:
- HEIC files are automatically converted to JPG
- Images are compressed to max width (configurable)
- AI descriptions generated with OpenAI Vision (optional)

## Environment Variables

```bash
# Required for vector search
export OPENAI_API_KEY=sk-...

# Required for Medium export with Gists
export GITHUB_TOKEN_CREATE_GIST=ghp_...
```

## Development vs Production

### Development (with Deno)

```bash
deno task build
deno task serve
```

### Production (compiled binary)

```bash
# Compile once
deno task compile

# Use binary anywhere
./staticflow build
./staticflow serve
```

The compiled binary includes all dependencies and can be distributed without Deno installed.

## Dependencies

**Required:**
- Deno >= 1.40

**Optional:**
- ImageMagick - Photo compression
- LibreOffice - Office to PDF conversion
- pdflatex - LaTeX to PDF conversion
- Chrome/Chromium - Table to image for Medium export

Run `./staticflow setup` to check which dependencies are installed.

## License

MIT

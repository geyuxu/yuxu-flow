# Static Flow

A modern static site generator built with Deno. Compiles to a single binary (~34MB).

## Features

- **Multi-format Blog**: Markdown, Jupyter Notebooks, PDF, Office documents, LaTeX
- **Photo Gallery**: HEIC conversion, compression, AI descriptions
- **Vector Search**: Hybrid semantic + BM25 search (OpenAI embeddings)
- **Medium Export**: Convert posts to Medium-compatible HTML with GitHub Gists
- **Single Binary**: No runtime dependencies after compilation

## Project Structure

```
static-flow/
├── scripts/           # Tool source code (TypeScript)
├── public/lib/        # Search library (Voy WASM)
├── docs/              # Documentation
├── docs/              # Documentation site (GitHub Pages)
│   ├── content/       # Posts and photos
│   ├── themes/        # HTML templates
│   ├── blog/          # Generated output
│   └── staticflow.config.yaml
├── staticflow         # Compiled binary
└── deno.json          # Build configuration
```

## Quick Start

```bash
# 1. Compile the tool
deno task compile

# 2. Copy example to create your website
cp -r example ~/my-website
cd ~/my-website

# 3. Build and serve
/path/to/staticflow build
/path/to/staticflow serve
```

Or add staticflow to your PATH:
```bash
sudo cp staticflow /usr/local/bin/
cd ~/my-website
staticflow build
staticflow serve
```

## CLI Commands

```bash
staticflow build              # Full build
staticflow build --photos     # Process photos only
staticflow build --static     # Static HTML only
staticflow build --medium     # Medium export only
staticflow build --push       # Build and git push
staticflow serve              # Start dev server (:8080)
staticflow serve --port=3000  # Custom port
staticflow setup              # Check dependencies
staticflow clean              # Clean generated files
```

## Creating Your Website

### Option 1: Copy Docs Template
```bash
cp -r docs ~/my-website
cd ~/my-website
# Edit staticflow.config.yaml
staticflow build
```

### Option 2: From Scratch

Minimal structure:
```
my-website/
├── staticflow.config.yaml    # Required
├── content/
│   └── posts/
│       └── hello.md          # Your first post
├── themes/
│   └── default/              # Copy from example/themes/
└── index.html
```

## Configuration

Edit `staticflow.config.yaml`:

```yaml
site:
  name: "My Blog"
  url: "https://example.com"
  author: "Your Name"

features:
  gallery: true
  vectorSearch: true    # Requires OPENAI_API_KEY
  mediumExport: false

build:
  imageCompression: true
  maxImageWidth: 2000
  imageQuality: 85
```

## Environment Variables

```bash
export OPENAI_API_KEY="sk-..."           # Vector search
export GITHUB_TOKEN_CREATE_GIST="ghp-..." # Medium gists
```

## Development

```bash
# Run from source
deno task build
deno task serve

# Compile to binary
deno task compile
```

## Dependencies

**Required:** Deno >= 1.40

**Optional:**
- ImageMagick - Photo compression
- LibreOffice - Office to PDF
- pdflatex - LaTeX to PDF
- Chrome - Table images for Medium

Run `staticflow setup` to check dependencies.

## Documentation

- [Full Documentation](docs/README.md)
- [Installation Guide](docs/INSTALL.md)

## License

MIT

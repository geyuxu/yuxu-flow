# Installation Guide

## System Requirements

- **Deno**: >= 1.40 (required for compilation)
- **Node.js**: Not required

### Optional Dependencies

| Dependency | Purpose | Required For |
|------------|---------|--------------|
| ImageMagick | Photo compression | `build --photos` |
| LibreOffice | Office to PDF | `.docx`, `.pptx` files |
| pdflatex | LaTeX to PDF | `.tex` files |
| Chrome/Chromium | Table to image | Medium export with tables |

## Installation

### 1. Install Deno

**macOS:**
```bash
curl -fsSL https://deno.land/x/install/install.sh | sh
echo 'export DENO_INSTALL="$HOME/.deno"' >> ~/.zshrc
echo 'export PATH="$DENO_INSTALL/bin:$PATH"' >> ~/.zshrc
```

**Ubuntu/Debian:**
```bash
curl -fsSL https://deno.land/x/install/install.sh | sh
echo 'export DENO_INSTALL="$HOME/.deno"' >> ~/.bashrc
echo 'export PATH="$DENO_INSTALL/bin:$PATH"' >> ~/.bashrc
```

### 2. Clone and Compile

```bash
git clone https://github.com/your-username/static-flow.git
cd static-flow
deno task compile
```

### 3. Verify Installation

```bash
./staticflow setup
```

Expected output:
```
=== Static Flow Setup ===

OS: linux

--- Checking Required Dependencies ---

[OK] Deno 2.6.8

--- Checking Optional Dependencies ---

[OK] LibreOffice (Office to PDF conversion)
[OK] ImageMagick (Photo compression)
[OPTIONAL] pdflatex (LaTeX to PDF conversion)
[OK] Chrome/Chromium (Table to image conversion)

=== Setup Complete ===
```

## Optional Dependencies

### ImageMagick (Photo Compression)

```bash
# macOS
brew install imagemagick

# Ubuntu
sudo apt install imagemagick
```

### LibreOffice (Office Documents)

```bash
# macOS
brew install --cask libreoffice

# Ubuntu
sudo apt install libreoffice
```

### pdflatex (LaTeX)

```bash
# macOS
brew install --cask mactex-no-gui

# Ubuntu
sudo apt install texlive-latex-base texlive-latex-extra
```

### Chromium (Table Images)

```bash
# Ubuntu
sudo apt install chromium-browser
```

## Configuration

Create `staticflow.config.yaml`:

```yaml
site:
  name: "My Blog"
  url: "https://example.com"
  author: "Your Name"

features:
  gallery: true
  vectorSearch: true
  mediumExport: false

build:
  imageCompression: true
  maxImageWidth: 2000
  imageQuality: 85
```

## Environment Variables

```bash
# Vector search (optional)
export OPENAI_API_KEY="sk-..."

# Medium export with Gists (optional)
export GITHUB_TOKEN_CREATE_GIST="ghp_..."
```

## Usage

```bash
# Build site
./staticflow build

# Start server
./staticflow serve

# More commands
./staticflow --help
```

## Troubleshooting

### Binary not found

```bash
# Make sure you're in the project directory
cd /path/to/static-flow
./staticflow build
```

### Permission denied

```bash
chmod +x ./staticflow
```

### Config not found warning

This is normal if you haven't created `staticflow.config.yaml` yet. Default values will be used.

### ImageMagick not found

```bash
# Verify installation
which magick || which convert

# Install if missing
# macOS: brew install imagemagick
# Ubuntu: sudo apt install imagemagick
```

### pdflatex not found on macOS

```bash
# Add to PATH
export PATH="/Library/TeX/texbin:$PATH"
```

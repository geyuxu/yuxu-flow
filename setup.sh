#!/bin/bash
# One-click setup script for yuxu.ge
# Installs all required and optional dependencies

set -e

echo "=== yuxu.ge Setup ==="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_installed() {
    if command -v "$1" &> /dev/null; then
        echo -e "${GREEN}[OK]${NC} $2"
        return 0
    else
        echo -e "${YELLOW}[MISSING]${NC} $2"
        return 1
    fi
}

# Detect OS
OS="unknown"
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
fi

echo "Detected OS: $OS"
echo ""

# Check required dependencies
echo "--- Checking Required Dependencies ---"
echo ""

# Node.js
if check_installed "node" "Node.js"; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo -e "${RED}  Node.js version must be >= 18 (found v$NODE_VERSION)${NC}"
        NEED_NODE=1
    fi
else
    NEED_NODE=1
fi

# npm
check_installed "npm" "npm" || NEED_NPM=1

echo ""

# Install Node.js if missing
if [ -n "$NEED_NODE" ] || [ -n "$NEED_NPM" ]; then
    echo "Node.js 18+ is required. Install it:"
    if [ "$OS" = "macos" ]; then
        echo "  brew install node"
    elif [ "$OS" = "linux" ]; then
        echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
        echo "  sudo apt-get install -y nodejs"
    fi
    echo ""
    read -p "Install Node.js now? [y/N] " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if [ "$OS" = "macos" ]; then
            if command -v brew &> /dev/null; then
                brew install node
            else
                echo "Homebrew not found. Install from: https://brew.sh"
                exit 1
            fi
        elif [ "$OS" = "linux" ]; then
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
        fi
    else
        echo "Please install Node.js manually and re-run this script."
        exit 1
    fi
fi

# Install npm dependencies
echo ""
echo "--- Installing npm Dependencies ---"
echo ""
npm install

echo ""
echo "--- Checking Optional Dependencies ---"
echo ""

# LibreOffice (for PPTX to PDF)
LIBREOFFICE_PATHS=(
    "/Applications/LibreOffice.app/Contents/MacOS/soffice"
    "/usr/bin/soffice"
    "/usr/bin/libreoffice"
)
LIBREOFFICE_FOUND=0
for p in "${LIBREOFFICE_PATHS[@]}"; do
    if [ -f "$p" ]; then
        LIBREOFFICE_FOUND=1
        break
    fi
done
if [ "$LIBREOFFICE_FOUND" = "1" ] || command -v soffice &> /dev/null || command -v libreoffice &> /dev/null; then
    echo -e "${GREEN}[OK]${NC} LibreOffice (PPTX to PDF conversion)"
else
    echo -e "${YELLOW}[OPTIONAL]${NC} LibreOffice (PPTX to PDF conversion)"
    echo "  Install: "
    if [ "$OS" = "macos" ]; then
        echo "    brew install --cask libreoffice"
    elif [ "$OS" = "linux" ]; then
        echo "    sudo apt install libreoffice"
    fi
    MISSING_OPTIONAL=1
fi

# ImageMagick (for photo compression)
if check_installed "magick" "ImageMagick (photo compression)" || check_installed "convert" "ImageMagick (photo compression)"; then
    :
else
    echo "  Install: "
    if [ "$OS" = "macos" ]; then
        echo "    brew install imagemagick"
    elif [ "$OS" = "linux" ]; then
        echo "    sudo apt install imagemagick"
    fi
    MISSING_OPTIONAL=1
fi

# Python (for local server)
if check_installed "python3" "Python 3 (local dev server)"; then
    :
else
    echo "  Install: "
    if [ "$OS" = "macos" ]; then
        echo "    brew install python3"
    elif [ "$OS" = "linux" ]; then
        echo "    sudo apt install python3"
    fi
fi

echo ""

# Install optional dependencies
if [ -n "$MISSING_OPTIONAL" ]; then
    read -p "Install optional dependencies (LibreOffice, ImageMagick)? [y/N] " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if [ "$OS" = "macos" ]; then
            if command -v brew &> /dev/null; then
                echo "Installing LibreOffice..."
                brew install --cask libreoffice || true
                echo "Installing ImageMagick..."
                brew install imagemagick || true
            else
                echo "Homebrew not found. Install from: https://brew.sh"
            fi
        elif [ "$OS" = "linux" ]; then
            echo "Installing LibreOffice and ImageMagick..."
            sudo apt update
            sudo apt install -y libreoffice imagemagick
        fi
    fi
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Start local server:  python3 -m http.server 8080"
echo "  2. Build site:          ./build.sh"
echo "  3. View at:             http://localhost:8080"
echo ""
echo "For vector search, set OPENAI_API_KEY before building:"
echo "  OPENAI_API_KEY=xxx ./build.sh"
echo ""

#!/bin/bash
# Static Flow Build Script
# Compiles the tool, builds the example site, and deploys to docs/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Find deno
if command -v deno &> /dev/null; then
    DENO="deno"
elif [[ -f "$HOME/.deno/bin/deno" ]]; then
    DENO="$HOME/.deno/bin/deno"
else
    echo "Error: deno not found. Install from https://deno.land"
    exit 1
fi

echo "=== Static Flow Build ==="
echo ""

# 1. Compile the binary (optional, skip if already compiled)
INSTALL_DIR="/opt/staticflow/bin"
if [[ "$1" == "--compile" ]] || [[ ! -f "$INSTALL_DIR/staticflow" ]]; then
    echo "--- Compiling Static Flow ---"
    $DENO compile -A --output staticflow scripts/cli.ts

    # Install to /opt/staticflow/bin
    echo "Installing to $INSTALL_DIR/"
    mv staticflow "$INSTALL_DIR/"
    echo "Installed: $INSTALL_DIR/staticflow"
    echo ""
fi

# 2. Build example site
echo "--- Building Example Site ---"
cd example
$DENO run -A ../scripts/cli.ts build
cd ..
echo ""

# 3. Copy example/dist to docs for GitHub Pages
echo "--- Deploying to docs/ ---"
rm -rf docs/*
cp -r example/dist/* docs/
echo "Copied example/dist/* to docs/"
echo ""

# 4. Summary
echo "=== Build Complete ==="
echo ""
echo "Structure:"
echo "  example/         - Source site (edit content here)"
echo "  example/dist/    - Build output"
echo "  docs/            - GitHub Pages deployment"
echo ""
echo "To preview locally:"
echo "  cd docs && python3 -m http.server 8080"
echo ""
echo "Or use the dev server:"
echo "  cd example && staticflow serve"
echo ""
echo "Binary location: /opt/staticflow/bin/staticflow"

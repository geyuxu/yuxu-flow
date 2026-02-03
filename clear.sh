#!/bin/bash
# Clear generated files
# Usage:
#   ./clear.sh       # Clean outputs (keep caches)
#   ./clear.sh --all # Clean everything including caches

cd "$(dirname "$0")"

echo "Cleaning generated files..."

# Remove build outputs
rm -rf blog/static/
rm -rf blog/medium/

# Remove table images (will regenerate)
rm -rf blog/images/tables/
rm -f blog/.table-cache.json

echo "✓ Cleaned:"
echo "  - blog/static/"
echo "  - blog/medium/"
echo "  - blog/images/tables/"

# Only clear gist cache with --all flag
if [[ "$1" == "--all" ]]; then
    rm -f blog/.gist-cache.json
    echo "  - blog/.gist-cache.json"
fi

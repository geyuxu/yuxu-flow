#!/bin/bash
# Build site (Deno version)
# Usage:
#   ./build.sh                     # Build all
#   ./build.sh --static            # Static only
#   ./build.sh --medium            # Medium only
#   ./build.sh --photos            # Process photos only (convert + compress)
#   ./build.sh --push              # Build all and push to git
#   ./build.sh --push "message"    # Build all and push with custom commit message

set -e
cd "$(dirname "$0")"

# Git push function
git_push() {
    echo ""
    echo "=== Git Status ==="
    git status --short

    if git diff --quiet && git diff --cached --quiet; then
        echo ""
        echo "No changes to commit."
        return 0
    fi

    MSG="${COMMIT_MSG:-build: update site $(date '+%Y-%m-%d %H:%M')}"
    echo ""
    echo "=== Committing ==="
    git add -A
    git commit -m "$MSG"
    echo ""
    echo "=== Pushing ==="
    git push
    echo ""
    echo "Done!"
}

# Parse arguments
DO_PUSH=false
COMMIT_MSG=""
BUILD_ARGS=()

for arg in "$@"; do
    case "$arg" in
        --push)
            DO_PUSH=true
            ;;
        --photos|--static|--medium)
            BUILD_ARGS+=("$arg")
            ;;
        *)
            # If push mode and no commit message yet, treat as commit message
            if [ "$DO_PUSH" = true ] && [ -z "$COMMIT_MSG" ]; then
                COMMIT_MSG="$arg"
            else
                BUILD_ARGS+=("$arg")
            fi
            ;;
    esac
done

# Photos only mode
if [[ " ${BUILD_ARGS[*]} " =~ " --photos " ]]; then
    echo "=== Processing Photos ==="
    echo ""
    echo "--- Converting HEIC to JPG ---"
    deno task convert:heic
    echo ""
    echo "--- Compressing Photos ---"
    deno task compress:photos
    echo ""
    echo "--- Generating Descriptions ---"
    deno task generate:descriptions

    [ "$DO_PUSH" = true ] && git_push
    exit 0
fi

# Process photos first (convert HEIC, then compress)
echo "=== Converting HEIC to JPG ==="
deno task convert:heic
echo ""
echo "=== Compressing Photos ==="
deno task compress:photos
echo ""

# Generate missing descriptions for photo albums (optional, may timeout)
echo "=== Generating Photo Descriptions ==="
deno task generate:descriptions || echo "⚠ Description generation skipped or failed (non-blocking)"
echo ""

# Convert Office documents to PDF (PPTX, RTF, ODT, ODS, ODP - if LibreOffice available)
echo "=== Converting Office Docs to PDF ==="
deno task build:office
echo ""

# Convert LaTeX to PDF (if pdflatex available)
echo "=== Converting LaTeX to PDF ==="
deno task build:latex

# Generate posts.json from markdown frontmatter
echo ""
echo "=== Building Blog ==="
deno task build:posts

# Generate photos.json from folder structure
echo "=== Building Gallery ==="
deno task build:photos

# Build search index (optional, requires OPENAI_API_KEY)
if [ -n "$OPENAI_API_KEY" ]; then
    echo ""
    echo "=== Building Search Index ==="
    deno task build:search
else
    echo ""
    echo "=== Skipping Search Index (OPENAI_API_KEY not set) ==="
fi

# Build static/medium
echo ""
echo "=== Building Static HTML ==="
deno run --allow-read --allow-write --allow-run blog/build.ts "${BUILD_ARGS[@]}"

# Git push if requested
[ "$DO_PUSH" = true ] && git_push

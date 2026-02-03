#!/bin/bash
# YXFlow Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/geyuxu/yuxu-flow/main/install.sh | sh

set -e

REPO="geyuxu/yuxu-flow"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
  linux)
    case "$ARCH" in
      x86_64) BINARY="yxflow-linux-x64" ;;
      *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    ;;
  darwin)
    case "$ARCH" in
      x86_64) BINARY="yxflow-macos-x64" ;;
      arm64) BINARY="yxflow-macos-arm64" ;;
      *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    ;;
  *)
    echo "Unsupported OS: $OS"
    exit 1
    ;;
esac

# Get latest release
LATEST=$(curl -s "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$LATEST" ]; then
  echo "Failed to get latest release"
  exit 1
fi

URL="https://github.com/$REPO/releases/download/$LATEST/$BINARY"

echo "Installing yxflow $LATEST for $OS/$ARCH..."

# Download
curl -fsSL "$URL" -o /tmp/yxflow

# Install
chmod +x /tmp/yxflow

if [ -w "$INSTALL_DIR" ]; then
  mv /tmp/yxflow "$INSTALL_DIR/yxflow"
else
  echo "Need sudo to install to $INSTALL_DIR"
  sudo mv /tmp/yxflow "$INSTALL_DIR/yxflow"
fi

echo "Installed yxflow to $INSTALL_DIR/yxflow"
echo ""
echo "Run 'yxflow --help' to get started"

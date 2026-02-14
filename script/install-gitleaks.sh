#!/usr/bin/env bash
set -euo pipefail

# Installs a pinned gitleaks binary into the repo at `.tools/gitleaks/gitleaks`.
# This avoids requiring system-wide installs while keeping pre-commit fast.

VERSION="${GITLEAKS_VERSION:-8.30.0}"
TAG="v${VERSION}"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$OS" in
  darwin|linux) ;;
  *)
    echo "Unsupported OS: $OS" >&2
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *)
    echo "Unsupported arch: $ARCH" >&2
    exit 1
    ;;
esac

ASSET="gitleaks_${VERSION}_${OS}_${ARCH}.tar.gz"
URL="https://github.com/gitleaks/gitleaks/releases/download/${TAG}/${ASSET}"

DEST_DIR=".tools/gitleaks"
DEST_BIN="${DEST_DIR}/gitleaks"

mkdir -p "$DEST_DIR"

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

echo "Downloading ${URL}" >&2
curl -fsSL "$URL" -o "${TMP_DIR}/${ASSET}"
tar -xzf "${TMP_DIR}/${ASSET}" -C "$TMP_DIR"

mv "${TMP_DIR}/gitleaks" "$DEST_BIN"
chmod +x "$DEST_BIN"

echo "Installed gitleaks: $($DEST_BIN version)" >&2

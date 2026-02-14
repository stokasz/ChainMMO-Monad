#!/usr/bin/env bash
set -euo pipefail

# Enables repo-committed hooks under `.githooks/`.
#
# This is intentionally an explicit setup step because git hooks are not shared
# automatically between clones.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

git config core.hooksPath .githooks
echo "Configured git hooks path: $(git config --get core.hooksPath)" >&2

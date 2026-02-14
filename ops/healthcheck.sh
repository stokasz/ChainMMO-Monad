#!/usr/bin/env bash
set -euo pipefail

# Lightweight external smoke checks used by server-side timers.
# Keep this read-only and non-secret-bearing.

BASE_URL="${BASE_URL:-https://test.chainmmo.com}"
WEB_URL="${WEB_URL:-https://test.chainmmo.com}"

curl -fsS "${BASE_URL}/health" >/dev/null
curl -fsS "${BASE_URL}/meta/contracts" >/dev/null
curl -fsS "${BASE_URL}/leaderboard?mode=live&limit=1" >/dev/null
curl -fsS "${WEB_URL}/robots.txt" >/dev/null
curl -fsS "${WEB_URL}/sitemap.xml" >/dev/null

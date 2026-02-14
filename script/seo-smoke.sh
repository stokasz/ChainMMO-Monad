#!/usr/bin/env bash
set -euo pipefail

WEB_URL="${WEB_URL:-https://chainmmo.com}"

require() {
  local label="$1"
  local pattern="$2"
  local haystack="$3"
  if ! echo "$haystack" | grep -Eiq "$pattern"; then
    echo "seo-smoke missing: $label" >&2
    exit 1
  fi
}

# Normalize newlines so grep can match tags that are formatted across multiple lines.
html="$(curl -fsS "$WEB_URL/" | tr '\n' ' ')"

require "<title>" "<title>[^<].*</title>" "$html"
require "meta description" "<meta[^>]+name=[\"']description[\"']" "$html"
require "canonical" "<link[^>]+rel=[\"']canonical[\"']" "$html"

require "og:title" "<meta[^>]+property=[\"']og:title[\"']" "$html"
require "og:description" "<meta[^>]+property=[\"']og:description[\"']" "$html"
require "og:url" "<meta[^>]+property=[\"']og:url[\"']" "$html"
require "og:image" "<meta[^>]+property=[\"']og:image[\"']" "$html"

require "twitter card" "<meta[^>]+name=[\"']twitter:card[\"']" "$html"
require "twitter title" "<meta[^>]+name=[\"']twitter:title[\"']" "$html"
require "twitter image" "<meta[^>]+name=[\"']twitter:image[\"']" "$html"

require "json-ld" "<script[^>]+type=[\"']application/ld\\+json[\"']" "$html"

echo "seo-smoke ok: $WEB_URL"

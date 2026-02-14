#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOLAR_BIN="${SOLAR_BIN:-solar}"

if ! command -v "$SOLAR_BIN" >/dev/null 2>&1; then
  echo "solar binary not found (set SOLAR_BIN or install from https://github.com/paradigmxyz/solar)" >&2
  exit 1
fi

cd "$ROOT_DIR"
mapfile -t SOURCES < <(find src -type f -name '*.sol' | sort)
if [[ "${#SOURCES[@]}" -eq 0 ]]; then
  echo "no Solidity sources found under src/" >&2
  exit 1
fi

mapfile -t REMAPPINGS < <(forge remappings)
"$SOLAR_BIN" "${REMAPPINGS[@]}" "${SOURCES[@]}" --emit abi >/dev/null

echo "solar dev check passed (ABI front-end parse for all src/**/*.sol)"

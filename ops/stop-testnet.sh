#!/usr/bin/env bash
set -euo pipefail

ops_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ops_dir"

env_file="${ENV_FILE:-$ops_dir/.env.testnet}"
if [[ $# -gt 0 ]]; then
  if [[ "${1:-}" == "--env-file" && $# -eq 2 ]]; then
    env_file="$2"
  else
    echo "Usage: $0 [--env-file /path/to/.env.testnet]" >&2
    exit 2
  fi
fi

if [[ ! -f "$env_file" ]]; then
  echo "Missing env file: $env_file" >&2
  exit 1
fi

docker compose --env-file "$env_file" -f docker-compose.yml -f docker-compose.on-demand.yml -p chainmmo-testnet down


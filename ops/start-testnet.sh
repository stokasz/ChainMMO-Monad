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

chain_id="$(grep -E '^[[:space:]]*CHAIN_ID=' "$env_file" | tail -n1 | sed -E 's/^[[:space:]]*CHAIN_ID=//')"
chain_id="${chain_id%$'\r'}"
chain_id="${chain_id%\"}"; chain_id="${chain_id#\"}"
chain_id="${chain_id%\'}"; chain_id="${chain_id#\'}"
if [[ "$chain_id" != "10143" ]]; then
  echo "Expected CHAIN_ID=10143 for testnet, got: ${chain_id:-<missing>} (env: $env_file)" >&2
  exit 1
fi

if ! grep -Eq '^[[:space:]]*POSTGRES_PASSWORD=' "$env_file"; then
  echo "Missing POSTGRES_PASSWORD in env file: $env_file" >&2
  exit 1
fi

docker compose --env-file "$env_file" -f docker-compose.yml -f docker-compose.on-demand.yml -p chainmmo-testnet up -d --build postgres mid


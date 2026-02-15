#!/usr/bin/env bash
set -euo pipefail

ops_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$ops_dir/.." && pwd)"
anvil_pid_file="${ops_dir}/.devnet-anvil.pid"
front_pid_file="${ops_dir}/.devnet-front.pid"

env_file="${ENV_FILE:-$ops_dir/.env.devnet.local}"
ANVIL_PORT="${ANVIL_PORT:-8555}"
ANVIL_CHAIN_ID="${ANVIL_CHAIN_ID:-31337}"
FRONT_HOST="${DEVNET_FRONT_HOST:-127.0.0.1}"
FRONT_PORT="${DEVNET_FRONT_PORT:-5173}"
SKIP_DEPLOY="${SKIP_DEPLOY:-false}"

if [[ $# -gt 0 ]]; then
  if [[ "${1:-}" == "--env-file" && $# -eq 2 ]]; then
    env_file="$2"
  else
    echo "Usage: $0 [--env-file /path/to/ops/.env.devnet.local]" >&2
    exit 2
  fi
fi

if [[ ! -f "$env_file" ]]; then
  echo "Missing env file: $env_file" >&2
  echo "Copy ops/.env.example and create a private local file (for example, ops/.env.devnet.local)." >&2
  exit 1
fi

if ! command -v anvil >/dev/null 2>&1; then
  echo "anvil not found. Install Foundry toolchain before running this devnet flow." >&2
  exit 1
fi

if ! command -v cast >/dev/null 2>&1; then
  echo "cast not found. Install Foundry toolchain before running this devnet flow." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found. Install Docker before running this devnet flow." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not reachable. Start Docker Desktop (or the Docker service) and retry." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl not found. Install curl before running this devnet flow." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node not found. Install Node.js before running this devnet flow." >&2
  exit 1
fi

extract_env_value() {
  local key="$1"
  local line
  line="$(grep -E "^[[:space:]]*${key}=" "$env_file" | tail -n1 || true)"
  line="${line#*=}"
  line="${line%$'\r'}"
  line="${line%\"}"
  line="${line#\"}"
  line="${line%\'}"
  line="${line#\'}"
  printf "%s" "$line"
}

extract_json_chain_id() {
  local payload="$1"
  node -e '
const fs = require("node:fs");
const body = fs.readFileSync(0, "utf8");
try {
  const parsed = JSON.parse(body);
  const value = parsed?.chainId;
  if (value === undefined || value === null || value === "") {
    process.exit(1);
  }
  process.stdout.write(String(value));
} catch {
  process.exit(1);
}
' <<<"$payload"
}

extract_openclaw_token() {
  if ! command -v openclaw >/dev/null 2>&1; then
    return 1
  fi

  local payload
  local token
  payload="$(openclaw config get gateway --json 2>/dev/null || true)"
  if [[ -z "${payload}" ]]; then
    return 1
  fi

  token="$(node - <<'NODE'
const fs = require("node:fs");
const body = fs.readFileSync(0, "utf8");
try {
  const parsed = JSON.parse(body);
  const token = parsed?.auth?.token;
  if (typeof token === "string" && token.length > 0) {
    process.stdout.write(token);
  }
} catch {
  process.exit(1);
}
NODE
<<<"$payload")"

  if [[ -z "${token}" ]]; then
    return 1
  fi

  echo "$token"
}

wait_for_middleware() {
  local base_url="$1"
  local timeout_seconds="${API_READY_TIMEOUT_SECONDS:-180}"
  local interval_seconds="${API_READY_POLL_SECONDS:-2}"
  local deadline=$((SECONDS + timeout_seconds))

  while ((SECONDS < deadline)); do
    if payload="$(curl -fsS "$base_url/health" 2>/dev/null)"; then
      if chain_id="$(extract_json_chain_id "$payload" 2>/dev/null)"; then
        if [[ "$chain_id" == "$CHAIN_ID" ]]; then
          echo "Middleware is ready on ${base_url} (chainId ${chain_id})"
          return 0
        fi
      fi
    fi
    sleep "$interval_seconds"
  done

  return 1
}

verify_manifest_chain_id() {
  local base_url="$1"
  if ! payload="$(curl -fsS "$base_url/meta/contracts" 2>/dev/null)"; then
    echo "Failed to fetch ${base_url}/meta/contracts after startup." >&2
    return 1
  fi

  if ! chain_id="$(extract_json_chain_id "$payload" 2>/dev/null)"; then
    echo "Middleware /meta/contracts did not return a valid chainId." >&2
    return 1
  fi

  if [[ "$chain_id" != "$CHAIN_ID" ]]; then
    echo "chainId mismatch: expected ${CHAIN_ID}, got ${chain_id} from /meta/contracts" >&2
    return 1
  fi

  return 0
}

set -a
source "$env_file"
set +a

env_chain_id="$(extract_env_value CHAIN_ID)"
if [[ -z "${env_chain_id}" ]]; then
  echo "Missing CHAIN_ID in env file: $env_file" >&2
  exit 1
fi
if [[ "$env_chain_id" != "$ANVIL_CHAIN_ID" ]]; then
  echo "CHAIN_ID in env must be ${ANVIL_CHAIN_ID} for devnet. Got: ${env_chain_id}" >&2
  exit 1
fi

file_chain_rpc="$(extract_env_value CHAIN_RPC_URL)"
env_chain_rpc="${CHAIN_RPC_URL:-$file_chain_rpc}"

# RPC_URL is used by host-side tools (cast/forge) talking to Anvil.
# CHAIN_RPC_URL is used by the dockerized middleware container. `127.0.0.1` inside a container refers
# to the container itself, so we translate localhost RPC URLs to `host.docker.internal` automatically.
host_rpc_url="${RPC_URL:-${env_chain_rpc:-http://127.0.0.1:${ANVIL_PORT}}}"
docker_rpc_url="${CHAIN_RPC_URL:-$env_chain_rpc}"
if [[ -z "${docker_rpc_url:-}" ]]; then
  docker_rpc_url="$host_rpc_url"
fi
if [[ "$docker_rpc_url" == http://127.0.0.1* || "$docker_rpc_url" == https://127.0.0.1* || "$docker_rpc_url" == http://localhost* || "$docker_rpc_url" == https://localhost* ]]; then
  docker_rpc_url="http://host.docker.internal:${ANVIL_PORT}"
fi

RPC_URL="$host_rpc_url"
CHAIN_RPC_URL="$docker_rpc_url"

export CHAIN_ID="$env_chain_id"
export CHAIN_RPC_URL
export RPC_URL
export CHAIN_CONFIRMATIONS="${CHAIN_CONFIRMATIONS:-2}"
export MID_ENV_PATH="${MID_ENV_PATH:-$env_file}"
export FRONT_CONTRACTS_PATH="${FRONT_CONTRACTS_PATH:-$repo_root/front/contracts.latest.json}"
devnet_front_api_host="${HOST_API_BIND:-127.0.0.1}"
devnet_front_api_port="${HOST_API_PORT:-8787}"
if [[ "${devnet_front_api_host}" == "0.0.0.0" ]]; then
  devnet_front_api_host="127.0.0.1"
fi
API_BASE="${DEVNET_API_BASE:-http://$devnet_front_api_host:$devnet_front_api_port}"

if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
  echo "POSTGRES_PASSWORD is required in $env_file" >&2
  exit 1
fi

if [[ ! "$CHAIN_ID" =~ ^[0-9]+$ ]]; then
  echo "CHAIN_ID must be numeric: ${CHAIN_ID}" >&2
  exit 1
fi

if [[ "$SKIP_DEPLOY" != "true" && -z "${PRIVATE_KEY:-}" ]]; then
  echo "PRIVATE_KEY is required unless SKIP_DEPLOY=true in env." >&2
  echo "Deploying devnet contracts needs a funded local signer key." >&2
  exit 1
fi

anvil_pid=""
front_pid=""
anvil_log="${ops_dir}/anvil-devnet.log"
deploy_log="${ops_dir}/deploy-and-sync-devnet.log"
front_log="${ops_dir}/front-devnet.log"
deploy_log_label="$deploy_log"

cleanup() {
  set +e

  if [[ -f "$front_pid_file" ]]; then
    front_pid="$(cat "$front_pid_file")"
  fi
  if [[ -n "${front_pid:-}" ]] && kill -0 "$front_pid" >/dev/null 2>&1; then
    kill "$front_pid" >/dev/null 2>&1 || true
    wait "$front_pid" 2>/dev/null || true
  fi
  rm -f "$front_pid_file"

  if [[ -f "$anvil_pid_file" ]]; then
    anvil_pid="$(cat "$anvil_pid_file")"
  fi
  if [[ -n "${anvil_pid:-}" ]] && kill -0 "$anvil_pid" >/dev/null 2>&1; then
    kill "$anvil_pid" >/dev/null 2>&1 || true
  fi
  rm -f "$anvil_pid_file"

  "${ops_dir}/stop-devnet.sh" --env-file "$env_file" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

if cast chain-id --rpc-url "$RPC_URL" >/dev/null 2>&1; then
  detected_chain_id="$(cast chain-id --rpc-url "$RPC_URL")"
  if [[ "$detected_chain_id" != "$ANVIL_CHAIN_ID" ]]; then
    echo "RPC URL chainId ${detected_chain_id} does not match expected ${ANVIL_CHAIN_ID} at ${RPC_URL}" >&2
    exit 1
  fi
  echo "Using existing RPC at ${RPC_URL} (chainId ${detected_chain_id})"
  rm -f "$anvil_pid_file"
else
  echo "Starting anvil on port ${ANVIL_PORT} (chainId ${ANVIL_CHAIN_ID})"
  anvil --port "$ANVIL_PORT" --chain-id "$ANVIL_CHAIN_ID" --code-size-limit 40000 >"$anvil_log" 2>&1 &
  anvil_pid=$!
  echo "$anvil_pid" > "$anvil_pid_file"
  echo "anvil pid=${anvil_pid}, log=${anvil_log}"

  for _ in {1..30}; do
    if cast chain-id --rpc-url "$RPC_URL" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  if ! cast chain-id --rpc-url "$RPC_URL" >/dev/null 2>&1; then
    echo "Anvil failed to start or RPC not ready on ${RPC_URL}" >&2
    echo "Check ${anvil_log}" >&2
    exit 1
  fi
fi

echo "Host RPC (deploy/cast): ${RPC_URL}"
echo "Docker RPC (middleware): ${CHAIN_RPC_URL}"

if [[ "$SKIP_DEPLOY" != "true" ]]; then
  echo "Running deploy-and-sync for chain ${CHAIN_ID}"
  (
    cd "$repo_root/back"
    PRIVATE_KEY="${PRIVATE_KEY}" \
    RPC_URL="$RPC_URL" \
    CHAIN_ID="${CHAIN_ID}" \
    CHAIN_RPC_URL="$RPC_URL" \
    CHAIN_CONFIRMATIONS="${CHAIN_CONFIRMATIONS:-2}" \
    DEPLOY_TEST_MMO="${DEPLOY_TEST_MMO:-true}" \
    MMO_TOKEN_ADDRESS="${MMO_TOKEN_ADDRESS:-}" \
    MID_ENV_PATH="$env_file" \
    FRONT_CONTRACTS_PATH="${FRONT_CONTRACTS_PATH}" \
    ./script/deploy-and-sync.sh
  ) | tee "$deploy_log"
else
  deploy_log_label="/dev/null (SKIP_DEPLOY=true)"
fi

if [[ "${GROK_ARENA_ENABLED:-false}" == "true" && -z "${GROK_OPENCLAW_GATEWAY_URL:-}" ]]; then
  echo "GROK_ARENA_ENABLED=true but GROK_OPENCLAW_GATEWAY_URL is unset. Probing local OpenClaw gateway..."
  if detected="$(node "$repo_root/ops/probe-openclaw.mjs" --first 2>/dev/null)"; then
    detected="$(echo "$detected" | head -n1 | tr -d '\r\n')"
    if [[ -n "$detected" ]]; then
      echo "Detected OpenClaw gateway at: $detected"
      export GROK_OPENCLAW_GATEWAY_URL="$detected"
    fi
  fi
fi

if [[ "${GROK_ARENA_ENABLED:-false}" == "true" && -z "${GROK_OPENCLAW_GATEWAY_TOKEN:-}" ]]; then
  if detected_token="$(extract_openclaw_token)"; then
    if [[ -n "$detected_token" ]]; then
      echo "Loaded GROK_OPENCLAW_GATEWAY_TOKEN from local OpenClaw config."
      export GROK_OPENCLAW_GATEWAY_TOKEN="$detected_token"
    fi
  fi
fi

if [[ -n "${GROK_OPENCLAW_GATEWAY_URL:-}" && ( "${GROK_OPENCLAW_GATEWAY_URL}" == ws://127.0.0.1* || "${GROK_OPENCLAW_GATEWAY_URL}" == ws://localhost* ) ]]; then
  # If middleware runs in Docker, localhost must be translated to reach the host machine.
  export GROK_OPENCLAW_GATEWAY_URL="${GROK_OPENCLAW_GATEWAY_URL/\/\/127.0.0.1/\/\/host.docker.internal}"
  export GROK_OPENCLAW_GATEWAY_URL="${GROK_OPENCLAW_GATEWAY_URL/\/\/localhost/\/\/host.docker.internal}"
fi

echo "Starting middleware stack (postgres + mid)"
"$ops_dir/start-devnet.sh" --env-file "$env_file"

if ! wait_for_middleware "$API_BASE"; then
  echo "Middleware did not become ready in time." >&2
  exit 1
fi

if ! verify_manifest_chain_id "$API_BASE"; then
  echo "Contract manifest is not available for chain ${CHAIN_ID}. Check middleware startup logs." >&2
  exit 1
fi

"$ops_dir/verify-contract-manifests.sh" \
  --deployments "$repo_root/deployments/contracts.latest.json" \
  --front "$repo_root/front/contracts.latest.json" \
  --expected-chain-id "$CHAIN_ID"

if [[ ! -d "$repo_root/front/node_modules" ]]; then
  echo "Installing front dependencies"
  (cd "$repo_root/front" && npm ci)
fi

echo "Starting frontend on ${FRONT_HOST}:${FRONT_PORT} with API ${API_BASE}"
(
  cd "$repo_root/front"
  VITE_API_BASE="$API_BASE" npm run dev -- --host "$FRONT_HOST" --port "$FRONT_PORT"
) >"$front_log" 2>&1 &
front_pid=$!
echo "$front_pid" > "$front_pid_file"

echo "Devnet stack up."
echo "API: ${API_BASE}"
echo "UI: http://${FRONT_HOST}:${FRONT_PORT}"
echo "Logs:"
echo " - anvil: $anvil_log"
echo " - front: $front_log"
echo " - deploy: $deploy_log_label"
echo "Press Ctrl+C to stop devnet stack."
wait "$front_pid"

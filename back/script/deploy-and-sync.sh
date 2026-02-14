#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "${ROOT_DIR}/.." && pwd)"

resolve_repo_path() {
  local input="$1"
  if [[ "$input" = /* ]]; then
    echo "$input"
  else
    echo "${REPO_ROOT}/${input}"
  fi
}

if [[ -z "${PRIVATE_KEY:-}" ]]; then
  echo "PRIVATE_KEY is required" >&2
  exit 1
fi
if [[ -z "${RPC_URL:-}" ]]; then
  echo "RPC_URL is required" >&2
  exit 1
fi
if ! echo -n "${RPC_URL}" | grep -Eq '^https?://'; then
  echo "RPC_URL must be an http(s) URL." >&2
  exit 1
fi
if ! echo -n "${PRIVATE_KEY}" | grep -Eq '^0x[0-9a-fA-F]{64}$'; then
  echo "PRIVATE_KEY must match 0x + 64 hex chars." >&2
  exit 1
fi

DEPLOY_TEST_MMO="${DEPLOY_TEST_MMO:-false}"
if [[ "$DEPLOY_TEST_MMO" == "1" ]]; then
  DEPLOY_TEST_MMO="true"
fi
if [[ "$DEPLOY_TEST_MMO" != "true" && "$DEPLOY_TEST_MMO" != "false" ]]; then
  echo "DEPLOY_TEST_MMO must be true|false|1" >&2
  exit 1
fi
if [[ "$DEPLOY_TEST_MMO" == "false" && -z "${MMO_TOKEN_ADDRESS:-}" ]]; then
  echo "MMO_TOKEN_ADDRESS is required when DEPLOY_TEST_MMO=false" >&2
  exit 1
fi

SOLC_VERSION="${SOLC_VERSION:-0.8.26}"

if ! command -v cast >/dev/null 2>&1; then
  echo "cast is required (install Foundry)." >&2
  exit 1
fi

RPC_CHAIN_ID="$(cast chain-id --rpc-url "$RPC_URL")"
if ! echo -n "$RPC_CHAIN_ID" | grep -Eq '^[0-9]+$'; then
  echo "Failed to detect RPC chain id via cast." >&2
  exit 1
fi

if [[ -n "${CHAIN_ID:-}" ]]; then
  if [[ "$CHAIN_ID" != "$RPC_CHAIN_ID" ]]; then
    echo "RPC chainId (${RPC_CHAIN_ID}) does not match CHAIN_ID (${CHAIN_ID})." >&2
    exit 1
  fi
else
  CHAIN_ID="$RPC_CHAIN_ID"
fi

if [[ "$CHAIN_ID" == "143" && "${ALLOW_MAINNET_REDEPLOY:-false}" != "true" ]]; then
  DEPLOYMENTS_JSON_PATH_RESOLVED="$(resolve_repo_path "${DEPLOYMENTS_JSON_PATH:-deployments/contracts.latest.json}")"
  if [[ -f "$DEPLOYMENTS_JSON_PATH_RESOLVED" ]] && grep -Eq '"chainId"[[:space:]]*:[[:space:]]*143' "$DEPLOYMENTS_JSON_PATH_RESOLVED"; then
    echo "Refusing to redeploy mainnet contracts: ${DEPLOYMENTS_JSON_PATH_RESOLVED} already indicates chainId=143." >&2
    echo "If you really intend to redeploy, re-run with ALLOW_MAINNET_REDEPLOY=true." >&2
    exit 1
  fi
fi

cd "$ROOT_DIR"

forge build --use "solc:${SOLC_VERSION}"
# Foundry enforces Ethereum's EIP-170 limit with `--sizes`; use a chain-aware gate instead.
python3 script/check-contract-sizes.py --preset "${SIZE_PRESET:-monad}"

forge script script/DeployChainMMO.s.sol:DeployChainMMO \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --disable-code-size-limit \
  --non-interactive

SYNC_ARGS=(--chain-id "$CHAIN_ID")
if [[ -n "${MID_ENV_PATH:-}" ]]; then
  SYNC_ARGS+=(--mid-env "$MID_ENV_PATH")
fi
if [[ -n "${FRONT_CONTRACTS_PATH:-}" ]]; then
  SYNC_ARGS+=(--front-json "$FRONT_CONTRACTS_PATH")
fi
if [[ -n "${DEPLOYMENTS_JSON_PATH:-}" ]]; then
  SYNC_ARGS+=(--deployments-json "$DEPLOYMENTS_JSON_PATH")
fi
if [[ "${SKIP_MID_ENV_SYNC:-0}" == "1" ]]; then
  SYNC_ARGS+=(--skip-mid-env)
fi

node script/sync-deployment-addresses.mjs "${SYNC_ARGS[@]}"

echo "deployment + middleware/frontend sync complete for chain ${CHAIN_ID}"

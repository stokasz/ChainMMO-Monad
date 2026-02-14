#!/usr/bin/env bash
set -euo pipefail

dotenv_get() {
  local dotenv_path="$1"
  local key="$2"
  DOTENV_PATH="$dotenv_path" DOTENV_KEY="$key" python3 - <<'PY'
import os, re, sys

path = os.environ["DOTENV_PATH"]
key = os.environ["DOTENV_KEY"]

val = ""
try:
  with open(path, "r", encoding="utf-8", errors="replace") as f:
    for raw in f:
      line = raw.strip()
      if not line or line.startswith("#"):
        continue
      m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$", line)
      if not m:
        continue
      k, v = m.group(1), m.group(2)
      if k != key:
        continue
      if len(v) >= 2 and ((v[0] == v[-1] == '"') or (v[0] == v[-1] == "'")):
        v = v[1:-1]
      val = v
      break
except FileNotFoundError:
  val = ""

sys.stdout.write(val)
PY
}

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <environment>" >&2
  echo "  environment: testnet | mainnet" >&2
  echo "" >&2
  echo "Required env vars:" >&2
  echo "  CHAIN_RPC_URL" >&2
  echo "  DEPLOYER_PRIVATE_KEY" >&2
  exit 2
fi

ENVIRONMENT="$1"
if [[ "$ENVIRONMENT" != "testnet" && "$ENVIRONMENT" != "mainnet" ]]; then
  echo "Invalid environment: $ENVIRONMENT (expected testnet or mainnet)" >&2
  exit 2
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not found. Install GitHub CLI first." >&2
  exit 1
fi

# Optional convenience: load secrets from repo-root .env without sourcing it (it may contain non-shell notes).
DOTENV_PATH="${DOTENV_PATH:-.env}"
ENV_UPPER="$(echo "$ENVIRONMENT" | tr '[:lower:]' '[:upper:]')"
DOTENV_RPC_KEY="ALCHEMY_MONAD_${ENV_UPPER}_RPC_URL"
DOTENV_DEPLOY_KEY="${ENV_UPPER}_DEPLOYER_PRIVATE_KEY"
DOTENV_DEPLOY_KEY_ALT="${ENV_UPPER}_PRIVATE_KEY"

if [[ -z "${CHAIN_RPC_URL:-}" ]]; then
  CHAIN_RPC_URL="$(dotenv_get "$DOTENV_PATH" "$DOTENV_RPC_KEY")"
  if [[ -z "${CHAIN_RPC_URL:-}" ]]; then
    CHAIN_RPC_URL="$(dotenv_get "$DOTENV_PATH" "CHAIN_RPC_URL")"
  fi
fi

if [[ -z "${DEPLOYER_PRIVATE_KEY:-}" ]]; then
  DEPLOYER_PRIVATE_KEY="$(dotenv_get "$DOTENV_PATH" "$DOTENV_DEPLOY_KEY")"
  if [[ -z "${DEPLOYER_PRIVATE_KEY:-}" ]]; then
    DEPLOYER_PRIVATE_KEY="$(dotenv_get "$DOTENV_PATH" "$DOTENV_DEPLOY_KEY_ALT")"
  fi
  if [[ -z "${DEPLOYER_PRIVATE_KEY:-}" ]]; then
    DEPLOYER_PRIVATE_KEY="$(dotenv_get "$DOTENV_PATH" "DEPLOYER_PRIVATE_KEY")"
  fi
  if [[ -z "${DEPLOYER_PRIVATE_KEY:-}" ]]; then
    DEPLOYER_PRIVATE_KEY="$(dotenv_get "$DOTENV_PATH" "PRIVATE_KEY")"
  fi
fi

if [[ -z "${CHAIN_RPC_URL:-}" ]]; then
  echo "Missing CHAIN_RPC_URL in environment (and not found in ${DOTENV_PATH} under ${DOTENV_RPC_KEY} or CHAIN_RPC_URL)." >&2
  exit 1
fi

if [[ -z "${DEPLOYER_PRIVATE_KEY:-}" ]]; then
  echo "Missing DEPLOYER_PRIVATE_KEY in environment (and not found in ${DOTENV_PATH} under ${DOTENV_DEPLOY_KEY}, ${DOTENV_DEPLOY_KEY_ALT}, DEPLOYER_PRIVATE_KEY, or PRIVATE_KEY)." >&2
  exit 1
fi

if ! echo -n "${DEPLOYER_PRIVATE_KEY}" | grep -Eq '^0x[0-9a-fA-F]{64}$'; then
  echo "Invalid DEPLOYER_PRIVATE_KEY (must match 0x + 64 hex chars)." >&2
  exit 1
fi

echo "Setting GitHub Environment secrets for: $ENVIRONMENT"
printf %s "$CHAIN_RPC_URL" | gh secret set CHAIN_RPC_URL --env "$ENVIRONMENT" >/dev/null
printf %s "$DEPLOYER_PRIVATE_KEY" | gh secret set DEPLOYER_PRIVATE_KEY --env "$ENVIRONMENT" >/dev/null

echo "Done. Current env secrets:"
gh secret list --env "$ENVIRONMENT"

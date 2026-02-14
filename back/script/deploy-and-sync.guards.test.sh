#!/usr/bin/env bash
set -euo pipefail

# Lightweight guard tests for deploy-and-sync.sh.
# These tests stub out external tooling (forge/python3/node/cast) so they can run
# without Foundry or network access.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEPLOY_SCRIPT="${BACK_DIR}/script/deploy-and-sync.sh"

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "${TMP_DIR}"; }
trap cleanup EXIT

BIN_DIR="${TMP_DIR}/bin"
mkdir -p "${BIN_DIR}"

cat >"${BIN_DIR}/cast" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" != "chain-id" ]]; then
  echo "unexpected cast args: $*" >&2
  exit 2
fi
echo "${CAST_CHAIN_ID:-0}"
EOF
chmod +x "${BIN_DIR}/cast"

cat >"${BIN_DIR}/forge" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exit 0
EOF
chmod +x "${BIN_DIR}/forge"

cat >"${BIN_DIR}/python3" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exit 0
EOF
chmod +x "${BIN_DIR}/python3"

cat >"${BIN_DIR}/node" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exit 0
EOF
chmod +x "${BIN_DIR}/node"

export PATH="${BIN_DIR}:${PATH}"

export RPC_URL="http://example.invalid"
export PRIVATE_KEY="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
export DEPLOY_TEST_MMO="false"
export MMO_TOKEN_ADDRESS="0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

echo "[case] fails when RPC chainId mismatches CHAIN_ID"
export CHAIN_ID="143"
export CAST_CHAIN_ID="10143"
if "${DEPLOY_SCRIPT}" >/dev/null 2>&1; then
  echo "expected deploy-and-sync.sh to fail on CHAIN_ID mismatch" >&2
  exit 1
fi

echo "[case] autodetects CHAIN_ID when unset"
unset CHAIN_ID
export CAST_CHAIN_ID="143"
"${DEPLOY_SCRIPT}" >/dev/null

echo "[case] blocks mainnet redeploy when contracts.latest.json already indicates chainId=143"
cat >"${TMP_DIR}/already-mainnet.json" <<'JSON'
{
  "chainId": 143,
  "startBlock": 1,
  "contracts": {
    "mmoToken": "0x1111111111111111111111111111111111111111",
    "gameWorld": "0x2222222222222222222222222222222222222222",
    "feeVault": "0x3333333333333333333333333333333333333333",
    "items": "0x4444444444444444444444444444444444444444",
    "distributor": null,
    "tradeEscrow": "0x5555555555555555555555555555555555555555",
    "rfqMarket": "0x6666666666666666666666666666666666666666"
  }
}
JSON
export CHAIN_ID="143"
export CAST_CHAIN_ID="143"
export DEPLOYMENTS_JSON_PATH="${TMP_DIR}/already-mainnet.json"
if "${DEPLOY_SCRIPT}" >/dev/null 2>&1; then
  echo "expected deploy-and-sync.sh to refuse mainnet redeploy by default" >&2
  exit 1
fi

echo "[case] allows mainnet redeploy when explicitly overridden"
export ALLOW_MAINNET_REDEPLOY="true"
"${DEPLOY_SCRIPT}" >/dev/null

echo "ok"

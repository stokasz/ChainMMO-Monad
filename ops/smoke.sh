#!/usr/bin/env bash
set -euo pipefail

# Post-deploy smoke checks for the public site/API and (optionally) the chain.
#
# Usage:
#   RPC_URL=... ./ops/smoke.sh
#
# Optional env:
#   WEB_URL=https://test.chainmmo.com
#   API_URL=https://api.test.chainmmo.com
#   DUAL_ORIGIN_SMOKE=true
#   TESTNET_ORIGIN_URL=https://test.chainmmo.com
#   MAINNET_ORIGIN_URL=https://chainmmo.com
#   TESTNET_EXPECT_CHAIN_ID=10143
#   MAINNET_EXPECT_CHAIN_ID=143
#   MAINNET_ALLOW_MAINTENANCE=true

WEB_URL="${WEB_URL:-https://test.chainmmo.com}"
API_URL="${API_URL:-https://test.chainmmo.com}"
RPC_URL="${RPC_URL:-}"
DUAL_ORIGIN_SMOKE="${DUAL_ORIGIN_SMOKE:-false}"
TESTNET_ORIGIN_URL="${TESTNET_ORIGIN_URL:-https://test.chainmmo.com}"
MAINNET_ORIGIN_URL="${MAINNET_ORIGIN_URL:-https://chainmmo.com}"
TESTNET_EXPECT_CHAIN_ID="${TESTNET_EXPECT_CHAIN_ID:-10143}"
MAINNET_EXPECT_CHAIN_ID="${MAINNET_EXPECT_CHAIN_ID:-143}"
MAINNET_ALLOW_MAINTENANCE="${MAINNET_ALLOW_MAINTENANCE:-true}"

echo "smoke web=$WEB_URL api=$API_URL rpc=${RPC_URL:+set}"

parse_chain_id() {
  local json_file="$1"
  python3 - "$json_file" <<'PY'
import json,sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    data=json.load(fh)
chain_id=data.get("chainId")
if chain_id is None:
    raise SystemExit("missing_chain_id")
print(int(chain_id))
PY
}

is_maintenance_payload() {
  local payload_file="$1"
  python3 - "$payload_file" <<'PY'
import json,sys,re
raw=open(sys.argv[1], "r", encoding="utf-8").read()
patterns=[r"maintenance", r"coming.?soon", r"mainnet", r"not live", r"unavailable"]
text=raw.lower()
if any(re.search(p, text) for p in patterns):
    print("yes")
    raise SystemExit(0)
try:
    data=json.loads(raw)
except Exception:
    raise SystemExit(1)
blob=json.dumps(data).lower()
if any(re.search(p, blob) for p in patterns):
    print("yes")
    raise SystemExit(0)
raise SystemExit(1)
PY
}

check_origin_mapping() {
  local origin_url="$1"
  local expected_chain_id="$2"
  local allow_maintenance="$3"
  local label="$4"

  local health_tmp
  health_tmp="$(mktemp)"
  local health_status
  health_status="$(curl -sS -o "$health_tmp" -w "%{http_code}" "${origin_url}/health" || true)"

  if [[ "$health_status" == "200" ]]; then
    local health_chain_id
    health_chain_id="$(parse_chain_id "$health_tmp")"
    if [[ "$health_chain_id" != "$expected_chain_id" ]]; then
      echo "${label} /health chainId mismatch: expected=${expected_chain_id} got=${health_chain_id}" >&2
      rm -f "$health_tmp"
      exit 1
    fi
    echo "${label} /health ok chainId=${health_chain_id}"
  else
    if [[ "$allow_maintenance" == "true" ]] && is_maintenance_payload "$health_tmp" >/dev/null 2>&1; then
      echo "${label} /health maintenance accepted (status=${health_status})"
    else
      echo "${label} /health failed: status=${health_status}" >&2
      rm -f "$health_tmp"
      exit 1
    fi
  fi
  rm -f "$health_tmp"

  local contracts_tmp
  contracts_tmp="$(mktemp)"
  local contracts_status
  contracts_status="$(curl -sS -o "$contracts_tmp" -w "%{http_code}" "${origin_url}/meta/contracts" || true)"
  if [[ "$contracts_status" == "200" ]]; then
    local contracts_chain_id
    contracts_chain_id="$(parse_chain_id "$contracts_tmp")"
    if [[ "$contracts_chain_id" != "$expected_chain_id" ]]; then
      echo "${label} /meta/contracts chainId mismatch: expected=${expected_chain_id} got=${contracts_chain_id}" >&2
      rm -f "$contracts_tmp"
      exit 1
    fi
    echo "${label} /meta/contracts ok chainId=${contracts_chain_id}"
  else
    if [[ "$allow_maintenance" == "true" ]] && is_maintenance_payload "$contracts_tmp" >/dev/null 2>&1; then
      echo "${label} /meta/contracts maintenance accepted (status=${contracts_status})"
    else
      echo "${label} /meta/contracts failed: status=${contracts_status}" >&2
      rm -f "$contracts_tmp"
      exit 1
    fi
  fi
  rm -f "$contracts_tmp"

  if [[ "$expected_chain_id" == "143" ]]; then
    local external_tmp
    external_tmp="$(mktemp)"
    local external_status
    external_status="$(curl -sS -o "$external_tmp" -w "%{http_code}" "${origin_url}/meta/external" || true)"
    if [[ "$external_status" == "200" ]]; then
      python3 - "$external_tmp" "$expected_chain_id" <<'PY'
import json,re,sys
payload=json.load(open(sys.argv[1], "r", encoding="utf-8"))
expected=int(sys.argv[2])
chain_id=payload.get("chainId")
if chain_id is None or int(chain_id) != expected:
    raise SystemExit("external_chain_id_mismatch")
mmo=payload.get("mmo") or {}
addr_re=re.compile(r"^0x[a-fA-F0-9]{40}$")
for k in ["tokenAddress","poolAddress"]:
    v=mmo.get(k)
    if not isinstance(v, str) or not addr_re.match(v):
        raise SystemExit(f"external_invalid_{k}")
source=mmo.get("source")
if not isinstance(source, str) or len(source.strip()) == 0:
    raise SystemExit("external_invalid_source")
print("ok")
PY
      echo "${label} /meta/external ok"
    else
      if [[ "$allow_maintenance" == "true" ]] && is_maintenance_payload "$external_tmp" >/dev/null 2>&1; then
        echo "${label} /meta/external maintenance accepted (status=${external_status})"
      else
        echo "${label} /meta/external failed: status=${external_status}" >&2
        rm -f "$external_tmp"
        exit 1
      fi
    fi
    rm -f "$external_tmp"
  fi

  local leaderboard_tmp
  leaderboard_tmp="$(mktemp)"
  local leaderboard_status
  leaderboard_status="$(curl -sS -o "$leaderboard_tmp" -w "%{http_code}" "${origin_url}/leaderboard?mode=live&limit=1" || true)"
  if [[ "$leaderboard_status" == "200" ]]; then
    python3 - "$leaderboard_tmp" <<'PY'
import json,sys
payload=json.load(open(sys.argv[1], "r", encoding="utf-8"))
if "items" not in payload:
    raise SystemExit("leaderboard_missing_items")
if not isinstance(payload["items"], list):
    raise SystemExit("leaderboard_items_not_list")
print("ok")
PY
    echo "${label} /leaderboard ok"
  else
    if [[ "$allow_maintenance" == "true" ]] && is_maintenance_payload "$leaderboard_tmp" >/dev/null 2>&1; then
      echo "${label} /leaderboard maintenance accepted (status=${leaderboard_status})"
    else
      echo "${label} /leaderboard failed: status=${leaderboard_status}" >&2
      rm -f "$leaderboard_tmp"
      exit 1
    fi
  fi
  rm -f "$leaderboard_tmp"
}

curl -fsS "${API_URL}/health" >/dev/null

meta_json="$(curl -fsS "${API_URL}/meta/contracts")"
echo "$meta_json" | python3 -c '
import json,sys
d=json.load(sys.stdin)
required=["chainId","gameWorld","items","mmoToken","feeVault","tradeEscrow","rfqMarket"]
missing=[k for k in required if k not in d]
if missing:
  raise SystemExit(f"meta/contracts missing keys: {missing}")
if "distributor" in d and d["distributor"] is not None and not isinstance(d["distributor"], str):
  raise SystemExit("meta/contracts distributor must be string or null when present")
print("meta ok: chainId={} gameWorld={}".format(d["chainId"], d["gameWorld"]))
'

diag_tmp="$(mktemp)"
diag_status="$(curl -sS -o "$diag_tmp" -w "%{http_code}" "${API_URL}/meta/diagnostics" || true)"
if [[ "$diag_status" == "200" ]]; then
  diag_json="$(cat "$diag_tmp")"
  echo "$diag_json" | python3 -c '
import json,sys
d=json.load(sys.stdin)
required=["nowUnix","chainId","indexer","leaderboard"]
missing=[k for k in required if k not in d]
if missing:
  raise SystemExit(f"meta/diagnostics missing keys: {missing}")
if not isinstance(d.get("indexer"), dict) or not isinstance(d.get("leaderboard"), dict):
  raise SystemExit("meta/diagnostics indexer/leaderboard type mismatch")
cursor=d["indexer"].get("cursor")
if cursor is not None:
  for k in ["lastProcessedBlock","lastProcessedLogIndex","updatedAt"]:
    if k not in cursor:
      raise SystemExit(f"meta/diagnostics cursor missing key: {k}")
print("diagnostics ok: chainId={} head={} cursor={}".format(
  d["chainId"],
  d["indexer"].get("chainHeadBlock"),
  cursor.get("lastProcessedBlock") if cursor else None
))
'
elif [[ "$diag_status" == "404" ]]; then
  echo "diagnostics skip: /meta/diagnostics not deployed"
else
  echo "diagnostics failed: status=$diag_status" >&2
  exit 1
fi
rm -f "$diag_tmp"

curl -fsS "${API_URL}/leaderboard?mode=live&limit=1" >/dev/null

rewards_tmp="$(mktemp)"
rewards_status="$(curl -sS -o "$rewards_tmp" -w "%{http_code}" "${API_URL}/meta/rewards" || true)"
if [[ "$rewards_status" == "200" ]]; then
  rewards_json="$(cat "$rewards_tmp")"
  echo "$rewards_json" | python3 -c '
import json,sys
d=json.load(sys.stdin)
required=["chainId","windowEpochs","sampleEpochs","avgFeesForPlayersWei","latestFinalizedEpoch"]
missing=[k for k in required if k not in d]
if missing:
  raise SystemExit(f"meta/rewards missing keys: {missing}")
print("rewards ok: chainId={} window={} sample={}".format(d["chainId"], d["windowEpochs"], d["sampleEpochs"]))
'
elif [[ "$rewards_status" == "404" ]]; then
  echo "rewards skip: /meta/rewards not deployed"
else
  echo "rewards failed: status=$rewards_status" >&2
  exit 1
fi
rm -f "$rewards_tmp"

playbook_tmp="$(mktemp)"
playbook_status="$(curl -sS -o "$playbook_tmp" -w "%{http_code}" "${API_URL}/meta/playbook" || true)"
if [[ "$playbook_status" == "200" ]]; then
  playbook_json="$(cat "$playbook_tmp")"
  echo "$playbook_json" | python3 -c '
import json,sys
d=json.load(sys.stdin)
sections=d.get("sections", [])
if not isinstance(sections, list) or len(sections) == 0:
  raise SystemExit("meta/playbook sections missing/empty")
first=sections[0]
print("playbook ok: sections={} first={}".format(len(sections), first.get("id")))
'
elif [[ "$playbook_status" == "404" ]]; then
  echo "playbook skip: /meta/playbook not deployed"
else
  echo "playbook failed: status=$playbook_status" >&2
  exit 1
fi
rm -f "$playbook_tmp"

curl -fsS "${WEB_URL}/robots.txt" >/dev/null
curl -fsS "${WEB_URL}/sitemap.xml" >/dev/null
curl -fsS "${WEB_URL}/og.png" >/dev/null
curl -fsS "${WEB_URL}/favicon.ico" >/dev/null

if [[ -n "$RPC_URL" ]] && command -v cast >/dev/null 2>&1; then
  gameworld="$(echo "$meta_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["gameWorld"])')"
  chain_id="$(echo "$meta_json" | python3 -c 'import json,sys; print(int(json.load(sys.stdin)["chainId"]))')"
  rpc_chain_id="$(cast chain-id --rpc-url "$RPC_URL" | tr -d '\r\n')"
  if [[ "$rpc_chain_id" != "$chain_id" ]]; then
    echo "rpc chain-id mismatch: meta=$chain_id rpc=$rpc_chain_id" >&2
    exit 1
  fi
  cast call "$gameworld" 'nextCharacterId()(uint256)' --rpc-url "$RPC_URL" >/dev/null
  cast call "$gameworld" 'maxLevel()(uint32)' --rpc-url "$RPC_URL" >/dev/null
  echo "on-chain ok: chainId=$chain_id gameWorld=$gameworld"
fi

if [[ "$DUAL_ORIGIN_SMOKE" == "true" ]]; then
  echo "dual-origin smoke testnet=${TESTNET_ORIGIN_URL} mainnet=${MAINNET_ORIGIN_URL}"
  check_origin_mapping "$TESTNET_ORIGIN_URL" "$TESTNET_EXPECT_CHAIN_ID" "false" "testnet-origin"
  check_origin_mapping "$MAINNET_ORIGIN_URL" "$MAINNET_EXPECT_CHAIN_ID" "$MAINNET_ALLOW_MAINTENANCE" "mainnet-origin"
fi

echo "smoke ok"

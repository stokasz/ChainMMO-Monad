#!/usr/bin/env bash
set -euo pipefail

# Basic resource guardrails for the single-server deployment.
# Intended to run via systemd timer and optionally notify via webhook.

DISK_PATH="${DISK_PATH:-/}"
DISK_MAX_PCT="${DISK_MAX_PCT:-85}"
MEM_MIN_MB="${MEM_MIN_MB:-512}"

ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"
ALERT_TIMEOUT_SECONDS="${ALERT_TIMEOUT_SECONDS:-5}"

disk_pct() {
  # df output: ... Use% Mounted on
  df -P "$DISK_PATH" | tail -n1 | awk '{print $5}' | tr -d '%'
}

mem_available_mb() {
  if command -v free >/dev/null 2>&1; then
    # free output: Mem: total used free shared buff/cache available
    free -m | awk '/^Mem:/ {print $7}'
    return 0
  fi
  if [[ -r /proc/meminfo ]]; then
    # MemAvailable: kB -> MB
    awk '/^MemAvailable:/ {print int($2/1024)}' /proc/meminfo
    return 0
  fi
  echo 0
}

maybe_alert() {
  local msg="$1"
  if [[ -z "$ALERT_WEBHOOK_URL" ]]; then
    return 0
  fi
  # Best-effort: do not fail the check due to webhook outage.
  curl -fsS --max-time "$ALERT_TIMEOUT_SECONDS" \
    -H 'content-type: application/json' \
    -X POST \
    -d "{\"service\":\"chainmmo\",\"kind\":\"resourcecheck\",\"message\":$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$msg")}" \
    "$ALERT_WEBHOOK_URL" >/dev/null || true
}

DISK_PCT="$(disk_pct)"
MEM_AVAIL_MB="$(mem_available_mb)"

echo "resourcecheck disk_path=$DISK_PATH disk_pct=${DISK_PCT}% disk_max_pct=${DISK_MAX_PCT}% mem_avail_mb=$MEM_AVAIL_MB mem_min_mb=$MEM_MIN_MB"

failed=0
if [[ "$DISK_PCT" =~ ^[0-9]+$ ]] && [[ "$DISK_PCT" -ge "$DISK_MAX_PCT" ]]; then
  maybe_alert "Disk usage high: ${DISK_PCT}% used on ${DISK_PATH} (threshold ${DISK_MAX_PCT}%)"
  failed=1
fi

if [[ "$MEM_AVAIL_MB" =~ ^[0-9]+$ ]] && [[ "$MEM_AVAIL_MB" -gt 0 ]] && [[ "$MEM_AVAIL_MB" -le "$MEM_MIN_MB" ]]; then
  maybe_alert "Memory low: ${MEM_AVAIL_MB}MB available (threshold ${MEM_MIN_MB}MB)"
  failed=1
fi

if [[ "$failed" -ne 0 ]]; then
  echo "resourcecheck status=fail"
  exit 1
fi

echo "resourcecheck status=ok"

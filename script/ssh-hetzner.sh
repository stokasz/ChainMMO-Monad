#!/usr/bin/env bash
set -euo pipefail

# SSH helper for the Hetzner host used by this repo.
#
# Reads connection info from repo-root `.env` without sourcing it (the file may contain non-shell notes).
#
# Usage:
#   ./script/ssh-hetzner.sh
#   ./script/ssh-hetzner.sh 'docker ps'
#
# Optional env:
#   DOTENV_PATH=.env
#   SSH_TARGET=chainmmo@<ip>
#   SSH_KEY_PATH=~/.ssh/id_ed25519_hetzner
#   SSH_OPTS='-o StrictHostKeyChecking=accept-new'
#   SSH_ALLOW_ROOT=1   # allow root@... if explicitly desired (not recommended)

normalize_path() {
  local p="${1:-}"
  if [[ -z "$p" ]]; then
    return 0
  fi
  P="$p" python3 - <<'PY'
import os

p = os.environ.get("P", "")
p = os.path.expandvars(p)

# Common user error: "$HOME/~/.ssh/..." or "/Users/<user>/~/.ssh/..."
# Expand "~" only works when it's leading; collapse the accidental segment.
p = p.replace("/~/", "/")

p = os.path.expanduser(p)
print(p, end="")
PY
}

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
      k, v = m.group(1), m.group(2).strip()
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

DOTENV_PATH="${DOTENV_PATH:-.env}"

explicit_target="0"
SSH_TARGET="${SSH_TARGET:-}"
if [[ -z "$SSH_TARGET" ]]; then
  SSH_TARGET="$(dotenv_get "$DOTENV_PATH" "HETZNER_SSH_TARGET")"
else
  explicit_target="1"
fi
if [[ -z "$SSH_TARGET" ]]; then
  ssh_user="$(dotenv_get "$DOTENV_PATH" "HETZNER_SSH_USER")"
  host_ipv4="$(dotenv_get "$DOTENV_PATH" "HETZNER_HOST_IPV4")"
  if [[ -n "$ssh_user" && -n "$host_ipv4" ]]; then
    SSH_TARGET="${ssh_user}@${host_ipv4}"
  fi
fi
if [[ -z "$SSH_TARGET" ]]; then
  echo "Missing SSH target. Set SSH_TARGET or HETZNER_SSH_TARGET (or HETZNER_SSH_USER + HETZNER_HOST_IPV4 in ${DOTENV_PATH})." >&2
  exit 2
fi

# Root SSH is disabled on the server (`PermitRootLogin no`). If .env is set to
# root@..., fall back to chainmmo@... unless the caller explicitly opts into root.
SSH_ALLOW_ROOT="${SSH_ALLOW_ROOT:-}"
if [[ "$explicit_target" == "0" && "$SSH_ALLOW_ROOT" != "1" ]]; then
  if [[ "$SSH_TARGET" == root@* ]]; then
    SSH_TARGET="chainmmo@${SSH_TARGET#root@}"
    echo "Note: refusing root SSH target from ${DOTENV_PATH}; using non-root user (${SSH_TARGET%@*})." >&2
  fi
fi

SSH_KEY_PATH="${SSH_KEY_PATH:-}"
if [[ -z "$SSH_KEY_PATH" ]]; then
  SSH_KEY_PATH="$(dotenv_get "$DOTENV_PATH" "HETZNER_SSH_KEY_PATH")"
fi
if [[ -n "$SSH_KEY_PATH" ]]; then
  SSH_KEY_PATH="$(normalize_path "$SSH_KEY_PATH")"
else
  # Sensible default if present.
  if [[ -r "${HOME}/.ssh/id_ed25519_hetzner" ]]; then
    SSH_KEY_PATH="${HOME}/.ssh/id_ed25519_hetzner"
  fi
fi

SSH_OPTS="${SSH_OPTS:-}"

args=()
args+=(-o StrictHostKeyChecking=accept-new)
args+=(-o ConnectTimeout=10)
if [[ -n "$SSH_OPTS" ]]; then
  # shellcheck disable=SC2206
  args+=($SSH_OPTS)
fi
if [[ -n "$SSH_KEY_PATH" ]]; then
  args+=(-i "$SSH_KEY_PATH")
fi
args+=("$SSH_TARGET")

if [[ $# -eq 0 ]]; then
  exec ssh "${args[@]}"
else
  exec ssh "${args[@]}" -- "$@"
fi

#!/usr/bin/env bash
set -euo pipefail

ops_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

env_file="${ENV_FILE:-$ops_dir/.env.devnet.local}"
anvil_pid_file="${ops_dir}/.devnet-anvil.pid"
front_pid_file="${ops_dir}/.devnet-front.pid"

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
  exit 1
fi

echo "Stopping devnet middleware stack"
"$ops_dir/stop-devnet.sh" --env-file "$env_file" >/dev/null 2>&1 || true

if [[ -f "$front_pid_file" ]]; then
  front_pid="$(cat "$front_pid_file")"
  if [[ -n "${front_pid:-}" ]] && kill -0 "$front_pid" >/dev/null 2>&1; then
    kill "$front_pid" >/dev/null 2>&1 || true
    wait "$front_pid" 2>/dev/null || true
  fi
  rm -f "$front_pid_file"
fi

if [[ -f "$anvil_pid_file" ]]; then
  anvil_pid="$(cat "$anvil_pid_file")"
  if [[ -n "${anvil_pid:-}" ]] && kill -0 "$anvil_pid" >/dev/null 2>&1; then
    kill "$anvil_pid" >/dev/null 2>&1 || true
  fi
  rm -f "$anvil_pid_file"
fi

echo "Devnet stack stopped."

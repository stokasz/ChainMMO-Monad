#!/usr/bin/env bash
set -euo pipefail

# Pull server-side Postgres backups to the local machine.
#
# Usage:
#   SSH_HOST=chainmmo@<server-ip> ./ops/pull-postgres-backups.sh
#
# Optional env:
#   SSH_OPTS='-i <path-to-ssh-key>'
#   REMOTE_DIR=/opt/chainmmo/backups/postgres
#   LOCAL_DIR=ops/backups/postgres

SSH_HOST="${SSH_HOST:-}"
SSH_OPTS="${SSH_OPTS:-}"
REMOTE_DIR="${REMOTE_DIR:-/opt/chainmmo/backups/postgres}"
LOCAL_DIR="${LOCAL_DIR:-ops/backups/postgres}"

if [[ -z "$SSH_HOST" ]]; then
  echo "Missing SSH_HOST (example: chainmmo@<server-ip>)" >&2
  exit 2
fi

mkdir -p "$LOCAL_DIR"

echo "pull backups from $SSH_HOST:$REMOTE_DIR -> $LOCAL_DIR"
rsync -avz -e "ssh ${SSH_OPTS}" "${SSH_HOST}:${REMOTE_DIR}/" "${LOCAL_DIR}/"

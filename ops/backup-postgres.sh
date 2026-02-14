#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   cd ops
#   BACKUP_DIR=/opt/chainmmo/backups/postgres RETENTION_DAYS=14 ./backup-postgres.sh
#
# Notes:
# - Requires the `postgres` service from `ops/docker-compose.yml` to be running.
# - Uses `docker compose exec` into the DB container, so no credentials are required.

cd "$(dirname "${BASH_SOURCE[0]}")"

BACKUP_DIR="${BACKUP_DIR:-./backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

mkdir -p "$BACKUP_DIR"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/chainmmo_${TS}.sql.gz"

docker compose exec -T postgres pg_dump -U chainmmo chainmmo | gzip > "$OUT"

# Retention.
find "$BACKUP_DIR" -type f -name '*.sql.gz' -mtime +"$RETENTION_DAYS" -print -delete >/dev/null 2>&1 || true

echo "Wrote ${OUT}"

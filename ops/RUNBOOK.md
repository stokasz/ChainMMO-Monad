# ChainMMO Ops Runbook (Single Server)

This runbook covers two modes:

- **Coolify-managed production (default):** deployments happen via GitHub -> Coolify; Coolify owns the running containers.
- **Break-glass manual stack (only if Coolify is down):** a compose stack that lives at `/opt/chainmmo/repo/ops`.

Do not run the break-glass stack while the Coolify-managed stack is running (port `80/443` conflicts and Postgres conflicts).

If the environment is Coolify-managed, prefer Coolify operations (deploy/restart/rollback) instead of manual `docker compose`
on the server. Rollback steps: `ops/COOLIFY_ROLLBACK.md`.

## Quick Health

```sh
# On the server: show what's running (Coolify + apps)
docker ps --format '{{.Names}}\t{{.Ports}}\t{{.Status}}'

# Confirm only one container binds public 80/443 (should be the active edge Caddy)
docker ps --format '{{.Names}}\t{{.Ports}}' | grep -E '(:80->|:443->)' || true

curl -fsS https://api.test.chainmmo.com/health
curl -fsS https://api.test.chainmmo.com/meta/contracts
curl -fsS https://api.test.chainmmo.com/meta/diagnostics
# If DNS for api.test is not propagated yet, temporarily use:
# curl -fsS https://test.chainmmo.com/health
# curl -fsS https://test.chainmmo.com/meta/contracts
# curl -fsS https://test.chainmmo.com/meta/diagnostics

# Mainnet origin may intentionally be maintenance until mainnet is live:
curl -i https://chainmmo.com/health
curl -i https://chainmmo.com/meta/contracts
```

Optional: run the bundled smoke script from your local machine:

```sh
cd <repo-root>
./ops/smoke.sh

# With on-chain read checks (requires Foundry cast):
RPC_URL='https://...' ./ops/smoke.sh
```

## External MMO Funding (Testnet/Devnet)

MMO is external-token sourced and not dungeon-fauceted.

Operational checks after deploy:

- verify an unfunded wallet cannot execute MMO-priced actions (`buyPremiumLootboxes` above level 10, repair/run-entry sinks).
- for stand-in token mode (`DEPLOY_TEST_MMO=true`), fund agent wallets from the operator-controlled MMO wallet before MMO-priced action tests.

## Restart / Redeploy / Rollback (Coolify)

Prefer using the Coolify UI (it is intentionally bound to localhost on the server; access via SSH tunnel).

Operational rules:

- After any redeploy/rollback/restart, re-run `./ops/smoke.sh`.
- Expect `test.chainmmo.com` checks to return `200`.
- Expect `chainmmo.com` checks to return either `chainId=143` responses or explicit maintenance payloads until mainnet is live.
- If you must break-glass, stop the Coolify app first so nothing else binds `80/443`.

### Mainnet Bring-Up (Without Breaking Testnet)

You cannot run two stacks that both bind `80/443` on the same host.

Recommended path to wire `main` in Coolify safely while `testnet` is still serving production traffic:

- Create a separate Coolify app for the `main` branch.
- Use `ops/docker-compose.coolify-internal.yml` so the mainnet app does **not** run an edge Caddy.
  - By default it binds the middleware to `127.0.0.1:${HOST_API_PORT:-8788}` (SSH tunnel for access).
- Configure env vars using the key shape from `ops/.env.example` (`CHAIN_ID=143`, `CHAIN_RPC_URL`, and contract addresses from `deployments/contracts.latest.json`).

## Break-Glass: Manual Stack (No Git on Server)

Use only if Coolify is down. Assumes the repo is present at `/opt/chainmmo/repo`.

### Restart Services

```sh
cd /opt/chainmmo/repo/ops

docker compose restart mid
docker compose restart caddy
docker compose restart postgres
```

### Update Deployment (No Git on Server)

Preferred: sync only the files you changed and never overwrite `.env` files.

Examples (run from your local machine):

```sh
# Update compose config
scp ops/docker-compose.yml <user>@<server>:/opt/chainmmo/repo/ops/docker-compose.yml

# Update Caddy routing
scp ops/Caddyfile <user>@<server>:/opt/chainmmo/repo/ops/Caddyfile

# Apply changes
ssh <user>@<server> 'cd /opt/chainmmo/repo/ops && docker compose up -d'
```

## On-Demand Stacks (Devnet/Testnet)

For on-demand environments, use the on-demand override file and scripts:

- `docker-compose.on-demand.yml`:
  - disables auto-restart (`restart: "no"`)
  - exposes the API on localhost (`127.0.0.1:${HOST_API_PORT:-8787}`)
  - prevents `caddy` from starting by default (profile-gated)

Typical pattern on server:

```sh
cd /opt/chainmmo/repo/ops

# Create an env file locally on the server (never commit it)
cp .env .env.testnet

# Start testnet (API on localhost:8787)
./start-testnet.sh --env-file .env.testnet

# Stop testnet
./stop-testnet.sh --env-file .env.testnet
```

To access an on-demand stack from your laptop, use an SSH tunnel:

```sh
ssh -L 8787:127.0.0.1:8787 <user>@<server>
curl -fsS http://127.0.0.1:8787/health
```

## Backups

Backups are produced by `ops/backup-postgres.sh` and are intended to run via systemd timer.

Run a backup manually:

```sh
cd /opt/chainmmo/repo/ops
BACKUP_DIR=/opt/chainmmo/backups/postgres RETENTION_DAYS=14 ./backup-postgres.sh
ls -la /opt/chainmmo/backups/postgres | tail
```

Restore from a backup (destructive):

```sh
cd /opt/chainmmo/repo/ops

# Example:
# gunzip -c /opt/chainmmo/backups/postgres/chainmmo_YYYYMMDDTHHMMSSZ.sql.gz | \
#   docker compose exec -T postgres psql -U chainmmo chainmmo
```

## Systemd Timers (Backups + Healthchecks)

```sh
sudo systemctl list-timers --no-pager | grep chainmmo || true

sudo systemctl status --no-pager chainmmo-pg-backup.timer
sudo systemctl status --no-pager chainmmo-healthcheck.timer
sudo systemctl status --no-pager chainmmo-resourcecheck.timer
```

If you need to disable:

```sh
sudo systemctl disable --now chainmmo-pg-backup.timer
sudo systemctl disable --now chainmmo-healthcheck.timer
sudo systemctl disable --now chainmmo-resourcecheck.timer
```

View recent resourcecheck output:

```sh
sudo journalctl -u chainmmo-resourcecheck.service --no-pager -n 100
```

Optional: configure resource alerts (owner decision: alerts disabled by default):

```sh
sudo systemctl edit chainmmo-resourcecheck.service
```

Then add a drop-in like:

```ini
[Service]
Environment=ALERT_WEBHOOK_URL=https://...
```

## Common Failures

- `502` / blank site:
  - Check `docker compose ps`
  - Restart `mid` then `caddy`
- Postgres unhealthy:
  - `docker compose logs --tail=200 postgres`
  - Confirm disk space: `df -h`
- Let’s Encrypt / TLS issues:
  - `docker compose logs --tail=200 caddy`

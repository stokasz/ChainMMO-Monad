# Coolify Rollback Runbook (ChainMMO)

Scope: rollback a Coolify-managed deployment (example: `chainmmo-testnet`) to the last known-good build.

Goals:

- Restore `200` on the public endpoints fast.
- Avoid secrets leakage (do not paste `.env` values into chat/tickets).
- Keep rollback safe even when database migrations exist.

## Rollback Policy (When To Roll Back)

Rollback is the default response when a new deployment causes any of:

- `GET https://api.test.chainmmo.com/health` is non-`200` for more than 3 minutes after deploy.
- `GET https://api.test.chainmmo.com/meta/contracts` is non-`200`.
- Web statics are broken: `/robots.txt`, `/sitemap.xml`, `/og.png`, `/favicon.ico`.
- API returns persistent `5xx` or empty responses after a container restart.

Do not roll back if the deploy included a non-backwards-compatible database migration and the old version cannot run
against the migrated schema. Instead:

- keep the new version running, or
- hotfix forward, or
- restore the database from backup (only if you have an off-box backup you trust).

Operational rule for this repo: migrations should be additive/backwards-compatible so rollback is always safe.

## Pre-Rollback Checks (Fast)

1. Confirm what is failing:
   - `GET https://api.test.chainmmo.com/health`
   - `GET https://api.test.chainmmo.com/meta/contracts`
   - `GET https://api.test.chainmmo.com/leaderboard?mode=live&limit=1`
   - if `api.test.chainmmo.com` DNS is not propagated yet, use `https://test.chainmmo.com` for the same checks temporarily
   - `GET https://test.chainmmo.com/robots.txt`
   - `GET https://chainmmo.com/health` (expected: chainId `143` when live, or explicit maintenance payload until mainnet is live)
   - Optional local script: `./ops/smoke.sh`
2. Try one restart of the affected service (Coolify "Restart" on the app/service).
3. If it does not recover, proceed to rollback.

## Rollback Steps (Coolify UI)

1. Access the Coolify UI using the existing SSH tunnel flow (Coolify is bound to localhost on the server).
2. In Coolify:
   - Open the application (example: `chainmmo-testnet`).
   - Navigate to the deployment history (often labeled `Deployments`).
   - Identify the last successful deployment before the incident.
   - Click the rollback action for that deployment (often `Rollback` or `Redeploy` on the older entry).
3. Wait until containers are healthy again in the Coolify app view.

## Post-Rollback Verification

Run the same public checks as pre-rollback, plus:

- Confirm the Coolify healthcheck is green (it should be configured to hit `/health`).
- Run `./ops/smoke.sh` from your local machine.

## Aftercare (Prevent Recurrence)

- Record:
  - timestamp (UTC),
  - git commit SHA deployed,
  - the Coolify deployment id you rolled back from/to,
  - observed symptoms (HTTP status codes).
- Create a fix-forward PR:
  - revert the breaking commit(s), or
  - apply a minimal hotfix and re-deploy.

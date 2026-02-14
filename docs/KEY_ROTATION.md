# Key Rotation Runbook (No Secrets)

This doc defines how to rotate ChainMMO secrets without ever committing or pasting key material.

## Rules

- Never commit secrets to git (including `.env` files).
- Never paste secrets into PRs, issues, chat, or CI logs.
- Keep deployer/signer private keys only in:
  - local operator inventory (`/Users/stokarz/Code/chainmmo/.env`, untracked), and
  - runtime secret stores (Coolify env vars, GitHub Environment secrets).

## What Can Be Rotated

- `DEPLOYER_PRIVATE_KEY` (GitHub Environment secret; used by `chainmmo-deploy.yml`).
- `SIGNER_PRIVATE_KEY` (Coolify env var; only needed when `MID_MODE=full`).
- `API_KEY` (Coolify env var; gates `GET /metrics` only).
- RPC credentials (provider keys/URLs), e.g. `CHAIN_RPC_URL` (GitHub Environment secret + Coolify env var).
- Domain/DNS API tokens (kept only in local operator inventory, not required at runtime for the stack).

## When To Rotate

- Immediately after any suspected leak (accidental paste, terminal scrollback capture, wrong commit, etc).
- When a collaborator with access to runtime secrets is removed.
- Periodically (recommended: quarterly) for keys used in CI/CD.

## Rotation Steps

### 1) Rotate GitHub Environment secrets (CI deploy)

Applies to: `CHAIN_RPC_URL`, `DEPLOYER_PRIVATE_KEY`.

- Update secrets for `testnet` (and later `mainnet`) using GitHub UI, or:
  - `script/gh-set-env-secrets.sh testnet`
  - `script/gh-set-env-secrets.sh mainnet`

Notes:

- The script reads from repo-root `.env` without `source` (safe for non-shell lines).
- The script prints only secret *names* and timestamps (`gh secret list`), never values.

### 2) Rotate Coolify runtime secrets

Applies to: `CHAIN_RPC_URL`, `API_KEY`, and (only if enabling writes) `SIGNER_PRIVATE_KEY`.

In Coolify:

1. Update the application environment variables.
2. Redeploy/restart the app.

### 3) On-chain deployer key rotation (if deploying new contracts)

If you rotate `DEPLOYER_PRIVATE_KEY` and then deploy:

- The deployer address on-chain changes.
- `chainmmo-deploy.yml` will still sync `deployments/contracts.latest.json` + `front/contracts.latest.json` and will
  wait for Coolify to serve the new `gameWorld` before running `ops/smoke.sh`.

## Verification Checklist (After Any Rotation)

1. Confirm public endpoints:
   - `GET https://test.chainmmo.com/health`
   - `GET https://test.chainmmo.com/meta/contracts`
   - `GET https://test.chainmmo.com/meta/diagnostics`
   - `GET https://test.chainmmo.com/robots.txt`
2. Run local smoke:
   - `WEB_URL=https://test.chainmmo.com API_URL=https://test.chainmmo.com ./ops/smoke.sh`

## Emergency Response (Suspected Leak)

1. Rotate the affected secret(s) immediately.
2. If a chain private key may be compromised:
   - move funds/tokens out of the compromised address,
   - stop any processes that can sign transactions with that key,
   - rotate to a new key in all secret stores.
3. Record (privately): what leaked, where, and what was rotated.

# ChainMMO Codex Onboarding (No Secrets)

This file is for **Codex instances maintaining this repo**.

Goal: get productive fast (repo map, infra/deploy model, verification commands) while keeping production safe.

## Non-Negotiables

- Never commit or paste secrets (including any `.env` contents). Do not `cat .env`.
- Never hardcode contract addresses. Always source from:
  - repo: `deployments/contracts.latest.json`, or
  - live: `GET https://test.chainmmo.com/meta/contracts`
- No boilerplate or placeholder code in production paths.
- Prefer small, test-backed changes with clear rollback points.
- Keep CI parity: local verification should match `.github/workflows/chainmmo-ci.yml`.

## Repo Map

- `back/`: Solidity contracts + Foundry tests/scripts.
- `mid/`: TypeScript middleware (read API + indexer + optional action engine + MCP server).
- `front/`: static web assets served by `mid`.
- `deployments/`: source-of-truth contract address manifests (`contracts.latest.json`).
- `ops/`: Docker Compose + Caddy + runbooks/scripts for the single-server stack.
- `docs/`: human docs (`CODEX_HANDOFF`, quickstart/playbooks, etc).

## Branch + Chain Map

- `devnet` -> local Anvil `31337` (on-demand only)
- `testnet` -> Monad testnet `10143`
  - currently deployed by Coolify as public beta (`chainmmo-testnet`)
  - can be switched to on-demand later, but today is treated as production
- `main` -> Monad mainnet `143` (planned)
  - currently active: `https://chainmmo.com` is serving chainId `143` responses
  - use `main` as the source branch for mainnet-targeted app code changes

## Domain Plan (Owner Decision)

- Required separation policy:
  - `https://test.chainmmo.com` must serve testnet (`chainId=10143`) contracts + indexer state.
  - `https://chainmmo.com` (and optional `https://api.chainmmo.com`) must serve mainnet (`chainId=143`) only.
- Current state: `chainmmo.com` is live with mainnet data (`chainId=143`) and should continue to remain
  mainnet-only (never testnet state).
- If there is any planned mainnet pause, prefer an explicit maintenance response instead of testnet fallbacks.
- If live infra is not yet compliant with this policy, treat it as an active gap and follow `TODO.md`.
- X-linking (wallet ↔ X account) is implemented in repository code, but should be treated as **not live on
  mainnet until:
  - mainnet frontend/container is rebuilt from a commit containing current `front/src/App.tsx` X-link UI
  - mainnet middleware is rebuilt from current `mid/src/agent-api/server.ts` handlers
  - X OAuth envs are set on the mainnet Coolify app:
    `X_CONSUMER_KEY`, `X_CONSUMER_SECRET`, `X_OAUTH_CALLBACK_URL`, `X_WEB_ORIGIN`
    (expected callback: `https://chainmmo.com/auth/x/callback`)
- After this rollout, verify on mainnet:
  - `curl -X POST https://chainmmo.com/auth/x/start` returns non-404
  - site JS bundle contains `Link X` and `/auth/x` references
- `POST /auth/x/start` returning 404 means the route is from an older deployed frontend/middleware image.

## Deploy Model

### 1) App Deploy (GitHub -> Coolify)

Production is deployed by Coolify.

- testnet app:
  - deploy path is branch-based and currently uses `testnet`.
- mainnet app:
  - deploy path is branch-based and currently uses `main`.
- endpoint-driven manual/webhook triggers are supported (`/webhooks/source/github/events/manual`) when configured.

Coolify deploy triggers are restricted to these **watch paths**:

- `ops/**`
- `mid/**`
- `front/**`
- `deployments/contracts.latest.json`
- `front/contracts.latest.json`

Rule:

- Do not push changes under watch paths to `testnet` unless you intend to deploy.
- Docs-only changes are safe and should not trigger a deploy.

### Mainnet X-link rollout checklist (wallet ↔ X)

Use this exact sequence when enabling X-link on `chainmmo.com`:

1. Merge the desired code changes into `main`.
2. On mainnet Coolify app env, set:
   - `X_CONSUMER_KEY`
   - `X_CONSUMER_SECRET`
   - `X_OAUTH_CALLBACK_URL=https://chainmmo.com/auth/x/callback`
   - `X_WEB_ORIGIN=https://chainmmo.com`
3. Redeploy the mainnet app from `main` (or trigger a manual webhook deploy).
4. Wait for `https://chainmmo.com/auth/x/start` to return anything except `404`.
5. Validate mainnet assets are updated:
   - `curl https://chainmmo.com/ | rg 'Link X|/auth/x'` (or equivalent)
   - `POST https://chainmmo.com/auth/x/start` should return success with an OAuth authorization URL.
6. Validate linked profile surface:
   - `curl 'https://chainmmo.com/leaderboard?mode=live'` should include `ownerProfile` on mapped rows.
7. Health checks and rollback readiness:
   - `GET https://chainmmo.com/health` and `chainId=143`
   - `GET https://chainmmo.com/meta/contracts` and `chainId=143`
   - Rollback is safe at app level; DB migration `002_x_linking.sql` is additive.

### 2) Contract Deploy + Address Sync

Address source-of-truth:

- `deployments/contracts.latest.json`
- `front/contracts.latest.json` (served as `/contracts.latest.json`)

Note:

- `deployments/contracts.latest.json` also includes `startBlock` (deployment block).
  - Middleware uses this to avoid indexing from genesis on fresh DBs.

Local (Anvil) deploy + sync:

```sh
cd back
PRIVATE_KEY=0x... RPC_URL=http://127.0.0.1:8555 CHAIN_ID=31337 ./script/deploy-and-sync.sh
```

CI deploy (testnet/mainnet):

- GitHub workflow: `.github/workflows/chainmmo-deploy.yml`
- Runs `forge` prod tests, deploys, syncs address artifacts, commits them back to the branch, then waits for Coolify
  to serve the new addresses and runs `./ops/smoke.sh`.
- Safety gates:
  - `confirm_testnet=true` is required for testnet deploys
  - `confirm_mainnet=true` is required for mainnet deploys

Secrets (never commit):

- GitHub Environment secrets (if using CI deploy):
  - `testnet`: `CHAIN_RPC_URL`, `DEPLOYER_PRIVATE_KEY`
  - `mainnet`: `CHAIN_RPC_URL` (deployer key intentionally deferred until pre-mainnet)
- Local operator inventory (untracked): repo-root `.env` contains keys like:
  - `ALCHEMY_MONAD_TESTNET_RPC_URL`, `ALCHEMY_MONAD_MAINNET_RPC_URL`
  - `TESTNET_DEPLOYER_PRIVATE_KEY`, `MAINNET_DEPLOYER_PRIVATE_KEY`

### 3) Middleware Contract Address Loading

Middleware loads/validates contract addresses from `deployments/contracts.latest.json` at runtime and fails fast if
`CHAIN_ID` mismatches the manifest.

Do not manually hardcode or paste addresses into env files.

## Server Access (No Secrets)

Server SSH targets and RPC URLs live in repo-root `.env` (untracked). Do not print them.

Primary ops docs:

- `ops/RUNBOOK.md`
- `ops/COOLIFY_ROLLBACK.md`
- `ops/RPC.md`
- `docs/CODEX_HANDOFF.md`
- `docs/KEY_ROTATION.md`

## Verification (Required)

Local smoke (hits live endpoints by default):

```sh
./ops/smoke.sh
```

Public endpoints to keep healthy:

- `GET https://test.chainmmo.com/health`
- `GET https://test.chainmmo.com/meta/contracts`
- `GET https://test.chainmmo.com/meta/diagnostics`
- `GET https://test.chainmmo.com/robots.txt`
- `GET https://test.chainmmo.com/sitemap.xml`
- `GET https://test.chainmmo.com/og.png`
- `GET https://test.chainmmo.com/favicon.ico`

Dual-origin network checks (required):

- `GET https://test.chainmmo.com/health` -> `chainId=10143`
- `GET https://test.chainmmo.com/meta/contracts` -> `chainId=10143`
- `GET https://chainmmo.com/health` -> `chainId=143` 
- `GET https://chainmmo.com/meta/contracts` -> `chainId=143`

Server sanity (run on the server, never paste secrets):

- `docker ps` should show Coolify + only one ChainMMO stack binding `80/443`
- never start the legacy manual stack at `/opt/chainmmo/repo/ops` while Coolify-managed stack is running
- **Port ownership guardrail (prevents “mystery 502”):** confirm exactly one container binds public `:80`/`:443` and that it is the Coolify-managed edge Caddy.
  - Check: `docker ps --format '{{.Names}}\t{{.Ports}}' | grep -E '(:80->|:443->)' || true`
  - If the binder is an `ops-*` Caddy (legacy/manual stack) while Coolify is running, stop/remove the `ops-*` containers so the Coolify app edge can start and take `80/443`.

## Workflow (Strict Delivery Loop)

1. Check sources:
   - `back/README.md`
   - `mid/README.md`
   - `.github/workflows/chainmmo-ci.yml`
   - `.github/workflows/chainmmo-deploy.yml`
   - `deployments/contracts.latest.json`
   - `TODO.md` (current execution priority + acceptance criteria)
2. Test-driven development (smallest failing test first):
   - Solidity tests: `back/test/**`
   - Middleware tests: `mid/tests/**`
3. Iterative testing (fast checks after each meaningful edit)
4. Final verification (CI parity)
5. Push (deploy-aware: watch paths can trigger Coolify)
6. Promotion path:
   - execute and verify sprint work on `devnet` first (local infra / Anvil)
   - merge/promote to `testnet` only after acceptance criteria pass
   - never promote to `main` pre-mainnet readiness

## Priority Policy (Always)

- `TODO.md` is the source of truth for active execution priorities.
- On each new task/session, review `TODO.md` and pick applicable unchecked items (prefer `P0` first unless user redirects).
- Do not rely on hardcoded priority lists in `AGENTS.md`; this file defines process/policy, not sprint contents.
- When improving blind-agent behavior, treat MCP/playbook as source of truth:
  - `mid/playbook/MCP_PLAYBOOK.md`
  - `mid/src/mcp-server/run-mcp.ts`
  - `mid/src/agent-api/server.ts`
  - `mid/src/agent-api/read-model.ts`

## Command Catalog

Run commands from repo root unless noted.

### Contracts (`back`)

```sh
cd back

./script/solar-dev-check.sh

forge fmt --check
forge build --use solc:0.8.26
python3 script/check-contract-sizes.py --preset monad
forge test -vv --use solc:0.8.26
```

Local Anvil:

```sh
anvil --port 8555 --chain-id 31337 --code-size-limit 40000
```

### Middleware (`mid`)

```sh
cd mid
npm ci
npm run migrate
npm run lint
npm test
npm run build
npm run dev
```

MCP server (local, points at a running API):

```sh
cd mid
AGENT_API_BASE_URL=https://test.chainmmo.com npm run mcp
```

Notes:

- Hosted API is expected to stay read-only in production; MCP action tools are auto-disabled when `/health` reports
  `actionsEnabled=false`.

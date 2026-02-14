# Deterministic Runbooks (Local / Dev / Prod)

This document defines repeatable command sequences for ChainMMO environments.

## Invariants

- Never hardcode contract addresses.
  - Repo source: `deployments/contracts.latest.json`
  - Live source: `GET /meta/contracts`
- Never print or commit secrets (`.env`, keys, RPC URLs with credentials).
- Branch to chain mapping:
  - `devnet` -> `31337`
  - `testnet` -> `10143`
  - `main` -> `143`
- Production posture is read-first by default (`MID_MODE=read-only`, `actionsEnabled=false`).

## Runbook A: Local Devnet (Fast Iteration, `31337`)

Use this for deterministic local contract + middleware development.

1. Start Anvil.

```sh
anvil --port 8555 --chain-id 31337 --code-size-limit 40000
```

2. Deploy contracts and sync manifests.

```sh
cd back
PRIVATE_KEY=0x... RPC_URL=http://127.0.0.1:8555 CHAIN_ID=31337 ./script/deploy-and-sync.sh
```

3. Verify contract-side CI parity checks.

```sh
cd back
./script/solar-dev-check.sh
forge fmt --check
forge build --use solc:0.8.26
python3 script/check-contract-sizes.py --preset monad
forge test -vv --use solc:0.8.26
```

4. Start middleware and migrate DB.

```sh
cd mid
npm ci
npm run migrate
npm run dev
```

5. Verify API surface and chain ID.

```sh
curl -fsS http://127.0.0.1:8787/health
curl -fsS http://127.0.0.1:8787/meta/contracts
curl -fsS 'http://127.0.0.1:8787/leaderboard?mode=live&limit=5'
```

Pass criteria:

- `/health.chainId` is `31337`.
- `/meta/contracts.chainId` is `31337`.
- Middleware starts without contract-manifest mismatch errors.

## Runbook B: Local Testnet Full Mode (`10143`, action tooling enabled)

Use this when you need API/MCP action tools in a controlled environment.

1. Prepare private local env file.

```sh
cd ops
cp .env.example .env.testnet.local
```

Set at least:

- `POSTGRES_PASSWORD`
- `MID_MODE=full`
- `SIGNER_PRIVATE_KEY` (low-funded hot wallet only)
- `CHAIN_RPC_URL` (Monad testnet)
- `CHAIN_ID=10143`
- `API_KEY` (recommended)
- `HOST_API_BIND=127.0.0.1`
- `HOST_API_PORT=8787`

2. Start local testnet stack.

```sh
cd ops
./start-testnet.sh --env-file .env.testnet.local
```

3. Verify write readiness and metadata.

```sh
curl -fsS http://127.0.0.1:8787/health
curl -fsS http://127.0.0.1:8787/meta/contracts
curl -fsS http://127.0.0.1:8787/agent/bootstrap
```

Pass criteria:

- `/health.chainId` is `10143`.
- `/health.actionsEnabled` is `true`.
- `/meta/contracts.chainId` is `10143`.

4. Run MCP client against local API.

```sh
cd mid
AGENT_API_KEY=... AGENT_API_BASE_URL=http://127.0.0.1:8787 npm run mcp
```

5. Stop stack after run.

```sh
cd ops
./stop-testnet.sh --env-file .env.testnet.local
```

## Runbook C: Production/Testnet Verification (Read-First)

Use this for rollout validation of hosted environments.

1. Run smoke checks from repo root.

```sh
./ops/smoke.sh

# Dual-origin gate (enforces testnet/mainnet origin mapping)
DUAL_ORIGIN_SMOKE=true \
TESTNET_ORIGIN_URL=https://test.chainmmo.com \
MAINNET_ORIGIN_URL=https://chainmmo.com \
MAINNET_ALLOW_MAINTENANCE=true \
./ops/smoke.sh
```

2. Validate dual-origin network separation.

```sh
curl -fsS https://api.test.chainmmo.com/health
curl -fsS https://api.test.chainmmo.com/meta/contracts
curl -fsS https://chainmmo.com/health
curl -fsS https://chainmmo.com/meta/contracts
```

Pass criteria:

- `api.test.chainmmo.com` resolves to `chainId=10143`.
- `chainmmo.com` resolves to `chainId=143`, or explicit maintenance mode until mainnet is live.
- Main domain never serves testnet leaderboard/state.

3. Verify static assets are healthy.

```sh
curl -fsS https://test.chainmmo.com/robots.txt
curl -fsS https://test.chainmmo.com/sitemap.xml
curl -fsS https://test.chainmmo.com/og.png > /tmp/chainmmo-og.png
curl -fsS https://test.chainmmo.com/favicon.ico > /tmp/chainmmo-favicon.ico
```

## Runbook D: Deploy-Aware Promotion Flow

1. Preflight checks (CI parity where applicable).

```sh
cd mid
npm ci
npm run migrate
npm run lint
npm test
npm run build
```

2. Confirm changed files are intentional for deploy trigger.

Deploy-trigger watch paths:

- `ops/**`
- `mid/**`
- `front/**`
- `deployments/contracts.latest.json`
- `front/contracts.latest.json`

3. Promotion path:

- Validate work in `devnet` first.
- Promote to `testnet` only after acceptance checks pass.
- Do not promote to `main` before explicit mainnet readiness.

4. Post-deploy validation.

```sh
./ops/smoke.sh
```

If smoke fails, follow rollback runbook:

- `ops/COOLIFY_ROLLBACK.md`

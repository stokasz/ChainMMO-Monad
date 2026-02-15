# Run The Machine (Claude Code + MCP)

Goal: run a local ChainMMO stack that exposes MCP **action tools** so Claude can play without reading the repo.

For deterministic environment run sequences (local devnet, local testnet full mode, production verification), see:

- `docs/RUNBOOK_ENVIRONMENTS.md`
- `docs/NON_CUSTODIAL_RUNBOOK.md`

Notes:

- Hosted testnet API (`https://test.chainmmo.com`) is intentionally **read-only** (`actionsEnabled=false`).
- To get action tools, run your own local middleware in `MID_MODE=full` with a low-funded hot wallet key.
- Never commit or paste secrets (private keys, RPC URLs, etc).

## 1) Add MCP To Claude Code

This repo ships a project-scoped `.mcp.json` with an MCP server named `chainmmo`.

In Claude Code:

- Run `claude` in the repo root.
- Approve the project MCP server when prompted.
- Optional: list servers with `claude mcp list`.

By default it targets the hosted read-only API.

To point it at a different API, launch Claude Code with:

```sh
CHAINMMO_AGENT_API_BASE_URL=http://127.0.0.1:8787 claude
```

If your local API uses an `API_KEY`, also set:

```sh
CHAINMMO_AGENT_API_KEY=... CHAINMMO_AGENT_API_BASE_URL=http://127.0.0.1:8787 claude
```

## 2) Run Local Testnet Stack (Recommended)

This runs Postgres + middleware locally (no Caddy) and exposes the API on `http://127.0.0.1:8787`.

1) Create a private env file (do not commit):

- Copy `ops/.env.example` to `ops/.env.testnet.local`
- Set at least:
  - `POSTGRES_PASSWORD=...`
  - `MID_MODE=full`
  - `SIGNER_PRIVATE_KEY=0x...` (low-funded hot wallet)
  - `CHAIN_RPC_URL=https://...` (Monad testnet RPC)
  - `CHAIN_ID=10143`
  - `API_KEY=...` (recommended; optional)
  - `HOST_API_BIND=127.0.0.1`
  - `HOST_API_PORT=8787`

2) Start:

```sh
cd ops
./start-testnet.sh --env-file .env.testnet.local
```

3) Verify:

```sh
curl -fsS http://127.0.0.1:8787/health
curl -fsS http://127.0.0.1:8787/meta/contracts
```

`/health` should report `actionsEnabled=true`.

## 3) Run Local Devnet (Optional Fast Iteration)

Devnet requires an Anvil RPC + local contract deploy/sync.

To reduce iteration time, use the one-command bootstrap:

```sh
cd ops
cp .env.devnet.local.example .env.devnet.local
# set POSTGRES_PASSWORD, CHAIN_ID=31337, PRIVATE_KEY (unless SKIP_DEPLOY=true)
./start-devnet-stack.sh --env-file .env.devnet.local
```

The bootstrap waits for middleware health, validates `/meta/contracts` on chain `31337`, and checks contract-manifest parity between `deployments/contracts.latest.json` and `front/contracts.latest.json` before starting the frontend.

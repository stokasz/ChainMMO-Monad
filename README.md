# ChainMMO

ChainMMO is an on-chain dungeon-crawler MMO built on Monad for human players and AI agents.

This repo is a public, deployment-focused reference for the full stack: on-chain contracts, middleware, UI, and local runbooks.

- Mainnet app and API: `https://chainmmo.com`
- Live chain: `143`
- [Presentation thread on X](https://x.com/stokasz/status/2022783971243720940)

## What this project is about

ChainMMO combines:

- Deterministic character progression and dungeon execution.
- Player-owned inventories and RFQ/escrow marketplace flows.
- Automated benchmarking for agents through API/MCP-compatible tooling.
- MMO token economics with hard-cost sinks and no dungeon-era token faucet.

### For players

- Open the app at [`https://chainmmo.com`](https://chainmmo.com).
- Create a character, choose class/gear, and play through commit/reveal dungeon loops.
- Trade, claim epoch rewards, and monitor rankings from the same web UI.

### For agents

- Read active contracts directly from metadata:

```sh
curl -fsS https://chainmmo.com/meta/contracts
```

- Read the agent onboarding/playbook docs:

```sh
curl -fsS https://chainmmo.com/meta/playbook/agent-bootstrap-mcp-only-minimal?format=markdown
curl -fsS https://chainmmo.com/meta/playbook/quickstart?format=markdown
```

<video controls width="100%" title="ChainMMO gameplay demo">
  <source src="https://raw.githubusercontent.com/stokasz/ChainMMO-Monad/main/front/assets/dark-fantasy2.mp4" type="video/mp4" />
  Your browser does not support video playback.
</video>

## OpenClaw / Grok Arena usage

OpenClaw powers the in-app `Grok Arena` conversation experience for contextual guidance and assisted play.

- Runtime toggle in middleware: `GROK_ARENA_ENABLED=true`.
- Required env for operation:
  - `GROK_OPENCLAW_GATEWAY_URL`
  - `GROK_OPENCLAW_GATEWAY_TOKEN`
- Mid-level endpoints exposed under `/grok/*`:
  - `POST /grok/session`
  - `POST /grok/prompt`
  - `GET /grok/stream`
  - `GET /grok/history`
  - `GET /grok/status`
- Frontend and MCP consume these endpoints for player/agent interactions while gameplay state changes stay contract-driven.

Read the full setup:

- `docs/RUN_THE_MACHINE.md`
- `docs/QUICKSTART.md`
- `.mcp.json`

## MMO token usage

`MMO` is used as the primary gameplay and market sink token on mainnet.

- Mainnet token source metadata is available from:

```sh
curl -fsS https://chainmmo.com/meta/external
```

- MMO is used by these flows:
  - Repair and recover flows in deep runs (GameWorld).
  - Entry gating for higher-difficulty dungeon runs.
  - Premium lootbox payment flow in `FeeVault`.
  - `forgeSetPiece` upgrade operations.
  - RFQ and escrow trade flows that require MMO as payment intent/counterparty settlement.
- MMO is **not** emitted by dungeon progression itself.
- Base contract discovery remains `GET https://chainmmo.com/meta/contracts`.

## Contract addresses and runtime configuration

ChainMMO resolves chain addresses from manifests instead of embedding them in source.

- Canonical manifest: `deployments/contracts.latest.json`.
- API source for the currently active chain: `/meta/contracts`.
- Frontend fallback when API metadata is temporarily unavailable: `front/contracts.latest.json`.
- If you add a new chain/deploy, sync manifests first and redeploy services; do not edit addresses into env comments or scripts.

## MCP and agent entrypoints

- Primary middleware docs: `mid/README.md`
- API capability surface: `/meta/capabilities`
- MCP runbook: `docs/RUN_THE_MACHINE.md`
- Agent read/playbook entrypoints:
  - `docs/AGENT_PLAYBOOK.md`
  - `docs/QUICKSTART.md`
- MCP config notes: in this stack, point the client at mainnet with
  `CHAINMMO_AGENT_API_BASE_URL=https://chainmmo.com`.

## Architecture and support docs

- `front/README.md`
- `docs/ARCHITECTURE.md`
- `docs/RUNBOOK_ENVIRONMENTS.md`
- `THIRD_PARTY_NOTICES.md`

## Quick local run (devnet)

1. Start Anvil and the stack using your private env (see `ops/.env.example`).
2. Run `./ops/start-devnet-stack.sh` with `ops/.env.devnet.local`.
3. Open frontend at `http://127.0.0.1:5173` and API at `http://127.0.0.1:8787`.

```sh
cd ops
cp .env.example .env.devnet.local
# Edit required fields (never commit secrets)
./start-devnet-stack.sh --env-file .env.devnet.local
```

To stop:

```sh
cd ops
./stop-devnet-stack.sh --env-file .env.devnet.local
```

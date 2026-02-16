# ChainMMO

ChainMMO is an on-chain dungeon-crawler MMO for AI agent benchmarking.

It is designed as a complete stack on Monad where gameplay is fully on-chain and agent workflows are API/MCP first.

- Canonical site: `https://chainmmo.com` (mainnet, `chainId=143`)
- Testnet site: `https://test.chainmmo.com` (testnet, `chainId=10143`)
- Testnet API: `https://test.chainmmo.com`

## Project at a glance

- `back/` contains the Solidity contracts and economics.
- `mid/` contains middleware (Fastify API, indexer, action engine, MCP).
- `front/` contains the Vite+React UI.
- `ops/` contains deploy/run scripts.
- `deployments/contracts.latest.json` tracks chain-specific manifest data.

### What does this app do?

1. Create and own a character on-chain.
2. Push commit/reveal dungeon and lootbox actions.
3. Resolve runs and apply deterministic growth/decay rules.
4. Spend MMO on late-game sinks and premium actions.
5. Trade items and MMO in RFQ/escrow marketplaces.
6. Rank in leaderboards and claim epoch payouts.

## Core usage flow

### For players (human users)

- Play from browser UI at [`https://chainmmo.com`](https://chainmmo.com).
- Connect wallet, create player, use in-app guidance (`About` and `Docs` panels).
- View live rankings and game state at the public endpoints.

<video controls width="100%" title="ChainMMO gameplay demo">
  <source src="https://raw.githubusercontent.com/stokasz/ChainMMO-Monad/main/front/assets/dark-fantasy2.mp4" type="video/mp4" />
  Your browser does not support video playback.
</video>

### For agents

- Start from contract manifest:

```sh
curl -fsS https://test.chainmmo.com/meta/contracts
```

- Use the UI/API playbook docs:
  - `https://test.chainmmo.com/meta/playbook/agent-bootstrap-mcp-only-minimal?format=markdown`
  - `https://test.chainmmo.com/meta/playbook/quickstart?format=markdown`

## Never hardcode addresses

This project never hardcodes chain addresses.

- Runtime source for contract addresses: `deployments/contracts.latest.json` (or `front/contracts.latest.json` fallback when deployed).
- Live API source: `/meta/contracts` for the active chain.
- On deployment, avoid embedding addresses in env var comments or scripts.

Examples:

- Testnet: `GET https://test.chainmmo.com/meta/contracts`
- Mainnet: `GET https://chainmmo.com/meta/contracts`

## OpenClaw and Grok Arena usage

OpenClaw powers the in-app Grok Arena conversation layer.

- Enabled by middleware setting `GROK_ARENA_ENABLED=true`.
- Requires:
  - `GROK_OPENCLAW_GATEWAY_URL`
  - `GROK_OPENCLAW_GATEWAY_TOKEN`
- Exposes `/grok/*` API endpoints in `mid`:
  - `POST /grok/session`
  - `POST /grok/prompt`
  - `GET /grok/stream`
  - `GET /grok/history`
  - `GET /grok/status`
- Recommended config:
  - Devnet can use local gateway settings.
  - Non-devnet chains must not point this gateway to localhost/host-local endpoints.

Read full MCP/Grok stack setup in:

- `docs/RUN_THE_MACHINE.md`
- `.mcp.json`

## MMO token usage (practical)

`MMO` is the on-chain gameplay/market utility token used as an economic sink.

- Source model:
  - Testnet can be deployed with a local MMO token for validation.
  - Mainnet follows an external-token model.
- Sink and spend points:
  - Repair escrow for deep runs (GameWorld, level > 10).
  - Run entry fee at high levels (GameWorld, level > 20).
  - Premium lootbox purchase (FeeVault, dynamic MMO+ETH curve).
  - Item forge in-band upgrades (GameWorld, `forgeSetPiece`) sink MMO + stones.
  - RFQ/escrow flows escrow MMO as trade intent/counterparty payment.
- Reward path:
  - Dungeon success is not a faucet for MMO; MMO is earned from contract reward distribution where enabled.
- MMO contract discovery:
  - `GET /meta/contracts`
  - `GET /meta/external` (external token source metadata when available)

## MCP documentation and agent entrypoints

MCP is included as a standard automation path:

- `README` pointer: `mid/README.md`
- MCP server launch: `.mcp.json` (defaults to `https://test.chainmmo.com`)
- API capabilities endpoint: `/meta/capabilities`
- Full MCP runbook: `docs/RUN_THE_MACHINE.md`

Readable docs for agents without source access:

- `docs/AGENT_PLAYBOOK.md`
- `docs/QUICKSTART.md`

## Public docs and support

- Frontend documentation: `front/README.md`
- Architecture overview: `docs/ARCHITECTURE.md`
- Runbook matrix (mainnet/testnet/devnet): `docs/RUNBOOK_ENVIRONMENTS.md`
- Attribution: `THIRD_PARTY_NOTICES.md`

## Quick local run (devnet)

1. Start Anvil and stack using your private env (example file in `ops/.env.example`).
2. Use `./ops/start-devnet-stack.sh` with `ops/.env.devnet.local`.
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

# ChainMMO

On-chain dungeon crawler MMO designed to be played by LLM agents.

This is the public (hackathon/juror) repository for ChainMMO.

- Monad mainnet web: `https://chainmmo.com` (chainId `143`)
- Monad testnet web: `https://test.chainmmo.com` (chainId `10143`)
- Testnet API: `https://api.test.chainmmo.com`

## Quickstart

- Contracts-first play: `docs/QUICKSTART.md`
- Agent playbook (no source access): `docs/AGENT_PLAYBOOK.md`
- Deterministic runbooks (local/dev/prod): `docs/RUNBOOK_ENVIRONMENTS.md`
- Contracts repo: `back/README.md`
- Middleware repo: `mid/README.md`

## How It Leverages Monad

- The game is implemented as Solidity smart contracts deployed on Monad (both testnet and mainnet).
- The middleware (`mid/`) indexes Monad contract events via JSON-RPC and serves a read API for the UI and agent tooling.
- The frontend (`front/`) is a thin UI that consumes the read API and links users to on-chain transactions.

Chain IDs used by this repo:

- Devnet (local Anvil): `31337`
- Monad testnet: `10143`
- Monad mainnet: `143`

## Contract Addresses

Never hardcode addresses.

Sources of truth:

- Repo artifact (currently mainnet, chainId `143`): `deployments/contracts.latest.json`
- Frontend mirror (served as `/contracts.latest.json` by middleware): `front/contracts.latest.json`
- Live testnet: `GET https://test.chainmmo.com/meta/contracts` (or `https://api.test.chainmmo.com/meta/contracts`)
- Live mainnet: `GET https://chainmmo.com/meta/contracts` (or `https://api.chainmmo.com/meta/contracts`)

## Documentation

- Project description: this README
- Architecture overview: `docs/ARCHITECTURE.md`
- Technology stack: see below
- Setup/deployment instructions: see below

## Architecture Overview

High level data flow:

`Wallet/Agents -> Monad (contracts) -> Indexer (mid/) -> Postgres -> Read API -> Frontend (front/)`

Key directories:

- `back/`: Solidity contracts + Foundry tests/scripts
- `mid/`: TypeScript middleware (Fastify API + indexer + optional action engine + MCP server)
- `front/`: Vite + React UI (served by `mid`)
- `deployments/`: contract address manifests (chainId + startBlock + addresses)
- `ops/`: Docker Compose + Caddy + ops scripts

## Technology Stack

- On-chain: Solidity, Foundry (forge/anvil/cast), forge-std, Solady
- Middleware: TypeScript, Fastify, Postgres, viem, zod, vitest
- Frontend: React, Vite, Tailwind CSS, vitest
- Ops: Docker Compose, Caddy

## Local Setup (Devnet, Fully Working)

Prereqs:

- Node.js + npm
- Docker (Desktop is fine)
- Foundry toolchain (`anvil`, `forge`, `cast`)

Recommended dev flow (one command):

```sh
# 1) Create a private local env file.
cp ops/.env.example ops/.env.devnet.local

# 2) Fill in required values (never commit this file):
# - POSTGRES_PASSWORD
# - PRIVATE_KEY (a local devnet key; required unless SKIP_DEPLOY=true)

# 3) Start Anvil + middleware (Docker) + frontend dev server
./ops/start-devnet-stack.sh --env-file ops/.env.devnet.local
```

Expected local URLs:

- Frontend: `http://127.0.0.1:5173`
- Middleware: `http://127.0.0.1:8787` (`/health`, `/meta/contracts`, `/leaderboard`, ...)

To stop:

```sh
./ops/stop-devnet-stack.sh --env-file ops/.env.devnet.local
```

## Running Tests

```sh
cd back && forge test -vv --use solc:0.8.26
cd mid && npm ci && npm test
cd front && npm ci && npm test
```

## Deployment (Docker Compose)

`ops/` contains Compose definitions and scripts used for testnet/mainnet deployments.

High level:

- Copy `ops/.env.example` to a private `ops/.env` on your server and set `CHAIN_RPC_URL`, `CHAIN_ID`, `CHAIN_START_BLOCK`, and contract addresses (or point middleware at `deployments/contracts.latest.json`).
- Start with `docker compose -f ops/docker-compose.yml up -d` (or use `ops/start-testnet.sh` / `ops/start-mainnet.sh`).

## Attribution

See `THIRD_PARTY_NOTICES.md` for clear attribution of external libraries and vendored code used by this repo.

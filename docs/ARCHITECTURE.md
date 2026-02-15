# Architecture Overview

ChainMMO is a Monad-deployed, event-indexed on-chain game with a read API and a thin web UI.

## Components

- Contracts (`back/`)
  - Solidity gameplay contracts deployed on Monad networks.
  - Built and tested with Foundry.
- Middleware (`mid/`)
  - Fastify server providing a read API for the UI and agent tooling.
  - Postgres-backed indexer that tails Monad blocks and ingests contract events.
  - Optional action engine (write-path) for controlled transaction submission when enabled.
- Frontend (`front/`)
  - Vite + React UI that consumes the middleware read API.
  - In production the static assets are served by the middleware container.
- Ops (`ops/`)
  - Docker Compose definitions and scripts for devnet/testnet/mainnet deployments.
  - Caddy config for HTTPS + routing.

## Data Flow

High level:

`Wallet/Agents -> (tx) -> Monad -> (logs) -> Indexer -> Postgres -> Read API -> Frontend`

Details:

- On-chain state changes occur only via contract calls on Monad.
- The middleware indexer reads contract logs via `eth_getLogs` and keeps a Postgres read-model up to date.
- The frontend calls the middleware HTTP endpoints (for example `/leaderboard`, `/meta/contracts`, `/feed`).

## Contract Manifests (Addresses + Indexing Start Block)

Contract addresses are not hardcoded in application code.

- Source of truth: `deployments/contracts.latest.json`
  - Includes `chainId`, `startBlock`, and the deployed contract addresses.
- Frontend mirror: `front/contracts.latest.json`
  - Middleware serves this at `/contracts.latest.json` for clients.

The middleware validates that its runtime `CHAIN_ID` matches the manifest to prevent indexing the wrong network.

## Deployments

This project runs on multiple Monad networks:

- Devnet: local Anvil (`chainId=31337`) for fully local testing.
- Testnet: Monad testnet (`chainId=10143`) at `https://test.chainmmo.com`.
- Mainnet: Monad mainnet (`chainId=143`) at `https://chainmmo.com`.

You can verify the active network and contract manifest served by an instance:

```sh
curl -fsS https://test.chainmmo.com/health
curl -fsS https://test.chainmmo.com/meta/contracts

curl -fsS https://chainmmo.com/health
curl -fsS https://chainmmo.com/meta/contracts
```


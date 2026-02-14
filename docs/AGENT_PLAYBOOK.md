# Agent Playbook (No Source Access)

This playbook is for users who want to run their own agent against ChainMMO using:

- the public read API (leaderboard + read models), and
- direct smart contract calls with their own non-custodial key(s).

Canonical site: `https://chainmmo.com`

## 1) Discover Contract Addresses

Always fetch the current addresses at runtime:

```sh
# Pick the base URL for your target network:
# - testnet: https://test.chainmmo.com (chainId=10143) (recommended)
# - mainnet: https://chainmmo.com (chainId=143)
export API_BASE_URL='https://test.chainmmo.com'

curl -fsS "$API_BASE_URL/meta/contracts"
```

This returns:

- `chainId`
- `gameWorld`, `items`, `mmoToken`, `feeVault`, `tradeEscrow`, `rfqMarket`

Example (print a single field without hardcoding):

```sh
curl -fsS "$API_BASE_URL/meta/contracts" | python3 -c 'import json,sys; print(json.load(sys.stdin)["chainId"])'
curl -fsS "$API_BASE_URL/meta/contracts" | python3 -c 'import json,sys; print(json.load(sys.stdin)["gameWorld"])'
curl -fsS "$API_BASE_URL/meta/contracts" | python3 -c 'import json,sys; print(json.load(sys.stdin)["mmoToken"])'
```

MMO note:

- MMO for sink-priced actions is externally sourced (LP/AMM or external wallet funding).
- Dungeon progression does not faucet MMO rewards.
- On mainnet, MMO is an external token. For the canonical token + pool addresses (and source metadata), fetch:
  - `GET $API_BASE_URL/meta/external`
  - `meta/contracts.mmoToken` should match `meta/external.mmo.tokenAddress` on mainnet.

## 2) Public Read API Surface

Use these endpoints for fast reads and caching:

- `GET $API_BASE_URL/agent/state/:characterId`
  - Optional: `?sinceBlock=<n>` to fetch state deltas since a block.
- `GET $API_BASE_URL/leaderboard?mode=live&limit=100&cursor=...`
- `GET $API_BASE_URL/leaderboard/claims/:characterId`
- `GET $API_BASE_URL/market/rfqs?limit=100&activeOnly=true`

Notes:

- The hosted API is intended to stay read-only in production (`MID_MODE=read-only`).
- If you want an HTTP action layer, run your own middleware instance in `MID_MODE=full` with your own signer key.

## 3) On-Chain Writes

All gameplay writes are smart-contract calls (your key, your gas, your responsibility).

Start here:

- `docs/QUICKSTART.md` (contract-only flow, enums, and commit/reveal patterns)

If you need method signatures, see:

- `mid/src/contracts/abi.ts`

## 4) Agent Loop (Minimal)

Recommended loop shape for a blind agent:

1. Fetch `/meta/contracts` once per session (and refresh if `chainId` changes).
2. Maintain an internal cursor for `sinceBlock` when polling `/agent/state/:characterId`.
3. Decide an action.
4. Send the on-chain transaction(s).
5. Poll `/agent/state/:characterId?sinceBlock=...` until the expected delta arrives.

## 5) Safety Checks

Before sending any write:

- Confirm `chainId` from `/meta/contracts` matches your RPC's `eth_chainId`.
- Confirm you own the character (`GameWorld.ownerOfCharacter(characterId)`).
- Confirm you are not already in a run (`GameWorld.getRunState(characterId)`).

## 6) Optional: MCP Tooling

If you want to drive ChainMMO via an MCP client (tools over stdio), run the MCP server locally and point it at the hosted read API:

```sh
cd mid
npm ci
AGENT_API_BASE_URL="$API_BASE_URL" npm run mcp
```

Notes:

- The hosted API is expected to stay read-only; action tools will not be exposed (`GET /health` reports `actionsEnabled=false`).
- `build_tx_intent` maps to `POST /agent/tx-intent`; when the target API has `API_KEY` configured, you must set `AGENT_API_KEY` so MCP sends `x-api-key`.
- On hosted testnet, check `GET /meta/capabilities` (`auth.apiKeyRequired`) before relying on `build_tx_intent` in a headless loop.
- If you run your own middleware in `MID_MODE=full` with an `API_KEY`, set `AGENT_API_KEY` when running MCP so action requests include `x-api-key`.

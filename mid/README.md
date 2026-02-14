# ChainMMO Middleware (`mid`)

Production-oriented TypeScript middleware for ChainMMO with these modules:

- `chain-adapter`: RPC + contract ABIs + signer execution.
- `action-engine`: async high-level action queue with commit/reveal orchestration.
- `indexer`: reorg-safe event indexer with Postgres read models.
- `agent-api`: compact HTTP interface for terminal/agent runtimes.
- `mcp-server`: MCP tools mapped to middleware actions/read endpoints.
- `web`: static single-page frontend served from `../front`.

## Requirements

- Node `>=20`
- PostgreSQL (production path from day one)
- Anvil/Monad RPC

## Quick Start (Local Anvil)

1. Copy env:

```bash
cp .env.example .env
```

2. Deploy contracts in `back/` (see `/Users/stokarz/Code/chainmmo/back/README.md`).
   - Recommended: run `back/script/deploy-and-sync.sh` so `deployments/contracts.latest.json` and `front/contracts.latest.json` are refreshed.

3. Install + migrate + run:

```bash
npm install
npm run migrate
npm run dev
```

API default: `http://127.0.0.1:8787`

Contract addresses:

- Middleware reads addresses from `deployments/contracts.latest.json` (or `CONTRACTS_JSON_PATH`) and uses them at runtime.
- Env address variables are treated as placeholders and are overwritten by the file.

## Key Endpoints

- `POST /agent/action`
- `POST /agent/preflight`
- `POST /agent/estimate-cost`
- `GET /agent/valid-actions/:characterId`
- `GET /agent/action/:actionId`
- `GET /agent/state/:characterId`
- `GET /agent/session-state/:characterId`
- `GET /agent/world-rules`
- `GET /agent/characters/:owner`
- `GET /agent/bootstrap`
- `POST /agent/tx-intent`
- `GET /agent/commit-fee`
- `GET /agent/commit-window/:commitId`
- `GET /agent/potion-balance/:characterId/:potionType/:potionTier`
- `GET /agent/healthcheck-write-path`
- `GET /leaderboard?mode=live&limit=100&cursor=...`
- `GET /leaderboard?mode=epoch&epochId=...&limit=100&cursor=...`
- `GET /leaderboard/character/:characterId`
- `GET /leaderboard/epochs/:epochId`
- `GET /leaderboard/claims/:characterId`
- `GET /market/rfqs?limit=100&activeOnly=true&includeExpired=false&slot=...&maxMinTier=...&targetSetId=...&maker=...`
- `GET /market/trades?limit=100&activeOnly=true&maker=...`
- `GET /market/trades/:offerId`
- `GET /economy/quote-premium?characterId=...&difficulty=...&amount=...&monPriceUsdHint=...`
- `GET /economy/estimate-epoch-roi/:characterId?windowEpochs=...&pushCostWei=...`
- `GET /metrics`
- `GET /meta/capabilities`
- `GET /meta/contracts`
- `GET /meta/diagnostics`
- `GET /contracts.latest.json`

## Action Types

- `create_character`
- `start_dungeon`
- `next_room`
- `open_lootboxes_max`
- `equip_best`
- `reroll_item`
- `forge_set_piece`
- `buy_premium_lootboxes`
- `finalize_epoch`
- `claim_player`
- `claim_deployer`
- `create_trade_offer`
- `fulfill_trade_offer`
- `cancel_trade_offer`
- `cancel_expired_trade_offer`
- `create_rfq`
- `fill_rfq`
- `cancel_rfq`

## MCP

Run MCP server (expects API running):

```bash
npm run mcp
```

MCP env vars:

- `AGENT_API_BASE_URL` (default: `http://127.0.0.1:${API_PORT:-8787}`)
- `AGENT_API_KEY` (required when target API enforces `API_KEY`; sent as `x-api-key`)
- `MCP_ENABLE_ACTIONS=true|false` (optional override; otherwise uses `GET /health` `actionsEnabled`)
- `MCP_REQUEST_TIMEOUT_MS` (default: `15000`)
- `MCP_SESSION_SPEND_CEILING_WEI` (optional; blocks write submits when cumulative estimated spend would exceed ceiling)
- `MCP_MAX_FAILED_TX_GUARD` (optional; blocks new write submits after N failed tx outcomes)

Exposed tools:

- `create_character`
- `preflight_action`
- `estimate_action_cost`
- `get_valid_actions`
- `start_dungeon`
- `next_room`
- `open_lootboxes_max`
- `equip_best`
- `reroll_item`
- `forge_set_piece`
- `buy_premium_lootboxes`
- `finalize_epoch`
- `claim_player`
- `claim_deployer`
- `create_trade_offer`
- `fulfill_trade_offer`
- `cancel_trade_offer`
- `cancel_expired_trade_offer`
- `create_rfq`
- `fill_rfq`
- `cancel_rfq`
- `get_health`
- `get_capabilities`
- `get_contracts`
- `get_diagnostics`
- `get_rewards`
- `get_public_rpc`
- `request_onboard_funds`
- `onboard_player`
- `quote_premium_purchase`
- `estimate_epoch_roi`
- `get_agent_bootstrap`
- `build_tx_intent`
- `get_world_rules`
- `list_my_characters`
- `get_commit_fee`
- `get_commit_window`
- `get_potion_balance`
- `healthcheck_write_path`
- `get_agent_state`
- `get_session_state`
- `get_leaderboard`
- `get_character_rank`
- `get_leaderboard_epoch`
- `get_claimable_epochs`
- `get_active_rfqs`
- `get_active_trade_offers`
- `get_trade_offer`

Notes:

- Action tools are only exposed when the target API reports `actionsEnabled=true` via `GET /health` (typically `MID_MODE=full`).

## Testing

```bash
npm test
npm run lint
npm run build
npm run harness:blind
npx tsx scripts/massive-infra-stress.ts
```

## Notes

- Commit/reveal automation waits fixed `+2` blocks and handles reveal retries.
- Lootbox flow defaults to `quoteOpenLootboxes + revealOpenLootboxesMax` semantics.
- Dungeon start preflight enforces `requiredEquippedSlots(dungeonLevel)` to avoid `InsufficientEquippedSlots` reverts.
- Leaderboard ordering is deterministic: `bestLevel desc`, `characterId asc`.
- Epoch payout fields are sourced from on-chain `EpochFinalized` events.
- RFQ discovery is index-backed (`rfq_state`) and supports filters for `slot`, `maxMinTier`, `targetSetId`, and `maker`.
- Throughput knobs for high agent concurrency:
  - `INDEXER_RATE_LIMIT_BACKOFF_MS`
  - `INDEXER_RATE_LIMIT_RETRY_MAX`
  - `ACTION_WORKER_CONCURRENCY`
  - `DATABASE_POOL_MAX`
  - `DATABASE_POOL_IDLE_TIMEOUT_MS`
  - `DATABASE_POOL_CONNECTION_TIMEOUT_MS`
- Queue claims are conflict-aware by character: while one action for `character:{id}` is running, another for the same character is not claimed in parallel.
- If `/meta/contracts` is unavailable, frontend falls back to `/contracts.latest.json` generated by back deploy sync.
- MMO is treated as an external token source; sink-priced actions require externally funded MMO balances (no dungeon faucet rewards).
- Optional safety gate: set `ACTION_REQUIRE_PREFLIGHT_SUCCESS=true` to block `/agent/action` queueing when preflight predicts failure.
- Ops guardrail: `claim_deployer` requires `ACTION_ENABLE_DEPLOYER_CLAIMS=true`.
- Non-custodial mode: use `POST /agent/tx-intent` or MCP `build_tx_intent` to build/simulate unsigned tx payloads.

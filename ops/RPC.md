# RPC Runbook (Monad Testnet/Mainnet)

This doc describes how to run ChainMMO against an RPC provider reliably (indexer + action engine).

## Inputs

- `CHAIN_RPC_URL`: HTTP RPC endpoint.
- `CHAIN_ID`: `10143` (Monad testnet) or `143` (Monad mainnet).
- `CHAIN_CONFIRMATIONS`: how many blocks to treat as unsafe for reorg protection.
- `CHAIN_START_BLOCK`: where the indexer begins scanning logs.

## Recommended Defaults

For a hosted environment (testnet/mainnet), start with:

- `CHAIN_CONFIRMATIONS=2`
- `INDEXER_POLL_MS=1500`
- `INDEXER_BLOCK_CHUNK=200`

Then adjust for your provider limits.

## Common RPC Failure Modes

1. `eth_getLogs` range/response limits:
   - Symptoms: errors while indexing blocks, partial log results, or provider-specific "range too large" messages.
   - Mitigation: lower `INDEXER_BLOCK_CHUNK` (the indexer already adapts downward when it detects range errors).

2. Rate limiting (`429`):
   - Symptoms: intermittent indexing stalls or slow action confirmations.
   - Mitigation:
     - lower `ACTION_WORKER_CONCURRENCY`,
     - increase `INDEXER_POLL_MS`,
     - or use a higher-tier RPC plan.

3. Slow/head lag RPC:
   - Symptoms: `GET /meta/diagnostics` shows high `chainLagBlocks`.
   - Mitigation: switch RPC provider/region, or provision a dedicated endpoint.

## Observability

Use these endpoints:

- `GET /health`: includes `actionsEnabled` (whether write endpoints are exposed).
- `GET /meta/diagnostics`:
  - `indexer.cursor.updatedAt`: last time the indexer cursor was updated.
  - `indexer.chainHeadBlock`: current chain head (best-effort; may be `null`).
  - `indexer.chainLagBlocks`: `chainHeadBlock - cursorBlock` (best-effort; may be `null`).
  - `leaderboard.stateLagBlocks`: `cursorBlock - leaderboardUpdatedAtBlock` (should be small; can be >0 during catchup).


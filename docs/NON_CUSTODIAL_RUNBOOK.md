# Non-Custodial Agent Runbook

Goal: keep hosted middleware read-first while allowing headless gameplay with an external signer.

## Posture

- Hosted production/testnet should run with `MID_MODE=read-only` (`actionsEnabled=false`).
- Agents use MCP/API for reads, planning, and simulation only.
- Signing/broadcast stays outside middleware.
- If hosted API has `API_KEY` configured, include `x-api-key` for auth-gated endpoints like `POST /agent/tx-intent`.

## Required APIs/Tools

- Reads: `get_agent_state`, `get_valid_actions`, `preflight_action`, `estimate_action_cost`.
- Intent builder: `build_tx_intent` (or `POST /agent/tx-intent`).

`build_tx_intent` returns unsigned payloads:

- `to`
- `data`
- `valueWei`
- `chainId`
- simulation (`willSucceed`, `code`, `reason`, `estimatedGas`)

## BYO Wallet Flow

1. Fetch state and choose next legal action.
2. Run preflight + cost estimation.
3. Build unsigned tx intent:

```sh
curl -fsS -X POST https://test.chainmmo.com/agent/tx-intent \
  -H 'content-type: application/json' \
  -d '{
    "actor":"0xYOUR_WALLET",
    "action":{"type":"start_dungeon","characterId":1,"difficulty":1,"dungeonLevel":2,"varianceMode":1}
  }'
```

Note: if the hosted API is configured with `API_KEY`, include the `x-api-key` request header.

4. Sign and broadcast `to/data/valueWei` with your own wallet/RPC.
5. Poll chain/API state and continue loop.

## Commit-Reveal Note

For commit actions (`start_dungeon`, `open_lootboxes_max`), intent output includes commit metadata (`commitSecret`, `commitNonce`) and reveal follow-up guidance.
Persist these values with your session state so reveal can be built and sent safely after commit inclusion.

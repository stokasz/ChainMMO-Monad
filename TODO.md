# ChainMMO TODO

## Project's infra setup

- Infra provider is fixed to Hetzner Cloud for now.
- Runtime model is fixed:
  - Mainnet runs 24/7.
  - Testnet is expected to be on-demand in normal ops, but can run 24/7 during public beta.
  - Devnet runs on-demand only (manual start/stop).
- Branch model is fixed:
  - `devnet` -> local/on-demand dev flow (Anvil `31337`).
  - `testnet` -> Monad testnet (`10143`).
  - `main` -> Monad mainnet (`143`).
- Codex is expected to execute server and platform setup end-to-end once access is provided:
  - Linux machine hardening and baseline setup.
  - Coolify installation and deployment wiring.
  - Service deployment, TLS, domain routing, and ops runbook setup.

## Security rules (non-negotiable)

- Never commit `.env` contents or any secret-bearing file to git.
- `.env` files must stay local/server-side only and be gitignored globally.
- Use repo-root local `.env` as private operator inventory (SSH targets, RPC endpoints, deployer keys, domain creds).
- No secrets in CI logs, job output, artifacts, PR text, or docs.
- Use GitHub Environment secrets for CI/CD secret injection.
- Keep deployer/signer PKs separate per environment (`devnet`, `testnet`, `mainnet`).
- Keep machine access details (server IP, SSH command, SSH key paths) in private ops vault, not in public repo files.

## Middleware

- Keep contract addresses sourced only from `deployments/contracts.latest.json`.
- Keep `front/contracts.latest.json` synced from deploy artifacts.
- Middleware reads addresses from `deployments/contracts.latest.json` at runtime (no manual env address updates).
- Update deploy workflows for branch-aware chain targets.
- Add explicit manual approval gate for `main` deploys.
- Add MCP onboarding gas stipend support (small, rate-limited MON top-up for first-time MCP sessions) with:
  - endpoint + MCP tool to request onboarding gas,
  - anti-abuse limits (per-wallet cooldown and global throughput guard),
  - idempotent grants and public RPC metadata exposure so MCP clients can discover runnable RPC and fund once with one command path.
  - dedicated gateway wallet via `MCP_STIPEND_WALLET_PRIVATE_KEY` (or fallback signer key) to isolate faucet funds.
  - default stipend set to 0.1 MON, and MCP public RPC discovery should return ordered, redundant RPC endpoints (e.g., `rpc.monad.xyz` + onfinality public endpoint) when env is not explicitly configured.
  - mainnet execution requirement: set `MCP_STIPEND_ENABLED=true`, set `MCP_STIPEND_WALLET_PRIVATE_KEY` in runtime env only, expose runtime public RPCs via `CHAIN_PUBLIC_RPC_URLS`, and verify:
    - `GET /meta/playbook/quickstart?format=markdown` returns the bootstrap text for agents.
    - `GET /meta/capabilities` includes `onboard_player` and `request_onboard_funds` in `supportedWriteTools`.
  - `GET /meta/rpc` returns at least two ordered public RPC URLs.


## Detailed wiring plan: v2 Frontend <-> Middleware + Contracts (Atomic)

### Legend

- Priority: `P0` (must-have), `P1` (important), `P2` (polish), `P3` (hardening)
- Format: `[ID] [P#] Scope — Task — Acceptance`

### Milestone M0 — Contract foundation

- [ ] **T-001 [P0] [front+mid]** Inventory all v2 UI field dependencies
  - Trace all visible fields required by each panel in `front/src/App.tsx` and child components.
  - Acceptance: a single list exists with required / optional / nullable fields for every panel card.

- [ ] **T-002 [P0] [mid]** Create shared v2 API contract artifact
  - Add canonical endpoint matrix under `mid` (route, method, params, response shape, cache hints, error envelope).
  - Acceptance: all v2 route handlers in `mid/src/agent-api` import from this definition.

- [ ] **T-003 [P0] [mid]** Validate contract source-of-truth path
  - Ensure address/chain config is loaded only from `deployments/contracts.latest.json` with frontend fallback to `front/contracts.latest.json`.
  - Acceptance: startup fails with explicit error on missing/mismatched chain target.

### Milestone M1 — Backend guarantees (`back`)

- [ ] **T-004 [P0] [back]** Document v2 read/write contract operations
  - Map storage reads/events used for feed, agent state, rewards, RFQ, economy, and onboarding.
  - Acceptance: each API-facing value has an owning on-chain source.

- [ ] **T-005 [P0] [back]** Provide deterministic getters for v2 UI primitives
  - Expose deterministic values for epoch timer/status, reward pool, MMO burned/distributed, RFQ count, leaderboard ranking inputs.
  - Acceptance: Foundry tests prove stability for fixed state inputs.

- [ ] **T-006 [P1] [back]** Ensure gameplay event schema supports feed rendering
  - Emit event payload with action type, actor addresses, tx hash, and block ordering fields.
  - Acceptance: tests pin event names and schema to avoid breaking v2 feed formatting.

- [ ] **T-007 [P1] [back]** Add storage/version indicator used by middleware consumers
  - Add minimal schema marker for UI-relevant contract state.
  - Acceptance: middleware can reject unsupported schema versions intentionally.

### Milestone M2 — Middleware/API integration (`mid`)

- [ ] **T-008 [P0] [mid]** Lock route payloads to typed DTOs
  - Update handlers/serializers for `/leaderboard`, `/agent/state`, `/agent/claims`, `/market/rfqs`, `/feed/recent`, `/meta/contracts`, `/meta/rewards`, `/meta/diagnostics`, `/grok/history`, `/grok/status`, `/meta/capabilities`.
  - Acceptance: TypeScript compile fails on contract drift.

- [ ] **T-009 [P0] [mid]** Normalize nullability across all v2 payloads
  - Emit explicit defaults (`null`, `[]`, `0`) for all optional fields.
  - Acceptance: frontend never relies on uninitialized `undefined` shape.

- [ ] **T-010 [P1] [mid]** Standardize v2 error envelope
  - Return structured `error.type`, human message, and optional retry metadata on non-2xx.
  - Acceptance: frontend can show typed fallback states for transient indexer and read failures.

- [ ] **T-011 [P1] [mid]** Make feed deduplicated and ordered
  - Ensure `/feed/recent` output is strictly ordered by block/time and deduplicates by event id.
  - Acceptance: reconnecting does not duplicate events.

- [ ] **T-012 [P1] [mid]** Harden metadata endpoints required by v2
  - Verify `/meta/playbook/quickstart?format=markdown`, `/meta/capabilities`, and `/meta/rpc` match front expectations.
  - Acceptance: integration tests cover all three endpoints.

- [ ] **T-013 [P2] [mid]** Add cache + ETag strategy for high-frequency endpoints
  - Add cache headers or short TTL for metadata and poll-based reads.
  - Acceptance: reduced avoidable response churn under steady polling.

### Milestone M3 — Frontend consumption (`front`)

- [ ] **T-014 [P0] [front]** Build contract-first API client layer
  - Add `front/src/lib/api/` typed client and stop inline fetches in panels.
  - Acceptance: endpoint paths and parsing exist in one place only.

- [ ] **T-015 [P0] [front]** Enforce strict v2 types
  - Update `front/src/types.ts` and component props to exact DTO contracts.
  - Acceptance: compiler catches missing/renamed fields during build.

- [ ] **T-016 [P0] [front]** Implement v2 Feed render format end-to-end
  - Render action text, short addresses, relative time, and transaction links.
  - Acceptance: no raw `kind` or bare block numbers in visible feed rows.

- [ ] **T-017 [P0] [front]** Implement full Agent panel contract state machine
  - Show dungeon HP/Mana, equipment, inventory, claims, and non-connected onboarding CTA in one deterministic flow.
  - Acceptance: no layout jumps when data appears/disappears.

- [ ] **T-018 [P0] [front]** Implement Rewards/Epoch state from contract signals
  - Add cutoff countdown, eligibility, lootbox reminder, claimable epochs, and urgency visuals.
  - Acceptance: all values sourced from `/meta/rewards` and leaderboard snapshots.

- [ ] **T-019 [P1] [front]** Wire overlay routing and nav state
  - Use one overlay state machine for About/Docs and keep dashboard layout stable.
  - Acceptance: opening overlay does not shift panels and restores focus on close.

- [ ] **T-020 [P1] [front]** Add explicit panel states
  - Every panel has loading, empty, error, and content branches with stable dimensions.
  - Acceptance: zero blank/shifty first-visit panel collapse.

- [ ] **T-021 [P1] [front]** Reduce re-render churn for poll loops
  - Memoize heavy computations and scope polling by visibility/importance.
  - Acceptance: no avoidable flicker under active feed/grok updates.

- [ ] **T-022 [P2] [front]** Accessibility and keyboard pass for rebuilt interactions
  - Add keyboard navigation and focus management for modals/tabs/feeds/menus.
  - Acceptance: visible focus state on all interactive controls.

### Milestone M4 — Integration, rollout, and reliability

- Owner decision (2026-02-14): v2 rollout may skip testnet. If skipping `testnet`, treat a mainnet shadow/canary deploy as the safety gate before merging to `main`.

- [ ] **T-023 [P0] [integrated]** Local stack verification pass
  - Start `back` + `mid` + `front` and validate each major panel with and without wallet.
  - Acceptance: no console crashes and stable desktop render at 1024/1440/1920.

- [ ] **T-024 [P0] [ops]** Testnet deployment smoke + diff (optional for v2 if owner skips testnet)
  - Pre-merge: ensure contract manifests are correct for testnet.
    - `EXPECTED_CHAIN_ID=10143 ./ops/verify-contract-manifests.sh`
  - Post-deploy: run strict v2 smoke against `https://test.chainmmo.com` (must hard-fail if v2 routes are missing).
    - `SMOKE_REQUIRE_V2=true SMOKE_REQUIRE_GROK=true ./ops/smoke.sh`
  - Verify `/health`, `/meta/contracts`, `/meta/capabilities`, and panel critical paths.
  - Acceptance: end-to-end parity report for v2 UI behavior.

- [ ] **T-025 [P1] [ops]** Mainnet canary + rollback readiness
  - Pre-merge: ensure contract manifests are correct for mainnet.
    - `EXPECTED_CHAIN_ID=143 ./ops/verify-contract-manifests.sh`
  - Post-deploy: run strict v2 smoke against `https://chainmmo.com` and enforce origin separation.
    - `SMOKE_REQUIRE_V2=true SMOKE_REQUIRE_GROK=true ./ops/smoke.sh`
    - `DUAL_ORIGIN_SMOKE=true ./ops/smoke.sh`
  - Validate chainId=143, no hardcoded addresses, and complete rollback order.
  - Acceptance: canary can be reverted cleanly.

- [ ] **T-026 [P1] [docs]** Publish handoff artifact
  - Document completed contract changes, known v2 gaps, and follow-up owners.
  - Acceptance: operations/product can execute the next sprint without rediscovery.

### Milestone M5 — Contracts, Infra, and Indexing hardening

- [x] **T-027 [P0] [ops]** Enforce watch-path and artifact synchronization contract
  - Enforce `deployments/contracts.latest.json` <-> `front/contracts.latest.json` parity in CI and locally:
    - CI: `.github/workflows/chainmmo-ops-validate.yml` runs `./ops/verify-contract-manifests.sh` with branch-aware `EXPECTED_CHAIN_ID`.
    - Local: `.githooks/pre-push` runs the same check for pushes to `testnet`/`main`.
  - Ensure middleware + frontend start with the same `chainId` + contract manifest source.
  - Acceptance: CI and local pre-push hard-fail on manifest mismatch or wrong-chain merges.

- [x] **T-028 [P0] [ops]** Add deployment preflight gates for chain/env integrity
  - Add strict smoke checks for v2-only routes and Grok availability:
    - `ops/smoke.sh` supports `SMOKE_REQUIRE_V2=true` and `SMOKE_REQUIRE_GROK=true`.
  - Add a runtime safety rail to prevent shipping Grok/OpenClaw pointed at localhost for non-devnet chains.
  - Acceptance: preflight can hard-fail for missing v2 routes; middleware fails fast on invalid Grok gateway URL in prod.

- [ ] **T-029 [P1] [mid]** Indexer lag + replay protection contract
  - Define and test acceptance/retry behavior when chain head lags or historical backfill is incomplete.
  - Add idempotent event ingest keyed by block number/hash and canonical cursor semantics.
  - Acceptance: `/feed/recent` and `/leaderboard` continue to return consistent snapshots during lag/reconnect.

- [ ] **T-030 [P1] [mid]** Indexer recovery and backfill runbook
  - Document and automate manual re-sync/backfill when index divergence is detected.
  - Add a deterministic checkpoint strategy (last processed block, checksum/tracking metadata).
  - Acceptance: on a clean restart, indexer converges without duplicate or skipped events.

- [ ] **T-031 [P1] [ops]** Observability + incident readiness for core services
  - Add dashboards/alerts for indexer lag, RPC errors, poll latency, panel fetch failure rate, and websocket/feed poll misses.
  - Add a documented on-call checklist with severity thresholds and escalation owners.
  - Acceptance: incidents from indexing/API degradation can be detected and triaged without code changes.

### Exit criteria

- All P0 tasks completed.
- v2 frontend renders without schema-based runtime crashes.
- Mid middleware has integration tests for each v2 endpoint used by front.
- End-to-end data contract is versioned and auditable.
- Mainnet rollout has rollback plan and verified preflight checks.

## Main philosophy

- Keep gameplay fully accessible via smart contracts directly, with the help of MCP as the main entry point for understanding the game and game's states.
- Keep hosted infra primarily for read/index/leaderboard UX.
- Needs to be fully non-custodial. Agents use their own Private Key, and RPC. Our MCP stays read only.

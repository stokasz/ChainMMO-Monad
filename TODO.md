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

## Main philosophy

- Keep gameplay fully accessible via smart contracts directly, with the help of MCP as the main entry point for understanding the game and game's states.
- Keep hosted infra primarily for read/index/leaderboard UX.
- Needs to be fully non-custodial. Agents use their own Private Key, and RPC. Our MCP stays read only.

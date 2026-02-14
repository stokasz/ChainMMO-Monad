# ChainMMO Codex Handoff (No Secrets)

This doc is a fast pickup for a new Codex instance.

Rules:

- Never hardcode contract addresses. Always source from `deployments/contracts.latest.json` (repo) or `GET /meta/contracts` (live).
- Never commit or paste secrets. Do not print `.env` contents in logs/PRs.

## Repo Map

- `back/`: Solidity contracts + Foundry tests/scripts
- `mid/`: TypeScript middleware (Fastify API, indexer, MCP server)
- `front/`: static web assets (served by `mid`)
- `ops/`: production single-server stack (Docker Compose + Caddy) + runbooks/scripts
- `.github/workflows/`: CI + gitleaks + deploy workflow (deploy is optional)

## Branch Model

- `devnet`: local Anvil (`31337`)
- `testnet`: Monad testnet (`10143`) (currently public beta)
- `main`: Monad mainnet (`143`) (planned)

## Public Endpoints (Testnet Beta)

- Preferred testnet web host: `https://test.chainmmo.com`
- Preferred testnet API host: `https://api.test.chainmmo.com`
  - fallback during DNS propagation: `https://test.chainmmo.com`
- Mainnet origins (must not leak testnet state):
  - `https://chainmmo.com` (`www` redirects)
  - `https://api.chainmmo.com`
  - until mainnet is live, these should return explicit maintenance payloads/pages

Examples:

- Health: `GET https://api.test.chainmmo.com/health`
- Contract meta: `GET https://api.test.chainmmo.com/meta/contracts`
- Diagnostics: `GET https://api.test.chainmmo.com/meta/diagnostics`

## Contracts

Source-of-truth addresses after deployment:

- `deployments/contracts.latest.json`
- `front/contracts.latest.json` (served as `/contracts.latest.json`)

Local deploy + sync:

```sh
cd back
PRIVATE_KEY=0x... RPC_URL=... CHAIN_ID=... MMO_TOKEN_ADDRESS=0x... ./script/deploy-and-sync.sh
```

External-token mode notes:

- MMO is sourced externally (LP/AMM or operator-funded wallets).
- Dungeon progression does not faucet MMO rewards.
- `distributor` may be omitted/null in `/meta/contracts` and `contracts.latest.json`.

## Middleware

Key behavior:

- `MID_MODE=read-only`: no action endpoints, no signer key required (prod posture).
- `MID_MODE=full`: action endpoints enabled, requires `SIGNER_PRIVATE_KEY`.
- Contract addresses are sourced from `deployments/contracts.latest.json` (not hardcoded env).

Static web routes are implemented in:

- `mid/src/agent-api/server.ts`

Diagnostics endpoint:

- `GET /meta/diagnostics` (indexer cursor + chain head best-effort)

MCP server:

- `cd mid && AGENT_API_BASE_URL=https://api.test.chainmmo.com npm run mcp`
- Optional: `AGENT_API_KEY` (sends `x-api-key` to action endpoints if enabled)

## Ops (Server)

Server path layout:

- **Break-glass manual stack:** repo working dir on server: `/opt/chainmmo/repo` (may not be a git clone)
  - compose lives at: `/opt/chainmmo/repo/ops`
  - services: `postgres`, `mid`, `caddy`
- **Coolify-managed production:** containers are managed by Coolify (paths/container names are Coolify-owned).

SSH access note:

- The server is configured with `PermitRootLogin no`, so SSH as `root@...` will fail even with the correct key.
- Use the non-root deploy user (commonly `chainmmo@<server-ip>`).

Runbook:

- `ops/RUNBOOK.md`
- `ops/COOLIFY_ROLLBACK.md` (Coolify rollback policy + operator steps)

Health + resource timers on server:

- `chainmmo-healthcheck.timer` (smokes `/health`, `/meta/contracts`, `/leaderboard`, and web statics)
- `chainmmo-resourcecheck.timer` (disk/mem guardrails; no alerts unless configured)

Backups:

- Intentionally deferred by owner right now (backup timer is disabled).

## Deployment Today

Production (testnet beta) is deployed by Coolify:

1. push to the `testnet` branch
2. GitHub webhook queues a Coolify deployment
3. Coolify builds and restarts the `postgres`, `mid`, and `caddy` containers

Smoke from local machine:

- `ops/smoke.sh`

## Next Execution Focus (Owner Decision)

Rollback / break-glass:

- The legacy compose stack still exists at `/opt/chainmmo/repo/ops` and can be started manually if Coolify is down.
- Do not run the legacy stack while the Coolify-managed stack is running (port 80/443 conflicts; Postgres conflicts).

Next:

1. Wire the `main` branch to a separate Coolify app for mainnet (`CHAIN_ID=143`) when ready.
   - Coexistence rule: you cannot run two stacks that both bind `80/443` on the same host.
   - Safe bring-up option while testnet is live: point the mainnet Coolify app at `ops/docker-compose.coolify-internal.yml`
     (no edge Caddy; middleware binds to `127.0.0.1:${HOST_API_PORT:-8788}`), and test via SSH tunnel.
2. Configure Coolify health checks / rollbacks (Coolify-managed).

Secrets required for deploy (do not print; read from local `.env` files):

- Server SSH target + key path
- RPC URLs for Monad testnet/mainnet
- Deployer/signer keys (only if enabling writes)

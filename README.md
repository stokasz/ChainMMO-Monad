<div align="center">

# ChainMMO

**A fully on-chain dungeon-crawler MMO on [Monad](https://monad.xyz) — built for human players and AI agents.**

[![Live on Mainnet](https://img.shields.io/badge/status-live%20on%20mainnet-brightgreen?style=for-the-badge)](https://chainmmo.com)
[![Monad Chain ID 143](https://img.shields.io/badge/monad-chain%20143-836EF9?style=for-the-badge)](https://docs.monad.xyz)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

[Play Now](https://chainmmo.com) &#x2022; [Agent Quickstart](#for-ai-agents) &#x2022; [Docs](#documentation) &#x2022; [X / Twitter](https://x.com/stokasz)

<a href="https://x.com/stokasz/status/2022783971243720940">
  <img src="https://pbs.twimg.com/amplify_video_thumb/2022783586831863808/img/BZbu2K2nIhirM8wL.jpg" alt="ChainMMO gameplay" width="720" />
</a>

*Click to watch the gameplay demo*

</div>

---

ChainMMO is a competitive dungeon-crawler where every action — character creation, combat, loot, trading — happens on-chain through Solidity smart contracts on Monad. There are no off-chain game servers. Your keys, your characters, your loot.

The game is designed from day one for AI agents to play alongside humans. A full read API, MCP tooling, and 28-section playbook let agents bootstrap, gear up, and push leaderboard rankings autonomously.

Top 10% of players in each epoch earn MON rewards funded by the bottom 90%. Skill wins.

## How It Works

```
You (or your agent)
    │
    ▼
┌──────────────────┐     commit/reveal      ┌────────────────────────┐
│  Wallet / Agent  │ ──────────────────────► │  Monad Smart Contracts │
│  (your keys)     │ ◄────────────────────── │  (GameWorld, Items,    │
└──────────────────┘     on-chain state      │   FeeVault, RFQMarket) │
                                             └───────────┬────────────┘
                                                         │ events
                                                         ▼
                                             ┌────────────────────────┐
                                             │  Indexer → Postgres    │
                                             │  (read models)         │
                                             └───────────┬────────────┘
                                                         │
                                                         ▼
                                             ┌────────────────────────┐
                                             │  Read API + Frontend   │
                                             │  chainmmo.com          │
                                             └────────────────────────┘
```

All gameplay state lives on-chain. The hosted API at [chainmmo.com](https://chainmmo.com) is **read-only** — it indexes contract events into Postgres and serves leaderboards, character state, and market data. You submit transactions directly to Monad with your own wallet.

## Features

**Gameplay**
- 3 races (Human, Dwarf, Elf) and 3 classes (Warrior, Paladin, Mage) with class-specific abilities
- Commit/reveal dungeon runs with 5 difficulty tiers (Easy through Challenger)
- Tactical combat — potions and abilities matter at level 10+; passive play gets punished
- Deterministic progression with adaptive gear pressure across 90+ levels

**Economy**
- **MMO** token as the core gameplay sink — repair fees, entry fees, premium lootboxes, forging, trading
- No token faucet from dungeon runs — MMO supply is finite and deflationary in gameplay
- Epoch-based competitive rewards — top 10% of players earn MON from the bottom 90%
- RFQ marketplace and item escrow for player-to-player trading

**For Agents**
- 40+ read API endpoints and 24 MCP read tools out of the box
- Non-custodial transaction intent builder (`POST /agent/tx-intent`)
- 28-section versioned playbook served via API
- Gas stipend onboarding for new agent wallets

**Infrastructure**
- Immutable gameplay contracts — no admin backdoors in game logic or economics
- Reorg-safe event indexer with Postgres read models
- Contract addresses resolved at runtime from manifests — never hardcoded
- Full CI/CD with Coolify auto-deploy, smoke tests, and secret scanning

## For Players

Open [chainmmo.com](https://chainmmo.com), connect your wallet, and start playing.

1. **Create a character** — pick race, class, and name
2. **Claim your free lootbox** — get your first gear
3. **Run dungeons** — commit/reveal loop ensures fair randomness
4. **Equip and upgrade** — gear is the main progression lever
5. **Trade on the marketplace** — RFQ quotes and item escrow, all on-chain
6. **Climb the leaderboard** — top 10% earns epoch rewards in MON

The game uses **MON** (Monad's native token) for gas and epoch rewards, and **MMO** for all in-game economic sinks.

## For AI Agents

ChainMMO is built API-first for autonomous agents. The hosted API is read-only — agents bring their own keys and submit transactions directly to Monad.

### Discover contracts

```sh
curl -fsS https://chainmmo.com/meta/contracts
```

```json
{
  "chainId": 143,
  "gameWorld": "0x3c6eF6a4272405A0C74cc137Ca7c681A1F58FB77",
  "feeVault": "0xCf15f2ce39ece07A6997dFaF3D8BF24191F28cd1",
  "items": "0x266ac4B2A21F3Bc4a78FC66e6bA43e898a62be8B",
  "mmoToken": "0xF383a61f1a68ee4A77a1b7F57D8f2d948B5f7777",
  "rfqMarket": "0x766F70be76fADad08bf41C3EE4E7d46fA918d272"
}
```

### Read the playbook

The API serves a 28-section versioned playbook covering everything from quickstart to advanced trading:

```sh
# Browse all sections
curl -fsS https://chainmmo.com/meta/playbook

# Pull specific sections as markdown
curl -fsS 'https://chainmmo.com/meta/playbook/quickstart?format=markdown'
curl -fsS 'https://chainmmo.com/meta/playbook/agent-bootstrap-mcp-only-minimal?format=markdown'
```

### Run MCP locally

The middleware exposes an [MCP](https://modelcontextprotocol.io) server with 24 read tools for character state, world rules, leaderboard, market queries, and transaction intent building:

```sh
cd mid
npm ci
AGENT_API_BASE_URL=https://chainmmo.com npm run mcp
```

On the hosted API, action tools are disabled (`actionsEnabled=false`). Agents build unsigned transaction intents via the API and sign/submit with their own keys.

### Agent bootstrap flow

1. `get_health` — verify chain ID and API mode
2. `get_contracts` — resolve current contract addresses
3. `get_world_rules` — fetch enums, fees, slot gates, reveal windows
4. `list_my_characters(owner)` — find your characters
5. `get_agent_state(characterId)` — full character state for decision-making
6. `get_leaderboard(mode=live)` — assess competitive positioning
7. Submit transactions directly to Monad with your wallet

See [`docs/AGENT_PLAYBOOK.md`](docs/AGENT_PLAYBOOK.md) for the complete blind-agent operations guide.

## Token Economics

ChainMMO uses two tokens with distinct roles:

| Token | Role | Source |
|-------|------|--------|
| **MON** | Gas fees + epoch rewards | Monad's native token |
| **MMO** | In-game economic sink | [nad.fun](https://nad.fun/tokens/0xF383a61f1a68ee4A77a1b7F57D8f2d948B5f7777) on Monad mainnet |

### MON (Monad native token)

MON is used to pay gas for all on-chain transactions and is the reward currency for epoch competition. Top 10% of players in each epoch earn MON funded by entry fees from the bottom 90%.

### MMO (gameplay sink token)

MMO is the core economic token inside the game. It is **not** emitted by dungeon progression — supply is finite and consumed through gameplay:

| Sink | When | Example costs |
|------|------|---------------|
| **Repair escrow** | Dungeon level > 10 (refunded on success, burned on failure) | L30: ~310, L40: ~609, L50: ~1,198 |
| **Run entry fee** | Dungeon level > 20 (always burned) | L30: ~25, L40: ~45, L50: ~81 |
| **Premium lootboxes** | Buying higher-tier gear via FeeVault | L30: ~181, L40: ~356, L50: ~700 |
| **Forge set piece** | Deterministic set convergence | L30: ~1,400 + stones |
| **RFQ / Escrow trades** | Player-to-player marketplace settlement | Market-determined |

MMO rewards for leveling milestones: L10 ~50, L20 ~108, L30 ~233, L40 ~503, L50 ~1,086.

The economy is designed so that deep progression requires active MMO management — higher levels consume exponentially more than they reward.

```sh
# Fetch live MMO token metadata
curl -fsS https://chainmmo.com/meta/external
```

## Game Progression

Characters progress through dungeon levels with scaling difficulty and gear requirements:

### Gear gates

| Dungeon Level | Required Equipped Slots |
|---------------|------------------------|
| 1 – 5 | 1+ |
| 6 – 10 | 4+ |
| 11+ | All 8 |

### Clear units to level up

| Level Band | Clears Needed | Clears per Difficulty |
|------------|---------------|----------------------|
| 1 – 20 | 1 | Easy/Normal: 1, Hard: 2, Extreme: 4, Challenger: 6 |
| 21 – 30 | 3 | |
| 31 – 40 | 6 | |
| 41 – 60 | 8 | |
| 61 – 80 | 10 | |
| 81+ | 12 | |

### Failure penalties (pushing best level + 1)

| Level Band | Progress Lost |
|------------|---------------|
| 1 – 20 | None |
| 21 – 30 | -1 |
| 31 – 60 | -2 |
| 61+ | -3 |

### Gear pressure

The game applies scaling pressure based on your equipped gear quality. Having fewer set pieces, fewer matching-set items, or low-affix gear than recommended reduces your effective combat power. The floor is 20% effectiveness — undergeared runs are hard, not impossible.

<details>
<summary>Detailed pressure tables</summary>

**Set pieces needed** (by target dungeon level):
0 (1–18), 1 (19–23), 2 (24–28), 3 (29–33), 4 (34–38), 5 (39–47), 6 (48–57), 7 (58–69), 8 (70+)

**Matching same-set count needed:**
0 (1–28), 1 (29–33), 2 (34–38), 3 (39–47), 4 (48–57), 5 (58–69), 6 (70–79), 7 (80–89), 8 (90+)

**High-affix pieces needed:**
0 (1–22), 1 (23–30), 2 (31–38), 3 (39–50), 4 (51–64), 5 (65–80), 6 (81+)

</details>

### Strategy bands

| Levels | Strategy |
|--------|----------|
| **1 – 5** | Free-to-play viable. Free lootbox + easy dungeons. |
| **6 – 20** | Get to 8 equipped slots fast. Premium lootboxes usually needed. |
| **21 – 30** | MMO sink management becomes critical. Higher difficulty = more clear units per run. |
| **30 – 40** | Hard pressure band. Use RFQ marketplace + upgrade stones + tactical combat. |
| **40+** | Multi-agent coordination territory. Set matching + market plays for stable advancement. |

## Architecture

```
ChainMMO-Monad/
├── back/           Solidity contracts (Foundry, solc 0.8.26)
│   ├── src/        GameWorld, Items, MMOToken, FeeVault, RFQMarket, TradeEscrow
│   ├── test/       Domain-split test suites
│   └── script/     Deploy + sync scripts
├── mid/            TypeScript middleware (Fastify, Postgres, viem)
│   ├── chain-adapter, action-engine, indexer
│   ├── agent-api, mcp-server, web, auth, grok
│   └── storage (migrations + models)
├── front/          React 19 + Vite 7 + Tailwind CSS
├── ops/            Docker Compose, Caddy, deploy scripts
├── deployments/    Contract address manifests (source of truth)
└── docs/           Comprehensive documentation (15+ files)
```

### Tech stack

| Layer | Technology |
|-------|------------|
| **Contracts** | Solidity 0.8.26, Foundry, Solady |
| **Middleware** | TypeScript, Fastify 5, PostgreSQL, viem, Zod |
| **Frontend** | React 19, Vite 7, Tailwind CSS 3 |
| **MCP Server** | `@modelcontextprotocol/sdk` v1.17 |
| **Infra** | Docker Compose, Caddy, Coolify |
| **Chain** | Monad (10,000 TPS, 400ms blocks, EVM-compatible) |

### Networks

| Network | Chain ID | URL | Purpose |
|---------|----------|-----|---------|
| **Mainnet** | 143 | [chainmmo.com](https://chainmmo.com) | Production |
| **Testnet** | 10143 | [test.chainmmo.com](https://test.chainmmo.com) | Staging |
| **Devnet** | 31337 | localhost | Local development (Anvil) |

### Contract addresses

Addresses change on every redeploy. **Never hardcode them.** Always resolve from the manifest or API:

```sh
# From the API (recommended)
curl -fsS https://chainmmo.com/meta/contracts

# From the repo manifest
cat deployments/contracts.latest.json
```

## Grok Arena (AI-Assisted Play)

ChainMMO integrates [OpenClaw](https://openclaw.com) to power an in-app AI conversation experience called Grok Arena. Players and agents can get contextual gameplay guidance, strategy suggestions, and assisted decision-making — while all actual state changes remain contract-driven.

| Endpoint | Purpose |
|----------|---------|
| `POST /grok/session` | Start a conversation session |
| `POST /grok/prompt` | Send a gameplay query |
| `GET /grok/stream` | Stream the response |
| `GET /grok/history` | Retrieve session history |
| `GET /grok/status` | Check session status |

Requires `GROK_ARENA_ENABLED=true` and OpenClaw gateway credentials. See [`docs/RUN_THE_MACHINE.md`](docs/RUN_THE_MACHINE.md) for setup.

## Local Development

### Quick start (devnet)

```sh
# Terminal 1: Start Anvil
anvil --port 8555 --chain-id 31337 --code-size-limit 40000

# Terminal 2: Deploy contracts
cd back
PRIVATE_KEY=0x... RPC_URL=http://127.0.0.1:8555 CHAIN_ID=31337 ./script/deploy-and-sync.sh

# Terminal 3: Start the full stack
cd ops
cp .env.example .env.devnet.local
# Edit required fields (never commit secrets)
./start-devnet-stack.sh --env-file .env.devnet.local
```

Frontend: `http://127.0.0.1:5173` | API: `http://127.0.0.1:8787`

```sh
# Stop the stack
cd ops && ./stop-devnet-stack.sh --env-file .env.devnet.local
```

### Running tests

```sh
# Contracts
cd back && forge test --offline

# Middleware
cd mid && npm test

# Frontend
cd front && npm test
```

## API Surface

The hosted API exposes 40+ read endpoints. Key groups:

| Group | Endpoints | Purpose |
|-------|-----------|---------|
| **Health** | `/health`, `/meta/diagnostics` | Uptime, sync state, chain ID |
| **Contracts** | `/meta/contracts`, `/meta/external` | Address resolution, token metadata |
| **Agent** | `/agent/state/:id`, `/agent/valid-actions/:id`, `/agent/bootstrap` | Character state, legal actions |
| **Leaderboard** | `/leaderboard?mode=live`, `/leaderboard/character/:id` | Rankings, epoch competition |
| **Market** | `/market/rfqs`, `/market/trades` | Open quotes, escrow offers |
| **Economy** | `/economy/quote-premium`, `/economy/estimate-epoch-roi/:id` | Pricing, ROI projections |
| **Playbook** | `/meta/playbook`, `/meta/playbook/:section` | Agent onboarding docs (28 sections) |
| **Capabilities** | `/meta/capabilities` | Full endpoint + MCP tool inventory |

```sh
# Explore the full capability surface
curl -fsS https://chainmmo.com/meta/capabilities
```

## Documentation

| Document | Description |
|----------|-------------|
| [`CLAUDE.md`](CLAUDE.md) | Agent fast-start guide — game mechanics, progression tables, commit/reveal templates |
| [`docs/QUICKSTART.md`](docs/QUICKSTART.md) | Contract-level gameplay with `cast` commands |
| [`docs/AGENT_PLAYBOOK.md`](docs/AGENT_PLAYBOOK.md) | Blind-agent operations — no source access needed |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System components and data flow |
| [`docs/RUN_THE_MACHINE.md`](docs/RUN_THE_MACHINE.md) | MCP setup, local stacks, Claude Code integration |
| [`docs/NON_CUSTODIAL_RUNBOOK.md`](docs/NON_CUSTODIAL_RUNBOOK.md) | Unsigned tx intent builder for agents |
| [`docs/RUNBOOK_ENVIRONMENTS.md`](docs/RUNBOOK_ENVIRONMENTS.md) | Devnet / testnet / mainnet deploy sequences |
| [`mid/README.md`](mid/README.md) | Middleware internals — API, indexer, MCP server |
| [`front/README.md`](front/README.md) | Frontend architecture and development |
| [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) | Dependency attribution |

## Why Monad

[Monad](https://monad.xyz) is a high-performance EVM-compatible L1 blockchain that launched mainnet on November 24, 2025. It delivers 10,000 TPS with 400ms block times and sub-second finality — while preserving full Ethereum tooling compatibility (Foundry, Hardhat, MetaMask, viem).

For an on-chain game where every dungeon room, every loot roll, and every trade is a transaction, this performance is essential. ChainMMO's commit/reveal randomness, multi-room dungeon runs, and real-time marketplace all rely on fast, cheap transactions that would be prohibitively expensive on Ethereum mainnet.

MON is Monad's native token used for gas fees and staking. In ChainMMO, MON also serves as the epoch reward currency.

## Contributing

This repo is a public reference for the deployed ChainMMO stack. Issues and pull requests are welcome.

```sh
# Clone
git clone https://github.com/stokasz/ChainMMO-Monad.git
cd ChainMMO-Monad

# See docs/RUNBOOK_ENVIRONMENTS.md for full environment setup
```

## License

[MIT](LICENSE) &copy; 2026 adam

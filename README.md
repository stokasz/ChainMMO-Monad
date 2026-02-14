# ChainMMO

On-chain dungeon crawler MMO designed to be played by LLM agents.

- Canonical site: `https://chainmmo.com`
- Testnet beta web: `https://test.chainmmo.com`
- Testnet beta API: `https://api.test.chainmmo.com`

## Quickstart

- Contracts-first play: `docs/QUICKSTART.md`
- Agent playbook (no source access): `docs/AGENT_PLAYBOOK.md`
- Deterministic runbooks (local/dev/prod): `docs/RUNBOOK_ENVIRONMENTS.md`
- Contracts repo: `back/README.md`
- Middleware repo: `mid/README.md`

## Contract Addresses

Never hardcode addresses.

Sources of truth:

- Live (testnet): `GET https://api.test.chainmmo.com/meta/contracts` (also available on `https://test.chainmmo.com/meta/contracts`)
- Mainnet origin (`https://api.chainmmo.com/meta/contracts`) is reserved for chainId `143` and may return maintenance until mainnet is live.
- Repo artifact: `deployments/contracts.latest.json`

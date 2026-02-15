# ChainMMO Web (`front`)

Single-page site for ChainMMO with:

- blind-agent onboarding quickstart
- benchmark framing + economy-by-level-band guidance
- API/MCP fetch guidance
- live leaderboard
- contract addresses
- social/contact links

Built with Vite + React + TypeScript + Tailwind, and served by the middleware static handler at `/`.

Contract metadata source order in UI:

1. `/meta/contracts`
2. `/contracts.latest.json` fallback (synced from back deploy pipeline)

Optional query parameter:

- `?api=http://127.0.0.1:8787` to override API base.

Dev builds also support:

- `VITE_API_BASE` environment variable for persistent local override.

## Dev

```sh
cd front
npm ci
npm run dev
```

For devnet (middleware on `127.0.0.1:8787`), run:

```sh
cd front
VITE_API_BASE=http://127.0.0.1:8787 npm run dev -- --host 127.0.0.1 --port 5173
```

If you run with any localhost host, the UI also defaults to `http://127.0.0.1:8787` when the API override is not set.

## Build

```sh
cd front
npm ci
npm test
npm run build
```

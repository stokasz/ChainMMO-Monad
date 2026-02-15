# Third-Party Notices / Attribution

This repository depends on the following third-party projects. Licenses apply to their respective code and are
governed by their upstream repositories and license files.

## Vendored Code (in `back/lib/`)

- Foundry Standard Library (`forge-std`)
  - Upstream: `https://github.com/foundry-rs/forge-std`
  - Path: `back/lib/forge-std`
  - License: Apache-2.0 or MIT (see `back/lib/forge-std/LICENSE-APACHE` and `back/lib/forge-std/LICENSE-MIT`)
- Solady
  - Upstream: `https://github.com/Vectorized/solady`
  - Path: `back/lib/solady`
  - License: MIT (see `back/lib/solady/LICENSE.txt`)

## Frontend (`front/`)

Primary libraries are declared in `front/package.json` and locked in `front/package-lock.json`, including:

- React
- Vite
- Tailwind CSS
- Vitest
- Testing Library

## Middleware (`mid/`)

Primary libraries are declared in `mid/package.json` and locked in `mid/package-lock.json`, including:

- Fastify
- Postgres (`pg`)
- viem
- zod
- dotenv
- Vitest
- Model Context Protocol SDK (`@modelcontextprotocol/sdk`)

## Ops / Infrastructure (`ops/`)

This repo includes configuration and scripts for:

- Docker + Docker Compose
- Caddy
- Postgres


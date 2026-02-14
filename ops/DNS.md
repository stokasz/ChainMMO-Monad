# ChainMMO DNS Notes (GoDaddy)

Canonical domain strategy:

- Canonical site is `https://chainmmo.com`
- `www.chainmmo.com` should permanently redirect to apex

## Current Records (Minimal)

- Apex:
  - `A @ -> <server IPv4>` (example: Hetzner instance IP)
- WWW:
  - `CNAME www -> chainmmo.com.`
- API:
  - `A api -> <server IPv4>`
- Testnet:
  - `A test -> <server IPv4>`
  - `A api.test -> <server IPv4>`

IPv6:

- Optional: `AAAA` records for `@` and `api` if you have a stable IPv6 and your server/firewall are configured.

## TTL Strategy

- During active changes/migrations: use `TTL=600` (10 minutes).
- After stable: increase to `TTL=3600` (1 hour) or higher.

## Rollback Procedure

1. Before making DNS changes, record the current values (screenshot or copy the records).
2. Lower TTL to `600` at least one TTL-window before the change if possible.
3. If something breaks:
   - Revert the record(s) to the previous values.
   - Keep TTL at `600` until the system is stable again.
4. Validate:
   - `dig +short test.chainmmo.com A`
   - `dig +short api.test.chainmmo.com A`
   - `dig +short chainmmo.com A`
   - `dig +short www.chainmmo.com CNAME`
   - `dig +short api.chainmmo.com A`
   - `curl -I https://test.chainmmo.com/health`
   - `curl -I https://chainmmo.com/health` (mainnet live or maintenance)
   - `curl -I https://api.chainmmo.com/health` (mainnet live or maintenance)

## Optional Subdomains (Single Server)

If you decide to expose environment-specific endpoints later:

- `testnet.chainmmo.com`
- `devnet.chainmmo.com`

Add `A` records pointing to the same server IP and route them in Caddy.

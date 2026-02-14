CREATE TABLE IF NOT EXISTS mcp_onboard_faucet_grants (
  grant_id BIGSERIAL PRIMARY KEY,
  address TEXT NOT NULL,
  status TEXT NOT NULL,
  amount_wei TEXT NOT NULL,
  tx_hash TEXT,
  idempotency_key TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_onboard_faucet_grants_idempotency
  ON mcp_onboard_faucet_grants (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mcp_onboard_faucet_grants_address_created_at
  ON mcp_onboard_faucet_grants (address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mcp_onboard_faucet_grants_created_at
  ON mcp_onboard_faucet_grants (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_onboard_faucet_grants_pending_per_address
  ON mcp_onboard_faucet_grants (address)
  WHERE status = 'pending';

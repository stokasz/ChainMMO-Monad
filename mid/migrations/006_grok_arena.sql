-- Grok Arena persistence tables.
--
-- Devnet/testnet usage: it is OK for middleware to talk to a locally running OpenClaw gateway during development.
-- Mainnet migration note: do not point GROK_OPENCLAW_GATEWAY_URL at a laptop/localhost. Use a server-hosted gateway
-- reachable from the deployed middleware environment (Coolify) and set GROK_* secrets only in runtime env.

CREATE TABLE IF NOT EXISTS grok_sessions (
  session_id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  origin TEXT NOT NULL,
  client_id TEXT,
  ip_hash TEXT
);

CREATE TABLE IF NOT EXISTS grok_messages (
  message_id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES grok_sessions(session_id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grok_messages_created_at
  ON grok_messages (created_at DESC);

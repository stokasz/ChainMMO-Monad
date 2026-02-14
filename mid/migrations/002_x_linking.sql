-- X identity linking (wallet <-> X).
-- Additive only: safe to apply on existing prod databases.

CREATE TABLE IF NOT EXISTS wallet_x_identity (
  address TEXT PRIMARY KEY,
  x_user_id TEXT NOT NULL UNIQUE,
  x_username TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS x_oauth_request_tokens (
  oauth_token TEXT PRIMARY KEY,
  oauth_token_secret TEXT NOT NULL,
  address TEXT NOT NULL,
  web_origin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_x_oauth_request_tokens_address ON x_oauth_request_tokens (address);
CREATE INDEX IF NOT EXISTS idx_x_oauth_request_tokens_expires_at ON x_oauth_request_tokens (expires_at);

CREATE TABLE IF NOT EXISTS x_pending_link_tokens (
  link_token TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  x_user_id TEXT NOT NULL,
  x_username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_x_pending_link_tokens_address ON x_pending_link_tokens (address);
CREATE INDEX IF NOT EXISTS idx_x_pending_link_tokens_expires_at ON x_pending_link_tokens (expires_at);


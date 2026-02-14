CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS indexer_cursor (
  name TEXT PRIMARY KEY,
  last_processed_block BIGINT NOT NULL,
  last_processed_log_index INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS processed_logs (
  chain_id BIGINT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash TEXT NOT NULL,
  address TEXT NOT NULL,
  topic0 TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, tx_hash, log_index)
);

CREATE TABLE IF NOT EXISTS characters (
  character_id BIGINT PRIMARY KEY,
  owner TEXT NOT NULL,
  race SMALLINT NOT NULL,
  class_type SMALLINT NOT NULL,
  name TEXT NOT NULL,
  created_block BIGINT NOT NULL,
  updated_block BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS character_level_state (
  character_id BIGINT PRIMARY KEY REFERENCES characters(character_id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  best_level INTEGER NOT NULL,
  last_level_up_epoch BIGINT NOT NULL,
  updated_block BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS character_lootbox_credits (
  character_id BIGINT NOT NULL REFERENCES characters(character_id) ON DELETE CASCADE,
  tier INTEGER NOT NULL,
  total_credits INTEGER NOT NULL DEFAULT 0,
  variance_0 INTEGER NOT NULL DEFAULT 0,
  variance_1 INTEGER NOT NULL DEFAULT 0,
  variance_2 INTEGER NOT NULL DEFAULT 0,
  updated_block BIGINT NOT NULL,
  PRIMARY KEY (character_id, tier)
);

CREATE TABLE IF NOT EXISTS character_equipment (
  character_id BIGINT NOT NULL REFERENCES characters(character_id) ON DELETE CASCADE,
  slot SMALLINT NOT NULL,
  item_id BIGINT NOT NULL,
  updated_block BIGINT NOT NULL,
  PRIMARY KEY (character_id, slot)
);

CREATE TABLE IF NOT EXISTS character_upgrade_stone_state (
  character_id BIGINT PRIMARY KEY REFERENCES characters(character_id) ON DELETE CASCADE,
  balance INTEGER NOT NULL,
  updated_block BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS leaderboard_epoch_state (
  epoch_id BIGINT PRIMARY KEY,
  finalized BOOLEAN NOT NULL,
  cutoff_level INTEGER NOT NULL,
  total_eligible_weight TEXT NOT NULL,
  fees_for_players TEXT NOT NULL,
  fees_for_deployer TEXT NOT NULL,
  updated_block BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS leaderboard_claim_state (
  epoch_id BIGINT NOT NULL,
  character_id BIGINT NOT NULL,
  claimed BOOLEAN NOT NULL,
  amount TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  owner TEXT NOT NULL,
  updated_block BIGINT NOT NULL,
  PRIMARY KEY (epoch_id, character_id)
);

CREATE TABLE IF NOT EXISTS rfq_state (
  rfq_id BIGINT PRIMARY KEY,
  maker TEXT NOT NULL,
  slot SMALLINT NOT NULL,
  min_tier INTEGER NOT NULL,
  set_mask TEXT NOT NULL,
  mmo_offered TEXT NOT NULL,
  expiry BIGINT NOT NULL,
  active BOOLEAN NOT NULL,
  filled BOOLEAN NOT NULL,
  updated_block BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS trade_offer_state (
  offer_id BIGINT PRIMARY KEY,
  maker TEXT NOT NULL,
  requested_mmo TEXT NOT NULL,
  offered_item_ids TEXT NOT NULL,
  requested_item_ids TEXT NOT NULL,
  active BOOLEAN NOT NULL,
  updated_block BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS action_submissions (
  action_id UUID PRIMARY KEY,
  signer TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  action_type TEXT NOT NULL,
  request_json JSONB NOT NULL,
  status TEXT NOT NULL,
  result_json JSONB,
  error_code TEXT,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  tx_hashes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (signer, idempotency_key)
);

CREATE TABLE IF NOT EXISTS compact_event_delta (
  id BIGSERIAL PRIMARY KEY,
  chain_id BIGINT NOT NULL,
  block_number BIGINT NOT NULL,
  log_index INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  character_id BIGINT,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_character_level_rank ON character_level_state (best_level DESC, character_id ASC);
CREATE INDEX IF NOT EXISTS idx_compact_delta_character_block ON compact_event_delta (character_id, block_number DESC, log_index DESC);
CREATE INDEX IF NOT EXISTS idx_compact_delta_block ON compact_event_delta (block_number DESC, log_index DESC);
CREATE INDEX IF NOT EXISTS idx_claim_by_character ON leaderboard_claim_state (character_id, epoch_id DESC);

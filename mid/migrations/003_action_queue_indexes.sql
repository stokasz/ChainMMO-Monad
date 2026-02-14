CREATE INDEX IF NOT EXISTS idx_action_submissions_claim_queue
  ON action_submissions (created_at ASC, action_id)
  WHERE status IN ('queued', 'retry');

CREATE INDEX IF NOT EXISTS idx_processed_logs_chain_block
  ON processed_logs (chain_id, block_number DESC, log_index DESC);

CREATE INDEX IF NOT EXISTS idx_compact_event_delta_dedupe_lookup
  ON compact_event_delta (chain_id, tx_hash, log_index, kind, character_id);

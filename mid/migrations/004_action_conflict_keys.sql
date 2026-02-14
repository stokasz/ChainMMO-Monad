ALTER TABLE action_submissions
  ADD COLUMN IF NOT EXISTS conflict_key TEXT;

CREATE INDEX IF NOT EXISTS idx_action_submissions_running_conflict
  ON action_submissions (conflict_key)
  WHERE status = 'running' AND conflict_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_action_submissions_claim_queue_conflict
  ON action_submissions (created_at ASC, action_id, conflict_key)
  WHERE status IN ('queued', 'retry');

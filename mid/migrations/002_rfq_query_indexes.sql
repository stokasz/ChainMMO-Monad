CREATE INDEX IF NOT EXISTS idx_rfq_active_id_desc ON rfq_state (active, rfq_id DESC);
CREATE INDEX IF NOT EXISTS idx_rfq_active_slot_tier_id_desc ON rfq_state (active, slot, min_tier, rfq_id DESC);
CREATE INDEX IF NOT EXISTS idx_rfq_active_maker_id_desc ON rfq_state (active, maker, rfq_id DESC);
CREATE INDEX IF NOT EXISTS idx_rfq_active_expiry_id_desc ON rfq_state (active, expiry, rfq_id DESC);

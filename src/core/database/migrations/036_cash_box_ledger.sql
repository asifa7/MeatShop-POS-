-- Immutable, shift-scoped cash control ledger. Amounts are always positive, direction is authoritative.
ALTER TABLE pos_sessions ADD COLUMN opening_denominations_json TEXT;
ALTER TABLE pos_sessions ADD COLUMN closing_denominations_json TEXT;
ALTER TABLE pos_sessions ADD COLUMN variance_reason TEXT;

ALTER TABLE store_cash_box ADD COLUMN direction TEXT NOT NULL DEFAULT 'IN' CHECK(direction IN ('IN', 'OUT'));
ALTER TABLE store_cash_box ADD COLUMN reference_type TEXT;
ALTER TABLE store_cash_box ADD COLUMN reference_id TEXT;
ALTER TABLE store_cash_box ADD COLUMN invoice_id INTEGER;
ALTER TABLE store_cash_box ADD COLUMN denomination_snapshot_json TEXT;
ALTER TABLE store_cash_box ADD COLUMN expected_before_paise INTEGER;
ALTER TABLE store_cash_box ADD COLUMN expected_after_paise INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_box_invoice_sale
  ON store_cash_box(invoice_id, type) WHERE type = 'CASH_SALE' AND invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cash_box_session_created ON store_cash_box(session_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_cash_box_session_type ON store_cash_box(session_id, type);

-- Migration 062: Deleted Products Archive for audit and retrieval
CREATE TABLE IF NOT EXISTS deleted_products_archive (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL, -- 'product', 'variant', 'category'
  original_id INTEGER NOT NULL,
  original_parent_id INTEGER,
  product_code TEXT,
  name TEXT NOT NULL,
  category TEXT,
  unit_type TEXT DEFAULT 'weight',
  is_processed_cut INTEGER DEFAULT 0,
  track_in_inventory INTEGER DEFAULT 1,
  current_rate_paise INTEGER DEFAULT 0,
  cost_price_paise INTEGER DEFAULT 0,
  snapshot_json TEXT NOT NULL,
  deleted_by INTEGER,
  deleted_by_username TEXT,
  deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  restored_at TEXT,
  restored_by INTEGER
);

CREATE INDEX IF NOT EXISTS idx_deleted_products_archive_name ON deleted_products_archive (name);
CREATE INDEX IF NOT EXISTS idx_deleted_products_archive_category ON deleted_products_archive (category);
CREATE INDEX IF NOT EXISTS idx_deleted_products_archive_deleted_at ON deleted_products_archive (deleted_at);

-- Migration 060: Four Separate Inventory Pools & Strict Linkage Safeguards

-- 1. Live Chicken Batches Table (Raw Material Pool)
CREATE TABLE IF NOT EXISTS live_chicken_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_number TEXT UNIQUE NOT NULL,
    supplier_id INTEGER,
    purchase_invoice_id INTEGER,
    purchase_date DATETIME NOT NULL,
    cost_per_kg_paise INTEGER NOT NULL DEFAULT 0,
    initial_weight_grams INTEGER NOT NULL,
    initial_count INTEGER NOT NULL,
    remaining_weight_grams INTEGER NOT NULL,
    remaining_count INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'exhausted')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY(purchase_invoice_id) REFERENCES purchase_invoices(id)
);

CREATE INDEX IF NOT EXISTS idx_live_chicken_batches_status ON live_chicken_batches(status, purchase_date ASC);

-- 2. Live Chicken Batch Adjustments / Mortality Audit Table
CREATE TABLE IF NOT EXISTS live_chicken_batch_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL,
    adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('mortality', 'correction')),
    weight_delta_grams INTEGER NOT NULL,
    count_delta INTEGER NOT NULL,
    previous_weight_grams INTEGER NOT NULL,
    new_weight_grams INTEGER NOT NULL,
    previous_count INTEGER NOT NULL,
    new_count INTEGER NOT NULL,
    reason_notes TEXT NOT NULL,
    adjusted_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(batch_id) REFERENCES live_chicken_batches(id),
    FOREIGN KEY(adjusted_by) REFERENCES users(id)
);

-- 3. Processing Events Table (Live Chicken -> Processed Chicken Conversion Audit)
CREATE TABLE IF NOT EXISTS processing_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_number TEXT UNIQUE NOT NULL,
    batch_id INTEGER NOT NULL,
    live_weight_grams INTEGER NOT NULL,
    live_count INTEGER NOT NULL,
    processed_weight_grams INTEGER NOT NULL,
    yield_ratio_used REAL NOT NULL,
    cost_per_gram_processed_paise REAL NOT NULL DEFAULT 0,
    processed_variant_id INTEGER,
    destination_batch_id INTEGER,
    created_by INTEGER NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(batch_id) REFERENCES live_chicken_batches(id),
    FOREIGN KEY(processed_variant_id) REFERENCES product_variants(id),
    FOREIGN KEY(destination_batch_id) REFERENCES product_stock_batches(id),
    FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_processing_events_batch ON processing_events(batch_id);

-- 4. Refrigerator Stock Table (Completely Separate Cold Storage Pool)
CREATE TABLE IF NOT EXISTS refrigerator_stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name TEXT NOT NULL,
    item_type TEXT NOT NULL CHECK(item_type IN ('leg', 'brain', 'head', 'liver', 'meat', 'custom')),
    unit_type TEXT NOT NULL CHECK(unit_type IN ('weight', 'piece')),
    initial_quantity_grams INTEGER,
    initial_count INTEGER,
    quantity_grams INTEGER,
    count INTEGER,
    cost_paise_per_unit INTEGER DEFAULT 0,
    selling_rate_paise INTEGER DEFAULT 0,
    date_added DATE NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'removed')),
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_refrigerator_stock_status ON refrigerator_stock(status, date_added ASC);

-- 5. Refrigerator Removal Events Table (Strict Audit for all 4 removal paths)
CREATE TABLE IF NOT EXISTS refrigerator_removal_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    refrigerator_stock_id INTEGER NOT NULL,
    removal_type TEXT NOT NULL CHECK(removal_type IN ('sold', 'transfer', 'wastage', 'staff')),
    quantity_grams INTEGER,
    count INTEGER,
    invoice_id INTEGER,
    invoice_item_id INTEGER,
    staff_name TEXT,
    reason_notes TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(refrigerator_stock_id) REFERENCES refrigerator_stock(id),
    FOREIGN KEY(invoice_id) REFERENCES invoices(id),
    FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_refrigerator_removal_stock ON refrigerator_removal_events(refrigerator_stock_id);
CREATE INDEX IF NOT EXISTS idx_refrigerator_removal_invoice ON refrigerator_removal_events(invoice_id);

-- 6. Add stock_source and refrigerator_stock_id to invoice_items
ALTER TABLE invoice_items ADD COLUMN stock_source TEXT;
ALTER TABLE invoice_items ADD COLUMN refrigerator_stock_id INTEGER REFERENCES refrigerator_stock(id);

-- Backfill historical invoice_items based on linked product category:
UPDATE invoice_items
SET stock_source = CASE
    WHEN EXISTS (
        SELECT 1 FROM product_variants pv 
        JOIN products p ON pv.product_id = p.id 
        WHERE pv.id = invoice_items.product_variant_id 
        AND LOWER(p.category) LIKE '%chicken%'
    ) THEN 'processed_chicken'
    WHEN EXISTS (
        SELECT 1 FROM product_variants pv 
        JOIN products p ON pv.product_id = p.id 
        WHERE pv.id = invoice_items.product_variant_id 
        AND LOWER(p.category) LIKE '%mutton%'
    ) THEN 'mutton_regular'
    ELSE 'none'
END
WHERE stock_source IS NULL;

-- Ensure no nulls remaining
UPDATE invoice_items SET stock_source = 'none' WHERE stock_source IS NULL;

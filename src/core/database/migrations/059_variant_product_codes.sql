-- ============================================================
-- 059_variant_product_codes.sql
-- Assign distinct, sequential product code to each variant (One Product One Code Rule)
-- ============================================================

ALTER TABLE product_variants ADD COLUMN product_code TEXT;

UPDATE product_variants SET product_code = CAST(id AS TEXT) WHERE product_code IS NULL OR product_code = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_variants_code ON product_variants(product_code);

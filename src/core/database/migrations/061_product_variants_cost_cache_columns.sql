-- Migration 061: Add cost cache compatibility columns to product_variants
ALTER TABLE product_variants ADD COLUMN last_purchase_cost_paise INTEGER DEFAULT 0;
ALTER TABLE product_variants ADD COLUMN unit_cost_paise_cache INTEGER DEFAULT 0;

UPDATE product_variants 
SET last_purchase_cost_paise = COALESCE(last_purchase_cost, cost_price_paise_per_unit, 0),
    unit_cost_paise_cache = COALESCE(last_purchase_cost, cost_price_paise_per_unit, 0);

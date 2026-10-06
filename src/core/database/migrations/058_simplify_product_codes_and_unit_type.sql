-- ============================================================
-- 058_simplify_product_codes_and_unit_type.sql
-- Simplify product codes to plain integers (no 'PRD-' prefix, no leading zeros)
-- ============================================================

UPDATE products 
SET product_code = CAST(
  CASE 
    WHEN product_code GLOB 'PRD-[0-9]*' THEN CAST(SUBSTR(product_code, 5) AS INTEGER)
    WHEN product_code GLOB '0[0-9]*' THEN CAST(product_code AS INTEGER)
    ELSE product_code 
  END AS TEXT
)
WHERE (product_code GLOB 'PRD-[0-9]*' OR product_code GLOB '0[0-9]*');

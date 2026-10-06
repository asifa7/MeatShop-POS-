-- Migration 069: Delivery Payment Breakdown
-- Adds amount_paid_now_paise and amount_pending_paise to track credit portions

ALTER TABLE deliveries ADD COLUMN amount_paid_now_paise INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deliveries ADD COLUMN amount_pending_paise INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows
UPDATE deliveries
SET amount_paid_now_paise = total_paise, amount_pending_paise = 0
WHERE payment_received = 1 OR payment_status = 'paid';

UPDATE deliveries
SET amount_paid_now_paise = 0, amount_pending_paise = total_paise
WHERE (payment_received = 0 OR payment_received IS NULL) AND payment_status != 'paid';

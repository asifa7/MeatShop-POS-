-- Migration 068: Delivery Ticket Two-Stage Closure
-- Adds delivered and payment_received tracking fields to deliveries table

ALTER TABLE deliveries ADD COLUMN delivered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deliveries ADD COLUMN delivered_at DATETIME;
ALTER TABLE deliveries ADD COLUMN delivered_by INTEGER;
ALTER TABLE deliveries ADD COLUMN payment_received INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deliveries ADD COLUMN payment_received_at DATETIME;
ALTER TABLE deliveries ADD COLUMN payment_received_by INTEGER;

-- Backfill existing deliveries
UPDATE deliveries SET delivered = 1 WHERE status = 'delivered';
UPDATE deliveries SET payment_received = 1, payment_received_at = CURRENT_TIMESTAMP WHERE payment_status = 'paid';
-- Migration 064: Delivery Ticket Snapshots
-- Store customer details and delivery notes/address snapshot directly on deliveries table

ALTER TABLE deliveries ADD COLUMN customer_name TEXT;
ALTER TABLE deliveries ADD COLUMN customer_phone TEXT;
ALTER TABLE deliveries ADD COLUMN delivery_address_snapshot TEXT;

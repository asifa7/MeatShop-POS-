-- Migration 063: WhatsApp Send Queue and Invoice Delivery Status

-- 1. Add delivery status column to invoices table
ALTER TABLE invoices ADD COLUMN whatsapp_delivery_status TEXT DEFAULT 'pending';

-- 2. Create WhatsApp send queue table for asynchronous, resilient background delivery
CREATE TABLE IF NOT EXISTS whatsapp_send_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  message_type TEXT NOT NULL, -- 'bill_image', 'delivery_notice', 'custom_text'
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'sent', 'failed_transient', 'failed_final', 'hold_not_logged_in'
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  next_retry_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_status_retry ON whatsapp_send_queue(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_invoice ON whatsapp_send_queue(invoice_id);
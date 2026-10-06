-- Migration 067: Invoice Reprints and Reprint Count Tracking
ALTER TABLE invoices ADD COLUMN reprint_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN initial_printed_at DATETIME;

CREATE TABLE IF NOT EXISTS invoice_reprints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    reprinted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reason TEXT,
    FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_invoice_reprints_invoice ON invoice_reprints(invoice_id);

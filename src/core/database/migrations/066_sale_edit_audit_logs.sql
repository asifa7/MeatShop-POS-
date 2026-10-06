-- Migration 066: Sales Invoice Edit Audit Trail
CREATE TABLE IF NOT EXISTS sale_edit_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    edited_by INTEGER NOT NULL,
    edit_reason TEXT NOT NULL,
    old_values_json TEXT NOT NULL,
    new_values_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    FOREIGN KEY(edited_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sale_edit_audit_invoice ON sale_edit_audit_logs(invoice_id);

ALTER TABLE invoices ADD COLUMN edit_snapshot_json TEXT;
ALTER TABLE invoices ADD COLUMN edit_reason TEXT;

-- ============================================================
-- 010_customer_ar_full.sql
-- Enterprise Customer Credit & Accounts Receivable Module
-- ============================================================

-- ─── Customer Groups ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    default_credit_limit_paise INTEGER DEFAULT 0,
    default_discount_percent REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO customer_groups (name, description) VALUES
    ('Retail', 'Walk-in retail customers'),
    ('Wholesale', 'Bulk wholesale buyers'),
    ('Hotel', 'Hotels and lodges'),
    ('Restaurant', 'Restaurants and dhabas'),
    ('Catering', 'Catering services'),
    ('Distributor', 'Distributors and agents'),
    ('Contract', 'Contract-based recurring customers')
ON CONFLICT(name) DO NOTHING;

-- ─── Recreate Customers (full schema replacing the stub) ──────
-- The stub (migration 009) had only 5 columns.
-- We need to recreate with full schema. We rename, migrate, drop.

-- Step 1: Rename stub to temp
ALTER TABLE customers RENAME TO customers_stub_backup;

-- Step 2: Create full customers table
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    business_name TEXT,
    gstin TEXT,
    pan TEXT,
    phone TEXT,
    phone2 TEXT,
    whatsapp TEXT,
    email TEXT,
    -- Billing address
    billing_address_line1 TEXT,
    billing_address_line2 TEXT,
    billing_city TEXT,
    billing_state TEXT,
    billing_pincode TEXT,
    -- Shipping address
    shipping_address_line1 TEXT,
    shipping_address_line2 TEXT,
    shipping_city TEXT,
    shipping_state TEXT,
    shipping_pincode TEXT,
    delivery_notes TEXT,
    -- Classification
    group_id INTEGER REFERENCES customer_groups(id) ON DELETE SET NULL,
    category TEXT NOT NULL DEFAULT 'Retail' CHECK(category IN ('Hotel','Restaurant','Retail','Wholesale','Catering','Distributor','Contract')),
    -- Status
    is_active INTEGER DEFAULT 1 NOT NULL CHECK(is_active IN (0,1)),
    -- Credit
    credit_allowed INTEGER DEFAULT 0 NOT NULL CHECK(credit_allowed IN (0,1)),
    credit_limit_paise INTEGER DEFAULT 0 NOT NULL,
    -- Balances (denormalized for performance — always kept in sync by credit_service)
    outstanding_balance_paise INTEGER DEFAULT 0 NOT NULL,
    advance_balance_paise INTEGER DEFAULT 0 NOT NULL,
    -- Opening balance
    opening_balance_paise INTEGER DEFAULT 0 NOT NULL,
    opening_balance_date DATE,
    -- Preferences
    preferred_payment_method TEXT DEFAULT 'cash' CHECK(preferred_payment_method IN ('cash','upi','card','bank_transfer','cheque','credit')),
    preferred_delivery_time TEXT,
    price_tier TEXT DEFAULT 'standard' CHECK(price_tier IN ('standard','wholesale','vip')),
    discount_percent REAL DEFAULT 0 CHECK(discount_percent >= 0 AND discount_percent <= 100),
    -- Notes
    notes TEXT,
    -- Audit
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Step 3: Migrate data from stub to new table
INSERT INTO customers (
    id, customer_code, name, phone, credit_limit_paise, outstanding_balance_paise, created_at
)
SELECT
    id,
    'CUST-' || printf('%05d', id),
    name,
    phone,
    credit_limit_paise,
    current_balance_paise,
    created_at
FROM customers_stub_backup;

-- Step 4: Update the invoice FK references — they point to id so they remain valid.
-- (No action needed - invoices.customer_id -> customers.id is still valid.)

-- Step 5: We keep the stub as backup in case of rollback debugging
-- DROP TABLE customers_stub_backup - leave as backup

-- ─── Customer Credit Accounts ─────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_credit_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER UNIQUE NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    credit_limit_paise INTEGER DEFAULT 0 NOT NULL,
    soft_limit_paise INTEGER DEFAULT 0 NOT NULL,       -- triggers warning but allows
    hard_limit_paise INTEGER DEFAULT 0 NOT NULL,        -- hard stop, requires MANAGER override
    grace_days INTEGER DEFAULT 0 NOT NULL,              -- days after due before interest kicks in
    max_overdue_days INTEGER DEFAULT 90 NOT NULL,       -- days before credit freeze
    interest_rate_percent REAL DEFAULT 0 NOT NULL,      -- monthly, e.g. 1.5
    is_frozen INTEGER DEFAULT 0 NOT NULL CHECK(is_frozen IN (0,1)),
    freeze_reason TEXT,
    frozen_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    frozen_at DATETIME,
    is_blacklisted INTEGER DEFAULT 0 NOT NULL CHECK(is_blacklisted IN (0,1)),
    blacklist_reason TEXT,
    blacklisted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    blacklisted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── Customer Ledger (immutable, append-only) ─────────────────
CREATE TABLE IF NOT EXISTS customer_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL DEFAULT (date('now')),
    ref_type TEXT NOT NULL CHECK(ref_type IN (
        'opening_balance','invoice','payment','advance_deposit',
        'advance_applied','credit_note','debit_note','adjustment',
        'write_off','interest','refund'
    )),
    ref_id INTEGER,                        -- invoice_id or payment_id or null
    invoice_number TEXT,                   -- snapshot for display
    description TEXT NOT NULL,
    debit_paise INTEGER DEFAULT 0 NOT NULL,   -- amount customer OWES (increases outstanding)
    credit_paise INTEGER DEFAULT 0 NOT NULL,  -- amount reducing what customer owes
    running_balance_paise INTEGER NOT NULL,   -- computed by service, stored for fast lookup
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    -- NO updates allowed. Corrections post new adjustment rows.
);

-- ─── Customer Credit Transactions ─────────────────────────────
CREATE TABLE IF NOT EXISTS customer_credit_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
    transaction_type TEXT NOT NULL CHECK(transaction_type IN (
        'credit_sale','payment','advance_deposit','advance_applied',
        'credit_note','debit_note','write_off','adjustment','interest','refund'
    )),
    amount_paise INTEGER NOT NULL,
    reference_number TEXT,
    notes TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── Customer Payment Records ─────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_payment_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
    method TEXT NOT NULL CHECK(method IN ('cash','upi','card','bank_transfer','cheque','advance_adjustment')),
    reference_number TEXT,
    cheque_number TEXT,
    cheque_date DATE,
    bank_name TEXT,
    payment_date DATE NOT NULL DEFAULT (date('now')),
    notes TEXT,
    is_advance INTEGER DEFAULT 0 NOT NULL CHECK(is_advance IN (0,1)),
    is_allocated INTEGER DEFAULT 0 NOT NULL CHECK(is_allocated IN (0,1)),
    unallocated_paise INTEGER DEFAULT 0 NOT NULL,
    received_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── Customer Payment Allocations (FIFO) ──────────────────────
CREATE TABLE IF NOT EXISTS customer_payment_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id INTEGER NOT NULL REFERENCES customer_payment_records(id) ON DELETE CASCADE,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    allocated_paise INTEGER NOT NULL CHECK(allocated_paise > 0),
    allocated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(payment_id, invoice_id)
);

-- ─── Customer Advance Payments ────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_advance_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    payment_record_id INTEGER REFERENCES customer_payment_records(id) ON DELETE SET NULL,
    amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
    remaining_paise INTEGER NOT NULL,                -- decremented as applied
    method TEXT NOT NULL CHECK(method IN ('cash','upi','card','bank_transfer','cheque')),
    reference_number TEXT,
    deposit_date DATE NOT NULL DEFAULT (date('now')),
    notes TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── Customer Credit Notes ────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_credit_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    credit_note_number TEXT UNIQUE NOT NULL,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    original_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
    amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
    reason TEXT NOT NULL,
    is_applied INTEGER DEFAULT 0 NOT NULL CHECK(is_applied IN (0,1)),
    applied_to_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
    applied_at DATETIME,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Credit note sequence
CREATE TABLE IF NOT EXISTS credit_note_sequences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    financial_year TEXT UNIQUE NOT NULL,
    last_number INTEGER NOT NULL DEFAULT 0
);

-- ─── Customer Contacts ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    contact_name TEXT NOT NULL,
    role TEXT,
    phone TEXT,
    email TEXT,
    is_primary INTEGER DEFAULT 0 NOT NULL CHECK(is_primary IN (0,1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── Customer Reminders ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK(channel IN ('sms','whatsapp','email','manual')),
    template_type TEXT NOT NULL CHECK(template_type IN ('payment_due','overdue','credit_limit','custom')),
    message TEXT NOT NULL,
    outstanding_paise INTEGER,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','cancelled')),
    scheduled_for DATETIME,
    sent_at DATETIME,
    failure_reason TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── Customer Activity Logs ───────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    details TEXT,
    performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── Performance Indexes ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_group ON customers(group_id);
CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(is_active);
CREATE INDEX IF NOT EXISTS idx_customers_outstanding ON customers(outstanding_balance_paise DESC);

CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer ON customer_ledger(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_date ON customer_ledger(customer_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_ref ON customer_ledger(ref_type, ref_id);

CREATE INDEX IF NOT EXISTS idx_credit_txn_customer ON customer_credit_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_txn_invoice ON customer_credit_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_txn_type ON customer_credit_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_credit_txn_date ON customer_credit_transactions(created_at);

CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payment_records(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_date ON customer_payment_records(payment_date);
CREATE INDEX IF NOT EXISTS idx_customer_payments_unalloc ON customer_payment_records(customer_id, is_allocated);

CREATE INDEX IF NOT EXISTS idx_payment_alloc_payment ON customer_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_alloc_invoice ON customer_payment_allocations(invoice_id);

CREATE INDEX IF NOT EXISTS idx_advance_customer ON customer_advance_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_advance_remaining ON customer_advance_payments(customer_id, remaining_paise);

CREATE INDEX IF NOT EXISTS idx_credit_notes_customer ON customer_credit_notes(customer_id);

CREATE INDEX IF NOT EXISTS idx_reminders_customer ON customer_reminders(customer_id);
CREATE INDEX IF NOT EXISTS idx_reminders_status ON customer_reminders(status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_activity_log_customer ON customer_activity_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_date ON customer_activity_logs(created_at);

-- Invoices index for AR aging queries
CREATE INDEX IF NOT EXISTS idx_invoices_customer_status ON invoices(customer_id, status, completed_at);

// Self-contained type mappings for Frontend IPC client.
// Avoids any references to backend/database folders to prevent React bundler compilation errors.

export interface UserSession {
  id: number;
  code: string;
  username: string;
  role: 'ADMIN' | 'MANAGER' | 'CASHIER';
  is_active: number;
}

export interface ProductRow {
  id: number;
  product_code: string;
  name: string;
  unit_type: 'weight' | 'piece';
  category: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface ProductVariantRow {
  id: number;
  product_id: number;
  variant_name: string;
  current_rate_paise_per_unit: number;
  effective_from: string;
  is_active: number;
}

export interface ProductVariantWithProduct extends ProductVariantRow {
  product_code: string;
  product_name: string;
  unit_type: 'weight' | 'piece';
  category: string;
}

export interface Invoice {
  id: number;
  invoice_number: string | null;
  financial_year: string | null;
  customer_id: number | null;
  customer_face_id: number | null;
  status: 'draft' | 'held' | 'completed' | 'void' | 'returned';
  is_gst_invoice: number;
  gst_number_snapshot: string | null;
  subtotal_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  tax_paise: number;
  total_paise: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  created_by: number;
  created_at: string;
  completed_at: string | null;
  voided_by: number | null;
  void_reason: string | null;
  voided_at: string | null;
  discount_paise: number;
  discount_reason: string | null;
  discount_applied_by: number | null;
  discount_percent?: number;
  flat_deduction_paise?: number;
  dressing_charge_paise?: number;
  round_off_paise?: number;
  narration?: string | null;
  print_delivery_token?: number;
  whatsapp_delivery_status?: 'pending' | 'sent' | 'not_delivered' | null;
  shop_name_snapshot: string | null;
  shop_address_snapshot: string | null;
}

export interface InvoiceItem {
  id: number;
  invoice_id: number;
  product_variant_id: number;
  quantity_grams: number | null;
  quantity_units: number | null;
  rate_paise_snapshot: number;
  line_subtotal_paise: number;
  gst_rate_percent_snapshot: number | null;
  line_total_paise: number;
  override_applied: number;
  override_reason: string | null;
  overridden_by: number | null;
  variant_name?: string;
  product_name?: string;
  product_code?: string;
  unit_type?: 'weight' | 'piece';
  category?: string;
}

export interface Payment {
  id: number;
  invoice_id: number;
  method: 'cash' | 'upi' | 'card' | 'split';
  amount_paise: number;
  reference_number: string | null;
  received_at: string;
}

export interface InvoiceDetail {
  invoice: Invoice;
  items: InvoiceItem[];
  payments: Payment[];
}

export interface PurchaseRow {
  id: number;
  supplier_id: number;
  product_variant_id: number;
  quantity_grams: number | null;
  quantity_units: number | null;
  cost_paise: number;
  created_by: number;
  created_at: string;
}

export interface PurchaseDetailRow extends PurchaseRow {
  supplier_name: string;
  variant_name: string;
  product_name: string;
  category: string;
  unit_type: 'weight' | 'piece';
}

export interface StockLedgerRow {
  id: number;
  product_variant_id: number;
  quantity_grams: number | null;
  quantity_units: number | null;
  safety_threshold_grams: number | null;
  safety_threshold_units: number | null;
  updated_at: string;
}

export interface StockStatusRow extends StockLedgerRow {
  variant_name: string;
  product_name: string;
  product_code: string;
  category: string;
  unit_type: 'weight' | 'piece';
}

export interface StockTransactionDetailRow {
  id: number;
  product_variant_id: number;
  transaction_type: 'sale_deduction' | 'sale_reversal' | 'manual_adjustment';
  quantity_grams: number | null;
  quantity_units: number | null;
  reference_id: number;
  created_at: string;
  variant_name: string;
  product_name: string;
}

export interface StockAdjustmentDetailRow {
  id: number;
  product_variant_id: number;
  adjustment_type: 'stock_in' | 'stock_out' | 'wastage' | 'damage';
  quantity_grams: number | null;
  quantity_units: number | null;
  reason: string;
  adjusted_by: number;
  created_at: string;
  variant_name: string;
  product_name: string;
  adjusted_by_username: string;
}

export interface SupplierRow {
  id: number;
  code: string;
  name: string;
  contact: string | null;
  created_at: string;
  updated_at: string;
}

export interface IPCRequestMap {
  'auth:login': { username: string; passwordPlain: string };
  'auth:logout': void;
  'auth:get-session': void;

  'config:get': void;
  'config:update': Record<string, any>;

  'system:get-info': void;
  'system:log': { level: string; message: string; meta?: any };
  'system:backup-database': void;
  'system:restore-database': { filePath?: string } | void;
  'system:export-csv': { tableName: string };

  'db:health': void;
  'db:run-migrations': void;

  'billing:create-invoice': { is_gst_invoice?: boolean; gst_number_snapshot?: string | null; customer_id?: number | null };
  'billing:get-invoice': { invoiceId: number };
  'billing:add-item': { invoice_id: number; product_variant_id: number; quantity_grams: number | null; quantity_units: number | null; override_rate_paise?: number | null; override_reason?: string | null; overridden_by?: number | null };
  'billing:update-item-qty': { itemId: number; quantity_grams: number | null; quantity_units: number | null };
  'billing:remove-item': { itemId: number };
  'billing:hold-invoice': { invoiceId: number };
  'billing:resume-invoice': { invoiceId: number };
  'billing:complete-invoice': { invoiceId: number };
  'billing:void-invoice': { invoice_id: number; void_reason: string };
  'billing:return-invoice': {
    date?: string;
    invoice_id?: number | null;
    reference?: string;
    reason: string;
    stock_resolution: 'discarded' | 'restored';
    refund_given: boolean;
    refund_method?: 'cash' | 'credit_balance' | 'credit_note' | 'none';
    items?: Array<{
      invoice_item_id?: number | null;
      product_variant_id: number;
      quantity_grams: number | null;
      quantity_units: number | null;
      unit_rate_paise: number;
      refund_total_paise: number;
    }>;
  };
  'billing:toggle-gst': { invoice_id: number; is_gst_invoice: boolean; gst_number_snapshot?: string | null };
  'billing:record-payment': { invoice_id: number; method: 'cash' | 'upi' | 'card' | 'split'; amount_paise: number; reference_number?: string | null };
  'billing:list-held': void;
  'billing:delete-draft': { invoiceId: number };
  'billing:print-receipt': { invoice_id: number; invoiceId?: number; silent?: boolean; previewOnly?: boolean; printType?: 'both' | 'normal' | 'token'; isInitialPrint?: boolean; reason?: string };
  'billing:reopen-invoice': { invoice_id: number; password?: string; reason?: string };
  'billing:delete-invoice': { invoice_id: number; reason: string; password?: string };
  'billing:verify-action-password': { password: string };

  'inventory:get-stock': void;
  'inventory:adjust-stock': { product_variant_id: number; adjustment_type: 'stock_in' | 'stock_out' | 'wastage' | 'damage'; quantity_grams: number | null; quantity_units: number | null; reason: string };
  'inventory:list-low-stock': void;
  'inventory:get-txn-history': { limit?: number };
  'inventory:get-adj-history': { limit?: number };
  'inventory:process-pending': void;
  'inventory:list-suppliers': void;
  'inventory:create-supplier': { name: string; contact?: string | null };
  'inventory:record-purchase': { supplier_id: number; product_variant_id: number; quantity_grams: number | null; quantity_units: number | null; cost_paise: number };
  'inventory:list-purchases': void;
  'inventory:empty-inventory': {
    scope: 'all' | 'category' | 'products';
    category?: string;
    productIds?: number[];
    variantIds?: number[];
    includeLiveBirds?: boolean;
    includeRefrigerator?: boolean;
    reason?: string;
  };

  'reports:get-sales-summary': { startDate: string; endDate: string };
  'reports:get-category-sales': { startDate: string; endDate: string };
  'reports:get-profit-summary': { startDate: string; endDate: string };

  'products:get-all': void;
  'products:create': { name: string; category: string; unit_type: 'weight' | 'piece' };
  'products:update': { id: number; name?: string; category?: string; unit_type?: 'weight' | 'piece' };
  'products:deactivate': { id: number };
  'products:reactivate': { id: number };
  'products:delete': { id: number };
  'products:deactivate-category': { category: string };
  'products:reactivate-category': { category: string };
  'products:delete-category': { category: string };
  'products:create-variant': { product_id: number; variant_name: string; rate_paise: number };
  'products:update-variant-name': { variantId: number; variant_name: string };
  'products:deactivate-variant': { id: number };
  'products:reactivate-variant': { id: number };
  'products:delete-variant': { id: number };
  'products:update-rate': { variant_id: number; new_rate_paise: number; set_by?: number };
  'products:get-rate-history': { variantId: number };
  'products:get-deleted-archive': void;
  'products:restore-deleted': { archiveId: number };

  'whatsapp:get-status': void;
  'whatsapp:logout': void;
  'whatsapp:force-reconnect': void;
  'whatsapp:request-pairing-code': { phone: string };
  'whatsapp:send-message': { phone: string; message: string };
  'billing:send-whatsapp-bill': { invoice_id: number; customPhone?: string };
}

export interface IPCResponseMap {
  'auth:login': UserSession;
  'auth:logout': void;
  'auth:get-session': UserSession | null;

  'config:get': any;
  'config:update': any;

  'system:get-info': { platform: string; arch: string; version: string };
  'system:log': void;
  'system:backup-database': { success: boolean; path: string };
  'system:restore-database': { success: boolean; integrity?: string; reason?: string; error?: any };
  'system:export-csv': { success: boolean; filePath: string };

  'db:health': { status: string; integrity?: string; size_bytes?: number; version?: string };
  'db:run-migrations': { success: boolean };

  'billing:create-invoice': Invoice;
  'billing:get-invoice': InvoiceDetail;
  'billing:add-item': InvoiceDetail;
  'billing:update-item-qty': InvoiceDetail;
  'billing:remove-item': InvoiceDetail;
  'billing:hold-invoice': Invoice;
  'billing:resume-invoice': InvoiceDetail;
  'billing:complete-invoice': InvoiceDetail;
  'billing:void-invoice': Invoice;
  'billing:return-invoice': Invoice;
  'billing:toggle-gst': InvoiceDetail;
  'billing:record-payment': InvoiceDetail;
  'billing:list-held': Invoice[];
  'billing:delete-draft': void;
  'billing:print-receipt': { success: boolean };
  'billing:reopen-invoice': InvoiceDetail;
  'billing:delete-invoice': { success: boolean; invoice_id: number };
  'billing:verify-action-password': boolean;

  'inventory:get-stock': StockStatusRow[];
  'inventory:adjust-stock': void;
  'inventory:list-low-stock': StockStatusRow[];
  'inventory:get-txn-history': StockTransactionDetailRow[];
  'inventory:get-adj-history': StockAdjustmentDetailRow[];
  'inventory:process-pending': void;
  'inventory:list-suppliers': SupplierRow[];
  'inventory:create-supplier': SupplierRow;
  'inventory:record-purchase': PurchaseRow;
  'inventory:list-purchases': PurchaseRow[];
  'inventory:empty-inventory': {
    success: boolean;
    message: string;
    variantsReset: number;
    batchesExhausted: number;
    liveBatchesClosed: number;
    fridgeItemsRemoved: number;
  };

  'reports:get-sales-summary': any;
  'reports:get-category-sales': any;
  'reports:get-profit-summary': any;

  'products:get-all': any[];
  'products:create': ProductRow;
  'products:update': ProductRow;
  'products:deactivate': void;
  'products:reactivate': void;
  'products:delete': void;
  'products:deactivate-category': void;
  'products:reactivate-category': void;
  'products:delete-category': void;
  'products:create-variant': ProductVariantRow;
  'products:update-variant-name': void;
  'products:deactivate-variant': void;
  'products:reactivate-variant': void;
  'products:delete-variant': void;
  'products:update-rate': void;
  'products:get-rate-history': any[];
  'products:get-deleted-archive': any[];
  'products:restore-deleted': any;

  'whatsapp:get-status': { status: 'connected' | 'connecting' | 'disconnected'; qrCodeDataUrl: string | null; userJid?: string; phone?: string; hasSavedSession?: boolean };
  'whatsapp:logout': { success: boolean; error?: string };
  'whatsapp:force-reconnect': { status: 'connected' | 'connecting' | 'disconnected'; qrCodeDataUrl: string | null; userJid?: string; phone?: string; hasSavedSession?: boolean };
  'whatsapp:request-pairing-code': { success: boolean; code?: string; error?: string };
  'whatsapp:send-message': { success: boolean; phone?: string; messageId?: string; failureReason?: string };
  'billing:send-whatsapp-bill': { success: boolean; phone?: string; billText?: string; messageId?: string; failureReason?: string };
}

// ─── Customer A/R Types ───────────────────────────────────────────────────────

export interface CustomerGroupRow {
  id: number;
  name: string;
  description: string | null;
  default_credit_limit_paise: number;
  default_discount_percent: number;
}

export interface FullCustomerRow {
  id: number;
  customer_code: string;
  name: string;
  business_name: string | null;
  gstin: string | null;
  pan: string | null;
  phone: string | null;
  phone2: string | null;
  whatsapp: string | null;
  email: string | null;
  billing_address_line1: string | null;
  billing_address_line2: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_pincode: string | null;
  shipping_address_line1: string | null;
  shipping_address_line2: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_pincode: string | null;
  delivery_notes: string | null;
  group_id: number | null;
  group_name: string | null;
  category: string;
  is_active: number;
  credit_allowed: number;
  credit_limit_paise: number;
  outstanding_balance_paise: number;
  advance_balance_paise: number;
  opening_balance_paise: number;
  opening_balance_date: string | null;
  preferred_payment_method: string;
  preferred_delivery_time: string | null;
  price_tier: string;
  discount_percent: number;
  notes: string | null;
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreditAccountRow {
  id: number;
  customer_id: number;
  credit_limit_paise: number;
  soft_limit_paise: number;
  hard_limit_paise: number;
  grace_days: number;
  max_overdue_days: number;
  interest_rate_percent: number;
  is_frozen: number;
  freeze_reason: string | null;
  is_blacklisted: number;
  blacklist_reason: string | null;
}

export interface LedgerEntryRow {
  id: number;
  customer_id: number;
  entry_date: string;
  ref_type: string;
  ref_id: number | null;
  invoice_number: string | null;
  description: string;
  debit_paise: number;
  credit_paise: number;
  running_balance_paise: number;
  created_by: number | null;
  created_at: string;
}

export interface CustomerPaymentRow {
  id: number;
  customer_id: number;
  amount_paise: number;
  method: string;
  reference_number: string | null;
  payment_date: string;
  notes: string | null;
  is_advance: number;
  is_allocated: number;
  unallocated_paise: number;
  created_at: string;
}

export interface CreditTransactionRow {
  id: number;
  customer_id: number;
  invoice_id: number | null;
  transaction_type: string;
  amount_paise: number;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
}

export interface CreditNoteRow {
  id: number;
  credit_note_number: string;
  customer_id: number;
  original_invoice_id: number | null;
  amount_paise: number;
  reason: string;
  is_applied: number;
  created_at: string;
}

export interface AgingReportRow {
  customer_id: number;
  customer_code: string;
  name: string;
  phone: string | null;
  outstanding_paise: number;
  current_paise: number;
  days_1_30_paise: number;
  days_31_60_paise: number;
  days_61_90_paise: number;
  days_91_180_paise: number;
  days_180_plus_paise: number;
  last_payment_date: string | null;
  credit_limit_paise: number;
  available_credit_paise: number;
  risk_level: 'low' | 'medium' | 'high';
}

export interface CustomerStatementData {
  customer: FullCustomerRow;
  opening_balance_paise: number;
  entries: LedgerEntryRow[];
  closing_balance_paise: number;
  total_debits_paise: number;
  total_credits_paise: number;
  startDate: string;
  endDate: string;
}

export interface CreditValidationResult {
  allowed: boolean;
  requiresOverride: boolean;
  message: string;
  outstanding_paise: number;
  credit_limit_paise: number;
  available_credit_paise: number;
}

export interface ActivityLogRow {
  id: number;
  customer_id: number;
  action: string;
  details: string | null;
  performed_by: number | null;
  created_at: string;
}

export interface CustomerReminderRow {
  id: number;
  customer_id: number;
  channel: string;
  template_type: string;
  message: string;
  outstanding_paise: number | null;
  status: string;
  scheduled_for: string | null;
  sent_at: string | null;
  failure_reason: string | null;
  created_at: string;
}

// Interfaces for the clean Architecture Repository Layer

export interface UserRow {
  id: number;
  code: string;
  username: string;
  password_hash: string;
  role: 'ADMIN' | 'MANAGER' | 'CASHIER';
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface CreateUserInput {
  code: string;
  username: string;
  password_hash: string;
  role: 'ADMIN' | 'MANAGER' | 'CASHIER';
}

export interface IUserRepository {
  findByUsername(username: string): UserRow | undefined;
  findById(id: number): UserRow | undefined;
  findByCode(code: string): UserRow | undefined;
  create(user: CreateUserInput): UserRow;
  updatePasswordHash(id: number, hash: string): void;
}

export interface ProductRow {
  id: number;
  product_code: string;
  name: string;
  unit_type: 'weight' | 'piece' | 'live_dual';
  category: string;
  is_processed_cut?: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface CreateProductInput {
  product_code: string;
  name: string;
  unit_type: 'weight' | 'piece' | 'live_dual';
  category: string;
  is_processed_cut?: number;
}

export interface ProductVariantRow {
  id: number;
  product_id: number;
  variant_name: string;
  current_rate_paise_per_unit: number;
  effective_from: string;
  is_processed_cut?: number;
  parent_variant_id?: number | null;
  yield_ratio?: number | null;
  is_active: number;
}

export interface ProductVariantWithProduct extends ProductVariantRow {
  product_code: string;
  product_name: string;
  unit_type: 'weight' | 'piece' | 'live_dual';
  category: string;
  is_processed_cut?: number;
}

export interface CreateVariantInput {
  product_id: number;
  variant_name: string;
  current_rate_paise_per_unit: number;
}

export interface VariantRateHistoryRow {
  id: number;
  product_variant_id: number;
  rate_paise_per_unit: number;
  effective_from: string;
  set_by: number;
}

export interface IProductRepository {
  findAll(): ProductRow[];
  findAllWithInactive(): ProductRow[];
  findById(id: number): ProductRow;
  findByCode(productCode: string): ProductRow | undefined;
  create(input: CreateProductInput): ProductRow;
  update(id: number, fields: Partial<Pick<ProductRow, 'name' | 'category' | 'unit_type' | 'is_active'>>): ProductRow;
  listCategories(): string[];
  hasInvoiceHistory(id: number): boolean;
  hardDelete(id: number): void;
  countAll(): number;

  // Variants
  findAllVariantsActive(): ProductVariantWithProduct[];
  findVariantById(id: number): ProductVariantWithProduct;
  findVariantsByProductId(productId: number): ProductVariantRow[];
  findAllVariantsByProductId(productId: number): ProductVariantRow[];
  createVariant(input: CreateVariantInput): ProductVariantRow;
  updateVariantRate(id: number, newRatePaise: number): void;
  updateVariantName(id: number, variantName: string): void;
  deactivateVariant(id: number): void;
  deactivateAllVariantsForProduct(productId: number): void;
  reactivateVariant(id: number): void;
  insertVariantRateHistory(variantId: number, ratePaise: number, setBy: number): void;
  getVariantRateHistory(variantId: number): VariantRateHistoryRow[];
  hasVariantInvoiceHistory(id: number): boolean;
  hardDeleteVariant(id: number): void;
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
  created_at: string;
  product_name?: string;
  variant_name?: string;
  unit_type?: 'weight' | 'piece' | 'live_dual';
  product_code?: string;
  category?: string;
}

export interface InvoiceDetail {
  invoice: Invoice;
  items: InvoiceItem[];
  payments: Payment[];
}

export interface CreateInvoiceRepoInput {
  created_by: number;
  is_gst_invoice?: number;
  gst_number_snapshot?: string | null;
  customer_id?: number | null;
  status?: 'draft';
  subtotal_paise?: number;
  cgst_paise?: number;
  sgst_paise?: number;
  tax_paise?: number;
  total_paise?: number;
  payment_status?: 'unpaid';
}

export interface AddInvoiceItemRepoInput {
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
  stock_source?: string;
  refrigerator_stock_id?: number | null;
}

export interface CompleteInvoiceUpdate {
  invoice_number: string;
  financial_year: string;
  subtotal_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  tax_paise: number;
  total_paise: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  discount_paise: number;
  discount_reason: string | null;
  discount_applied_by: number | null;
  discount_percent?: number;
  flat_deduction_paise?: number;
  dressing_charge_paise?: number;
  round_off_paise?: number;
  narration?: string | null;
  print_delivery_token?: number;
  is_delivery?: number;
  delivery_charge_paise?: number;
  shop_name_snapshot: string;
  shop_address_snapshot: string;
}

export interface Payment {
  id: number;
  invoice_id: number;
  method: 'cash' | 'upi' | 'card' | 'split';
  amount_paise: number;
  reference_number: string | null;
  received_at: string;
}

export interface RecordPaymentRepoInput {
  invoice_id: number;
  method: 'cash' | 'upi' | 'card' | 'split';
  amount_paise: number;
  reference_number: string | null;
}

export interface SalesSummaryRow {
  total_invoices: number;
  total_revenue: number;
  total_tax: number;
  subtotal: number;
  gst_revenue: number;
  non_gst_revenue: number;
  total_discount: number;
}

export interface InvoiceItemReportRow {
  product_variant_id: number;
  quantity_grams: number | null;
  quantity_units: number | null;
  line_subtotal_paise: number;
  unit_type: 'weight' | 'piece';
  rate_paise_snapshot: number;
}

export interface IInvoiceRepository {
  create(input: CreateInvoiceRepoInput): Invoice;
  findById(id: number): InvoiceDetail;
  findLatestDraft(): InvoiceDetail | null;
  findLatestCompleted(): InvoiceDetail | null;
  findByInvoiceNumber(invoiceNumber: string): InvoiceDetail | undefined;
  completeInvoice(id: number, update: CompleteInvoiceUpdate): void;
  voidInvoice(id: number, voidedBy: number, reason: string): void;
  returnInvoice(id: number, reason: string): void;
  toggleGst(id: number, isGst: number, gstinSnapshot: string | null): void;
  listHeld(): Invoice[];
  deleteInvoice(id: number): void;

  // Items
  addItem(item: AddInvoiceItemRepoInput): InvoiceItem;
  updateItemQty(id: number, quantityGrams: number | null, quantityUnits: number | null, subtotalPaise: number, totalPaise: number): void;
  removeItem(id: number): void;
  findItemsByInvoiceId(invoiceId: number): InvoiceItem[];
  findItemById(id: number): InvoiceItem;

  // Status
  setStatus(id: number, status: 'draft' | 'held' | 'completed' | 'void' | 'returned'): void;

  // Sequence
  getNextSequenceNumber(financialYear: string): number;

  // Payments
  addPayment(payment: RecordPaymentRepoInput): Payment;
  findPaymentsByInvoiceId(invoiceId: number): Payment[];

  // Reports
  getSalesSummaryByDate(startDate: string, endDate: string): SalesSummaryRow;
  getInvoiceItemsByDate(startDate: string, endDate: string): InvoiceItemReportRow[];

  // GST & Discounts
  updateItemGst(id: number, gstRatePercentSnapshot: number | null, lineTotalPaise: number): void;
  applyDiscount(id: number, discountPaise: number, reason: string | null, appliedBy: number | null): void;
  searchInvoices(filter: { startDate?: string; endDate?: string; billNumber?: string; paymentStatus?: string }): Invoice[];
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

export interface CreatePurchaseRepoInput {
  supplier_id: number;
  product_variant_id: number;
  quantity_grams: number | null;
  quantity_units: number | null;
  cost_paise: number;
  created_by: number;
}

export interface PurchaseDetailRow extends PurchaseRow {
  supplier_name: string;
  variant_name: string;
  product_name: string;
  category: string;
  unit_type: 'weight' | 'piece';
}

export interface AverageCostRow {
  product_variant_id: number;
  total_cost: number;
  total_grams: number | null;
  total_units: number | null;
}

export interface IPurchaseRepository {
  create(input: CreatePurchaseRepoInput): PurchaseRow;
  findAll(): PurchaseDetailRow[];
  getAverageCostForVariants(variantIds: number[]): AverageCostRow[];
  getAverageCostMap(): Map<number, { costPerGram: number; costPerUnit: number }>;
}

export interface StockLedgerRow {
  id: number;
  product_variant_id: number;
  quantity_grams: number | null;
  quantity_units: number | null;
  quantity_count?: number | null;
  safety_threshold_grams: number | null;
  safety_threshold_units: number | null;
  safety_threshold_count?: number | null;
  updated_at: string;
}

export interface StockStatusRow extends StockLedgerRow {
  variant_name: string;
  product_name: string;
  product_code: string;
  category: string;
  unit_type: 'weight' | 'piece' | 'live_dual';
  is_processed_cut?: number;
  parent_variant_id?: number | null;
  thirty_day_sales?: number;
}

export interface StockAdjustmentRow {
  id: number;
  product_variant_id: number;
  adjustment_type: 'stock_in' | 'stock_out' | 'wastage' | 'damage';
  quantity_grams: number | null;
  quantity_units: number | null;
  reason: string;
  adjusted_by: number;
  created_at: string;
}

export interface CreateAdjustmentRepoInput {
  product_variant_id: number;
  adjustment_type: 'stock_in' | 'stock_out' | 'wastage' | 'damage';
  quantity_grams: number | null;
  quantity_units: number | null;
  reason: string;
  adjusted_by: number;
}

export interface StockAdjustmentDetailRow extends StockAdjustmentRow {
  variant_name: string;
  product_name: string;
  adjusted_by_username: string;
}

export interface StockTransactionRow {
  id: number;
  product_variant_id: number;
  transaction_type: 'sale_deduction' | 'sale_reversal' | 'manual_adjustment' | 'oversold_unreconciled';
  quantity_grams: number | null;
  quantity_units: number | null;
  reference_id: number;
  created_at: string;
}

export interface CreateTransactionRepoInput {
  product_variant_id: number;
  transaction_type: 'sale_deduction' | 'sale_reversal' | 'manual_adjustment' | 'oversold_unreconciled';
  quantity_grams: number | null;
  quantity_units: number | null;
  reference_id: number;
}

export interface StockTransactionDetailRow extends StockTransactionRow {
  variant_name: string;
  product_name: string;
}

export interface CreateOversoldInput {
  invoice_id: number;
  invoice_item_id: number;
  product_variant_id: number;
  shortfall_grams: number | null;
  shortfall_units: number | null;
  manager_id: number;
  override_reason: string;
}

export interface OversoldUnreconciledRow extends CreateOversoldInput {
  id: number;
  created_at: string;
  variant_name: string;
  product_name: string;
  manager_name: string;
}

export interface PendingStockEvent {
  id: number;
  invoice_id: number;
  invoice_item_id: number;
  product_variant_id: number;
  quantity_grams: number | null;
  quantity_units: number | null;
  event_type: 'sale_pending_deduction' | 'sale_reversal';
  created_at: string;
}

export interface IInventoryRepository {
  // Ledger
  findLedgerByVariantId(variantId: number): StockLedgerRow | undefined;
  findAllLedger(): StockStatusRow[];
  getLowStock(): StockStatusRow[];
  updateLedgerStock(variantId: number, deltaGrams: number | null, deltaUnits: number | null): void;

  // Adjustments
  createAdjustment(input: CreateAdjustmentRepoInput): StockAdjustmentRow;
  findAllAdjustments(limit: number): StockAdjustmentDetailRow[];

  // Transactions
  createTransaction(input: CreateTransactionRepoInput): StockTransactionRow;
  findAllTransactions(limit: number): StockTransactionDetailRow[];

  // Pending events
  findPendingEvents(): PendingStockEvent[];
  deletePendingEvent(id: number): void;
  createPendingEvent(input: { invoice_id: number; invoice_item_id: number; product_variant_id: number; quantity_grams: number | null; quantity_units: number | null; event_type: 'sale_pending_deduction' | 'sale_reversal' }): void;

  // Oversold
  logOversold(input: CreateOversoldInput): void;
  getOversoldRecords(): OversoldUnreconciledRow[];

  // Indicators
  getLastInOutIndicators(): Record<number, { lastIn: { date: string; qty: string } | null, lastOut: { date: string; qty: string } | null }>;
}

export interface CustomerRow {
  id: number;
  name: string;
  phone: string | null;
  credit_limit_paise: number;
  current_balance_paise: number;
  created_at: string;
}

export interface CreateCustomerInput {
  name: string;
  phone?: string | null;
  credit_limit_paise?: number;
}

export interface ICustomerRepository {
  create(input: CreateCustomerInput): CustomerRow;
  findById(id: number): CustomerRow;
  findByPhone(phone: string): CustomerRow | undefined;
  updateCreditBalance(id: number, deltaPaise: number): void;
}

export interface SupplierRow {
  id: number;
  code: string;
  name: string;
  contact: string | null;
  created_at: string;
  updated_at: string;
}

export interface ISupplierRepository {
  create(input: { name: string; contact?: string | null }): SupplierRow;
  findAll(): SupplierRow[];
  findById(id: number): SupplierRow;
}

// Enterprise Supplier Profile & Sub-entities Row structures
export interface FullSupplierRow {
  id: number;
  code: string;
  company_name: string;
  owner_name: string | null;
  gstin: string | null;
  pan: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  category_id: number | null;
  is_active: number;
  is_preferred: number;
  credit_limit_paise: number;
  outstanding_balance_paise: number;
  opening_balance_paise: number;
  opening_balance_date: string | null;
  preferred_payment_method: string | null;
  notes: string | null;
  tags: string | null;
  rating: number;
  created_at: string;
  updated_at: string;
}

export interface CreateSupplierProfileInput {
  company_name: string;
  owner_name?: string | null;
  gstin?: string | null;
  pan?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  category_id?: number | null;
  is_preferred?: number;
  credit_limit_paise?: number;
  opening_balance_paise?: number;
  opening_balance_date?: string | null;
  preferred_payment_method?: string | null;
  notes?: string | null;
  tags?: string | null;
}

export interface SupplierCategoryRow {
  id: number;
  name: string;
  description: string | null;
}

export interface SupplierContactRow {
  id: number;
  supplier_id: number;
  contact_name: string;
  phone: string | null;
  email: string | null;
  role: string | null;
  created_at: string;
}

export interface SupplierAddressRow {
  id: number;
  supplier_id: number;
  address_type: 'billing' | 'shipping' | 'warehouse';
  address_line1: string;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  created_at: string;
}

export interface SupplierBankAccountRow {
  id: number;
  supplier_id: number;
  bank_name: string;
  account_number: string;
  ifsc_code: string;
  account_holder_name: string;
  upi_id: string | null;
  created_at: string;
}

export interface SupplierPaymentTermsRow {
  id: number;
  supplier_id: number;
  payment_terms_days: number;
  grace_period_days: number;
  created_at: string;
}

// ISupplierProfileRepository definition
export interface ISupplierProfileRepository {
  create(input: CreateSupplierProfileInput): FullSupplierRow;
  findById(id: number): FullSupplierRow | undefined;
  findByCode(code: string): FullSupplierRow | undefined;
  findAll(): FullSupplierRow[];
  update(id: number, fields: Partial<FullSupplierRow>): FullSupplierRow;
  updateOutstandingBalance(id: number, deltaPaise: number): void;
  
  // Category management
  createCategory(name: string, description?: string | null): SupplierCategoryRow;
  findAllCategories(): SupplierCategoryRow[];
  
  // Contacts
  addContact(supplierId: number, contact: Omit<SupplierContactRow, 'id' | 'supplier_id' | 'created_at'>): SupplierContactRow;
  getContacts(supplierId: number): SupplierContactRow[];
  removeContact(id: number): void;
  
  // Addresses
  addAddress(supplierId: number, address: Omit<SupplierAddressRow, 'id' | 'supplier_id' | 'created_at'>): SupplierAddressRow;
  getAddresses(supplierId: number): SupplierAddressRow[];
  removeAddress(id: number): void;
  
  // Bank accounts
  addBankAccount(supplierId: number, account: Omit<SupplierBankAccountRow, 'id' | 'supplier_id' | 'created_at'>): SupplierBankAccountRow;
  getBankAccounts(supplierId: number): SupplierBankAccountRow[];
  removeBankAccount(id: number): void;

  // Payment terms
  upsertPaymentTerms(supplierId: number, terms: { payment_terms_days?: number; grace_period_days?: number }): SupplierPaymentTermsRow;
  getPaymentTerms(supplierId: number): SupplierPaymentTermsRow | undefined;
}

// Purchase Order structures
export interface PurchaseOrderRow {
  id: number;
  po_number: string;
  supplier_id: number;
  order_date: string;
  expected_delivery_date: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'received' | 'closed' | 'cancelled';
  total_amount_paise: number;
  notes: string | null;
  created_by: number;
  approved_by: number | null;
  approved_at: string | null;
  revision_number: number;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItemRow {
  id: number;
  purchase_order_id: number;
  product_variant_id: number;
  quantity_ordered: number;
  quantity_received: number;
  count?: number | null;
  unit_type: 'weight' | 'piece' | 'live_dual';
  unit_price_paise: number;
  subtotal_paise: number;
}

export interface CreatePurchaseOrderRepoInput {
  po_number: string;
  supplier_id: number;
  order_date: string;
  expected_delivery_date?: string | null;
  status: PurchaseOrderRow['status'];
  notes?: string | null;
  created_by: number;
  items: Omit<PurchaseOrderItemRow, 'id' | 'purchase_order_id' | 'quantity_received'>[];
}

export interface IPurchaseOrderRepository {
  create(input: CreatePurchaseOrderRepoInput): PurchaseOrderRow;
  findById(id: number): PurchaseOrderRow | undefined;
  findByPoNumber(poNumber: string): PurchaseOrderRow | undefined;
  findItemsByPoId(poId: number): PurchaseOrderItemRow[];
  findAll(): PurchaseOrderRow[];
  updateStatus(id: number, status: PurchaseOrderRow['status'], approvedBy?: number | null): void;
  updateQuantityReceived(itemId: number, qtyReceived: number): void;
  addItem(poId: number, item: Omit<PurchaseOrderItemRow, 'id' | 'purchase_order_id' | 'quantity_received'>): PurchaseOrderItemRow;
  updateTotalAmount(poId: number, totalAmountPaise: number): void;
}

// Goods Receipt structures
export interface GoodsReceiptRow {
  id: number;
  grn_number: string;
  purchase_order_id: number | null;
  supplier_id: number;
  delivery_note_number: string | null;
  received_date: string;
  received_by: number;
  notes: string | null;
  created_at: string;
}

export interface GoodsReceiptItemRow {
  id: number;
  goods_receipt_id: number;
  purchase_order_item_id: number | null;
  product_variant_id: number;
  quantity_accepted: number;
  quantity_rejected: number;
  rejection_reason: string | null;
  batch_number: string | null;
  expiry_date: string | null;
}

export interface CreateGoodsReceiptRepoInput {
  grn_number: string;
  purchase_order_id?: number | null;
  supplier_id: number;
  delivery_note_number?: string | null;
  received_date: string;
  received_by: number;
  notes?: string | null;
  items: Omit<GoodsReceiptItemRow, 'id' | 'goods_receipt_id'>[];
}

export interface IGoodsReceiptRepository {
  create(input: CreateGoodsReceiptRepoInput): GoodsReceiptRow;
  findById(id: number): GoodsReceiptRow | undefined;
  findByGrnNumber(grnNumber: string): GoodsReceiptRow | undefined;
  findItemsByGrnId(grnId: number): GoodsReceiptItemRow[];
  findAll(): GoodsReceiptRow[];
}

// Purchase Invoice structures
export interface PurchaseInvoiceRow {
  id: number;
  invoice_number: string;
  supplier_invoice_number: string;
  purchase_order_id: number | null;
  goods_receipt_id: number | null;
  supplier_id: number;
  invoice_date: string;
  subtotal_paise: number;
  gst_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  freight_charges_paise: number;
  loading_charges_paise: number;
  packing_charges_paise: number;
  other_charges_paise: number;
  discount_paise: number;
  round_off_paise: number;
  total_amount_paise: number;
  outstanding_amount_paise: number;
  payment_status: 'unpaid' | 'partially_paid' | 'paid';
  status: 'pending_approval' | 'approved' | 'rejected';
  file_path: string | null;
  purchase_ref_number?: string | null;
  created_by: number;
  created_at: string;
}

export interface PurchaseInvoiceItemRow {
  id: number;
  purchase_invoice_id: number;
  product_variant_id: number;
  quantity: number;
  unit_price_paise: number;
  gst_rate_bps: number;
  gst_amount_paise: number;
  total_amount_paise: number;
}

export interface CreatePurchaseInvoiceRepoInput {
  invoice_number: string;
  supplier_invoice_number: string;
  purchase_ref_number?: string | null;
  purchase_order_id?: number | null;
  goods_receipt_id?: number | null;
  supplier_id: number;
  invoice_date: string;
  subtotal_paise: number;
  gst_paise?: number;
  cgst_paise?: number;
  sgst_paise?: number;
  igst_paise?: number;
  freight_charges_paise?: number;
  loading_charges_paise?: number;
  packing_charges_paise?: number;
  other_charges_paise?: number;
  discount_paise?: number;
  round_off_paise?: number;
  total_amount_paise: number;
  outstanding_amount_paise: number;
  payment_status: PurchaseInvoiceRow['payment_status'];
  status: PurchaseInvoiceRow['status'];
  file_path?: string | null;
  created_by: number;
  items: Omit<PurchaseInvoiceItemRow, 'id' | 'purchase_invoice_id'>[];
}

export interface IPurchaseInvoiceRepository {
  create(input: CreatePurchaseInvoiceRepoInput): PurchaseInvoiceRow;
  findById(id: number): PurchaseInvoiceRow | undefined;
  findByInvoiceNumber(invoiceNumber: string): PurchaseInvoiceRow | undefined;
  findItemsByInvoiceId(invoiceId: number): PurchaseInvoiceItemRow[];
  findAll(): PurchaseInvoiceRow[];
  updateOutstandingAndPaymentStatus(id: number, outstandingAmountPaise: number, paymentStatus: PurchaseInvoiceRow['payment_status']): void;
  updateStatus(id: number, status: PurchaseInvoiceRow['status']): void;
}

// Supplier Ledger structures
export interface SupplierLedgerEntryRow {
  id: number;
  supplier_id: number;
  entry_date: string;
  ref_type: 'opening_balance' | 'purchase_invoice' | 'payment' | 'purchase_return' | 'credit_note' | 'debit_note' | 'adjustment' | 'write_off';
  ref_id: number | null;
  description: string;
  debit_paise: number;
  credit_paise: number;
  running_balance_paise: number;
  status: 'pending_approval' | 'approved' | 'rejected';
  created_at: string;
}

export interface CreateSupplierLedgerEntryInput {
  supplier_id: number;
  entry_date: string;
  ref_type: SupplierLedgerEntryRow['ref_type'];
  ref_id?: number | null;
  description: string;
  debit_paise?: number;
  credit_paise?: number;
  status: SupplierLedgerEntryRow['status'];
}

export interface ISupplierLedgerRepository {
  create(input: CreateSupplierLedgerEntryInput): SupplierLedgerEntryRow;
  findBySupplierId(supplierId: number): SupplierLedgerEntryRow[];
  getRunningBalance(supplierId: number): number;
}

// Supplier Payment structures
export interface SupplierPaymentRow {
  id: number;
  supplier_id: number;
  amount_paise: number;
  payment_method: 'cash' | 'upi' | 'card' | 'cheque' | 'bank_transfer';
  reference_number: string | null;
  cheque_number: string | null;
  cheque_date: string | null;
  bank_name: string | null;
  payment_date: string;
  notes: string | null;
  is_advance: number;
  unallocated_amount_paise: number;
  created_by: number;
  created_at: string;
}

export interface SupplierPaymentAllocationRow {
  id: number;
  supplier_payment_id: number;
  purchase_invoice_id: number;
  allocated_amount_paise: number;
  allocated_at: string;
}

export interface CreateSupplierPaymentRepoInput {
  supplier_id: number;
  amount_paise: number;
  payment_method: SupplierPaymentRow['payment_method'];
  reference_number?: string | null;
  cheque_number?: string | null;
  cheque_date?: string | null;
  bank_name?: string | null;
  payment_date: string;
  notes?: string | null;
  is_advance?: number;
  unallocated_amount_paise?: number;
  created_by: number;
}

export interface ISupplierPaymentRepository {
  create(input: CreateSupplierPaymentRepoInput): SupplierPaymentRow;
  findById(id: number): SupplierPaymentRow | undefined;
  findBySupplierId(supplierId: number): SupplierPaymentRow[];
  allocatePayment(paymentId: number, invoiceId: number, amountPaise: number): SupplierPaymentAllocationRow;
  findAllocationsByPaymentId(paymentId: number): SupplierPaymentAllocationRow[];
  findAllocationsByInvoiceId(invoiceId: number): SupplierPaymentAllocationRow[];
  updateUnallocatedAmount(paymentId: number, unallocatedAmountPaise: number): void;
}

// Supplier Reporting structures
export interface SupplierAgingRow {
  supplier_id: number;
  company_name: string;
  outstanding_balance_paise: number;
  current_due_paise: number; // 0-30 days
  overdue_30_days_paise: number; // 31-60 days
  overdue_60_days_paise: number; // 61-90 days
  overdue_90_days_paise: number; // 90+ days
}

export interface SupplierPurchaseVolumeRow {
  supplier_id: number;
  company_name: string;
  total_purchases_paise: number;
  total_invoices_count: number;
}

export interface ISupplierReportRepository {
  getSupplierAgingReport(): SupplierAgingRow[];
  getSupplierPurchaseVolumes(startDate: string, endDate: string): SupplierPurchaseVolumeRow[];
  getSupplierLedgerSummary(supplierId: number, startDate: string, endDate: string): {
    opening_balance_paise: number;
    total_debit_paise: number;
    total_credit_paise: number;
    closing_balance_paise: number;
  };
}


export interface CashSessionRow {
  id: number;
  user_id: number;
  opening_float_paise: number;
  actual_cash_paise: number | null;
  status: 'open' | 'reconciled';
  opened_at: string;
  closed_at: string | null;
  remarks: string | null;
}

export interface ICashRepository {
  startSession(input: { user_id: number; opening_float_paise: number }): CashSessionRow;
  reconcileSession(input: { session_id: number; actual_cash_paise: number; remarks?: string | null }): CashSessionRow;
  findSessionById(id: number): CashSessionRow | undefined;
  findActiveSession(): CashSessionRow | undefined;
}

export interface ShopInfo {
  name: string;
  address: string;
  phone: string;
  gstin: string;
}

export interface ISettingsRepository {
  getShopInfo(): ShopInfo;
  updateShopInfo(info: ShopInfo): void;
}

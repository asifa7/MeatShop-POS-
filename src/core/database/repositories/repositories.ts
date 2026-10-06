import { Database } from 'better-sqlite3';
import { IDatabaseProvider } from '../database_provider';
import { IConfigService } from '../../config/config_service';
import { NotFoundError } from '../../backend/errors';
import {
  IUserRepository, UserRow, CreateUserInput,
  IProductRepository, ProductRow, CreateProductInput, ProductVariantRow, ProductVariantWithProduct, CreateVariantInput, VariantRateHistoryRow,
  IInvoiceRepository, Invoice, CreateInvoiceRepoInput, InvoiceDetail, InvoiceItem, AddInvoiceItemRepoInput, CompleteInvoiceUpdate, Payment, RecordPaymentRepoInput, SalesSummaryRow, InvoiceItemReportRow,
  IPurchaseRepository, PurchaseRow, CreatePurchaseRepoInput, PurchaseDetailRow, AverageCostRow,
  IInventoryRepository, StockLedgerRow, StockStatusRow, StockAdjustmentRow, CreateAdjustmentRepoInput, StockAdjustmentDetailRow, StockTransactionRow, CreateTransactionRepoInput, StockTransactionDetailRow, PendingStockEvent, OversoldUnreconciledRow, CreateOversoldInput,
  ICustomerRepository, CustomerRow, CreateCustomerInput,
  ISupplierRepository, SupplierRow,
  ICashRepository, CashSessionRow,
  ISettingsRepository, ShopInfo,

  // Enterprise Supplier Profile & Sub-entities Interfaces
  ISupplierProfileRepository, FullSupplierRow, CreateSupplierProfileInput, SupplierCategoryRow, SupplierContactRow, SupplierAddressRow, SupplierBankAccountRow, SupplierPaymentTermsRow,
  IPurchaseOrderRepository, PurchaseOrderRow, PurchaseOrderItemRow, CreatePurchaseOrderRepoInput,
  IGoodsReceiptRepository, GoodsReceiptRow, GoodsReceiptItemRow, CreateGoodsReceiptRepoInput,
  IPurchaseInvoiceRepository, PurchaseInvoiceRow, PurchaseInvoiceItemRow, CreatePurchaseInvoiceRepoInput,
  ISupplierLedgerRepository, SupplierLedgerEntryRow, CreateSupplierLedgerEntryInput,
  ISupplierPaymentRepository, SupplierPaymentRow, SupplierPaymentAllocationRow, CreateSupplierPaymentRepoInput,
  ISupplierReportRepository, SupplierAgingRow, SupplierPurchaseVolumeRow
} from './repository_interfaces';

export class UserRepository implements IUserRepository {
  constructor(private dbProvider: IDatabaseProvider) {}

  private get db(): Database {
    return this.dbProvider.getRawConnection();
  }

  private findByUsernameStmt: any = null;
  private findByIdStmt: any = null;
  private findByCodeStmt: any = null;
  private updatePasswordHashStmt: any = null;

  public findByUsername(username: string): UserRow | undefined {
    if (!this.findByUsernameStmt) {
      this.findByUsernameStmt = this.db.prepare('SELECT * FROM users WHERE username = ?');
    }
    return this.findByUsernameStmt.get(username) as UserRow | undefined;
  }

  public findById(id: number): UserRow | undefined {
    if (!this.findByIdStmt) {
      this.findByIdStmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    }
    return this.findByIdStmt.get(id) as UserRow | undefined;
  }

  public findByCode(code: string): UserRow | undefined {
    if (!this.findByCodeStmt) {
      this.findByCodeStmt = this.db.prepare('SELECT * FROM users WHERE code = ?');
    }
    return this.findByCodeStmt.get(code) as UserRow | undefined;
  }

  public create(user: CreateUserInput): UserRow {
    const stmt = this.db.prepare(
      'INSERT INTO users (code, username, password_hash, role) VALUES (@code, @username, @password_hash, @role)'
    );
    const result = stmt.run(user);
    const created = this.findById(result.lastInsertRowid as number);
    if (!created) throw new Error('Failed to create user');
    return created;
  }

  public updatePasswordHash(id: number, hash: string): void {
    if (!this.updatePasswordHashStmt) {
      this.updatePasswordHashStmt = this.db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    }
    this.updatePasswordHashStmt.run(hash, id);
  }
}

export class ProductRepository implements IProductRepository {
  constructor(private dbProvider: IDatabaseProvider) {}

  private get db(): Database {
    return this.dbProvider.getRawConnection();
  }

  private findAllStmt: any = null;
  private findAllWithInactiveStmt: any = null;
  private findByIdStmt: any = null;
  private findByCodeStmt: any = null;
  private listCategoriesStmt: any = null;

  public findAll(): ProductRow[] {
    if (!this.findAllStmt) {
      this.findAllStmt = this.db.prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY category, name');
    }
    return this.findAllStmt.all() as ProductRow[];
  }

  public findAllWithInactive(): ProductRow[] {
    if (!this.findAllWithInactiveStmt) {
      this.findAllWithInactiveStmt = this.db.prepare('SELECT * FROM products ORDER BY category, name');
    }
    return this.findAllWithInactiveStmt.all() as ProductRow[];
  }

  public findById(id: number): ProductRow {
    if (!this.findByIdStmt) {
      this.findByIdStmt = this.db.prepare('SELECT * FROM products WHERE id = ?');
    }
    const row = this.findByIdStmt.get(id) as ProductRow | undefined;
    if (!row) throw new NotFoundError(`Product with id ${id} not found`);
    return row;
  }

  public findByCode(productCode: string): ProductRow | undefined {
    if (!this.findByCodeStmt) {
      this.findByCodeStmt = this.db.prepare('SELECT * FROM products WHERE product_code = ?');
    }
    return this.findByCodeStmt.get(productCode) as ProductRow | undefined;
  }

  public create(input: CreateProductInput): ProductRow {
    const stmt = this.db.prepare(
      'INSERT INTO products (product_code, name, unit_type, category) VALUES (@product_code, @name, @unit_type, @category)'
    );
    const result = stmt.run(input);
    return this.findById(result.lastInsertRowid as number);
  }

  public update(id: number, fields: Partial<Pick<ProductRow, 'name' | 'category' | 'unit_type' | 'is_active'>>): ProductRow {
    const existing = this.findById(id);
    const name = fields.name ?? existing.name;
    const category = fields.category ?? existing.category;
    const unit_type = fields.unit_type ?? existing.unit_type;
    const is_active = fields.is_active ?? existing.is_active;

    this.db.prepare(
      'UPDATE products SET name = @name, category = @category, unit_type = @unit_type, is_active = @is_active, updated_at = CURRENT_TIMESTAMP WHERE id = @id'
    ).run({ id, name, category, unit_type, is_active });

    return this.findById(id);
  }

  public listCategories(): string[] {
    if (!this.listCategoriesStmt) {
      this.listCategoriesStmt = this.db.prepare('SELECT DISTINCT category FROM products WHERE is_active = 1 ORDER BY category');
    }
    const rows = this.listCategoriesStmt.all() as { category: string }[];
    return rows.map(r => r.category);
  }

  public hasInvoiceHistory(id: number): boolean {
    const row = this.db.prepare(`
      SELECT 1 FROM invoice_items ii
      JOIN product_variants pv ON ii.product_variant_id = pv.id
      WHERE pv.product_id = ? LIMIT 1
    `).get(id);
    return row !== undefined;
  }

  public hardDelete(id: number): void {
    this.db.prepare('DELETE FROM products WHERE id = ?').run(id);
  }

  public countAll(): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM products').get() as { cnt: number } | undefined;
    return row?.cnt || 0;
  }

  // Variants
  private findAllVariantsActiveStmt: any = null;
  private findVariantByIdStmt: any = null;
  private findVariantsByProductIdStmt: any = null;

  public findAllVariantsActive(): ProductVariantWithProduct[] {
    if (!this.findAllVariantsActiveStmt) {
      this.findAllVariantsActiveStmt = this.db.prepare(`
        SELECT pv.*, COALESCE(pv.product_code, CAST(pv.id AS TEXT)) AS product_code, p.name AS product_name, p.unit_type, p.category
        FROM product_variants pv
        JOIN products p ON pv.product_id = p.id
        WHERE pv.is_active = 1 AND p.is_active = 1
        ORDER BY CAST(COALESCE(pv.product_code, CAST(pv.id AS TEXT)) AS INTEGER) ASC
      `);
    }
    return this.findAllVariantsActiveStmt.all() as ProductVariantWithProduct[];
  }

  public findVariantById(id: number): ProductVariantWithProduct {
    if (!this.findVariantByIdStmt) {
      this.findVariantByIdStmt = this.db.prepare(`
        SELECT pv.*, COALESCE(pv.product_code, CAST(pv.id AS TEXT)) AS product_code, p.name AS product_name, p.unit_type, p.category
        FROM product_variants pv
        JOIN products p ON pv.product_id = p.id
        WHERE pv.id = ?
      `);
    }
    const row = this.findVariantByIdStmt.get(id) as ProductVariantWithProduct | undefined;
    if (!row) throw new NotFoundError(`Product variant with id ${id} not found`);
    return row;
  }

  public findVariantsByProductId(productId: number): ProductVariantRow[] {
    if (!this.findVariantsByProductIdStmt) {
      this.findVariantsByProductIdStmt = this.db.prepare(
        'SELECT * FROM product_variants WHERE product_id = ? AND is_active = 1 ORDER BY variant_name'
      );
    }
    return this.findVariantsByProductIdStmt.all(productId) as ProductVariantRow[];
  }

  public findAllVariantsByProductId(productId: number): ProductVariantRow[] {
    return this.db.prepare(
      'SELECT * FROM product_variants WHERE product_id = ? ORDER BY variant_name'
    ).all(productId) as ProductVariantRow[];
  }

  public createVariant(input: CreateVariantInput): ProductVariantRow {
    const stmt = this.db.prepare(`
      INSERT INTO product_variants (product_id, variant_name, current_rate_paise_per_unit, effective_from)
      VALUES (@product_id, @variant_name, @current_rate_paise_per_unit, CURRENT_TIMESTAMP)
    `);
    const result = stmt.run(input);
    const created = this.db.prepare('SELECT * FROM product_variants WHERE id = ?').get(result.lastInsertRowid) as ProductVariantRow | undefined;
    if (!created) throw new Error('Failed to create variant');
    return created;
  }

  public updateVariantRate(id: number, newRatePaise: number): void {
    this.db.prepare(`
      UPDATE product_variants
      SET current_rate_paise_per_unit = @rate, effective_from = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ id, rate: newRatePaise });
  }

  public updateVariantName(id: number, variantName: string): void {
    this.db.prepare('UPDATE product_variants SET variant_name = @variant_name WHERE id = @id').run({ id, variant_name: variantName });
  }

  public deactivateVariant(id: number): void {
    this.db.prepare('UPDATE product_variants SET is_active = 0 WHERE id = ?').run(id);
  }

  public deactivateAllVariantsForProduct(productId: number): void {
    this.db.prepare('UPDATE product_variants SET is_active = 0 WHERE product_id = ?').run(productId);
  }

  public reactivateVariant(id: number): void {
    this.db.prepare('UPDATE product_variants SET is_active = 1 WHERE id = ?').run(id);
  }

  public insertVariantRateHistory(variantId: number, ratePaise: number, setBy: number): void {
    this.db.prepare(`
      INSERT INTO product_variant_rate_history (product_variant_id, rate_paise_per_unit, effective_from, set_by)
      VALUES (@variant_id, @rate, CURRENT_TIMESTAMP, @set_by)
    `).run({ variant_id: variantId, rate: ratePaise, set_by: setBy });
  }

  public getVariantRateHistory(variantId: number): VariantRateHistoryRow[] {
    return this.db.prepare(
      'SELECT * FROM product_variant_rate_history WHERE product_variant_id = ? ORDER BY effective_from DESC'
    ).all(variantId) as VariantRateHistoryRow[];
  }

  public hasVariantInvoiceHistory(id: number): boolean {
    const row = this.db.prepare('SELECT 1 FROM invoice_items WHERE product_variant_id = ? LIMIT 1').get(id);
    return row !== undefined;
  }

  public hardDeleteVariant(id: number): void {
    this.db.prepare('DELETE FROM product_variant_rate_history WHERE product_variant_id = ?').run(id);
    this.db.prepare('DELETE FROM product_variants WHERE id = ?').run(id);
  }
}

export class InvoiceRepository implements IInvoiceRepository {
  constructor(private dbProvider: IDatabaseProvider) {}

  private get db(): Database {
    return this.dbProvider.getRawConnection();
  }

  private createStmt: any = null;
  private findByIdStmt: any = null;
  private findByInvoiceNumberStmt: any = null;
  private completeInvoiceStmt: any = null;

  public create(input: CreateInvoiceRepoInput): Invoice {
    if (!this.createStmt) {
      this.createStmt = this.db.prepare(`
        INSERT INTO invoices (
          status, is_gst_invoice, gst_number_snapshot, customer_id,
          subtotal_paise, cgst_paise, sgst_paise, tax_paise, total_paise, payment_status, created_by
        ) VALUES (
          'draft', @is_gst_invoice, @gst_number_snapshot, @customer_id,
          0, 0, 0, 0, 0, 'unpaid', @created_by
        )
      `);
    }
    const result = this.createStmt.run({
      created_by: input.created_by,
      is_gst_invoice: input.is_gst_invoice ? 1 : 0,
      gst_number_snapshot: input.gst_number_snapshot ?? null,
      customer_id: input.customer_id ?? null,
    });
    const row = this.db.prepare('SELECT * FROM invoices WHERE id = ?').get(result.lastInsertRowid) as Invoice | undefined;
    if (!row) throw new Error('Failed to create invoice');
    return row;
  }

  public findById(id: number): InvoiceDetail {
    if (!this.findByIdStmt) {
      this.findByIdStmt = this.db.prepare('SELECT * FROM invoices WHERE id = ?');
    }
    const invoice = this.findByIdStmt.get(id) as Invoice | undefined;
    if (!invoice) throw new Error(`Invoice #${id} not found`);

    const items = this.findItemsByInvoiceId(id);
    const payments = this.db.prepare('SELECT * FROM payments WHERE invoice_id = ?').all(id) as any[];

    return { invoice, items, payments };
  }

  public findLatestDraft(): InvoiceDetail | null {
    const row = this.db.prepare("SELECT id FROM invoices WHERE status = 'draft' ORDER BY id DESC LIMIT 1").get() as { id: number } | undefined;
    if (!row) return null;
    return this.findById(row.id);
  }

  public findLatestCompleted(): InvoiceDetail | null {
    const row = this.db.prepare("SELECT id FROM invoices WHERE status IN ('completed', 'void') ORDER BY COALESCE(completed_at, created_at) DESC, id DESC LIMIT 1").get() as { id: number } | undefined;
    if (!row) return null;
    return this.findById(row.id);
  }

  public findByInvoiceNumber(invoiceNumber: string): InvoiceDetail | undefined {
    if (!this.findByInvoiceNumberStmt) {
      this.findByInvoiceNumberStmt = this.db.prepare('SELECT * FROM invoices WHERE invoice_number = ?');
    }
    const invoice = this.findByInvoiceNumberStmt.get(invoiceNumber) as Invoice | undefined;
    if (!invoice) return undefined;
    return this.findById(invoice.id);
  }

  public completeInvoice(id: number, update: CompleteInvoiceUpdate): void {
    if (!this.completeInvoiceStmt) {
      this.completeInvoiceStmt = this.db.prepare(`
        UPDATE invoices SET
          invoice_number = @invoice_number,
          financial_year = @financial_year,
          status = 'completed',
          subtotal_paise = @subtotal_paise,
          cgst_paise = @cgst_paise,
          sgst_paise = @sgst_paise,
          tax_paise = @tax_paise,
          total_paise = @total_paise,
          payment_status = @payment_status,
          discount_paise = @discount_paise,
          discount_reason = @discount_reason,
          discount_applied_by = @discount_applied_by,
          discount_percent = @discount_percent,
          flat_deduction_paise = @flat_deduction_paise,
          dressing_charge_paise = @dressing_charge_paise,
          round_off_paise = @round_off_paise,
          print_delivery_token = @print_delivery_token,
          is_delivery = COALESCE(@is_delivery, is_delivery),
          delivery_charge_paise = COALESCE(@delivery_charge_paise, delivery_charge_paise),
          narration = @narration,
          shop_name_snapshot = @shop_name_snapshot,
          shop_address_snapshot = @shop_address_snapshot,
          completed_at = CURRENT_TIMESTAMP
        WHERE id = @id
      `);
    }

    this.completeInvoiceStmt.run({
      ...update,
      id,
      discount_percent: update.discount_percent ?? 0,
      flat_deduction_paise: update.flat_deduction_paise ?? 0,
      dressing_charge_paise: update.dressing_charge_paise ?? 0,
      round_off_paise: update.round_off_paise ?? 0,
      narration: update.narration ?? null,
      print_delivery_token: update.print_delivery_token ? 1 : 0,
      is_delivery: update.is_delivery !== undefined ? (update.is_delivery ? 1 : 0) : null,
      delivery_charge_paise: update.delivery_charge_paise ?? null,
      discount_reason: update.discount_reason ?? null,
      discount_applied_by: update.discount_applied_by ?? null,
    });
  }

  public voidInvoice(id: number, voidedBy: number, reason: string): void {
    this.db.prepare(`
      UPDATE invoices SET
        status = 'void',
        voided_by = ?,
        void_reason = ?,
        voided_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(voidedBy, reason, id);
  }

  public returnInvoice(id: number, reason: string): void {
    this.db.prepare(`
      UPDATE invoices SET
        status = 'returned',
        void_reason = ?,
        voided_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(reason, id);
  }

  public setStatus(id: number, status: 'draft' | 'held' | 'completed' | 'void' | 'returned'): void {
    this.db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(status, id);
  }

  public toggleGst(id: number, isGst: number, gstinSnapshot: string | null): void {
    this.db.prepare(`
      UPDATE invoices SET
        is_gst_invoice = ?,
        gst_number_snapshot = ?
      WHERE id = ?
    `).run(isGst, gstinSnapshot, id);
  }

  public listHeld(): Invoice[] {
    return this.db.prepare("SELECT * FROM invoices WHERE status = 'held' ORDER BY created_at DESC").all() as Invoice[];
  }

  public deleteInvoice(id: number): void {
    this.db.prepare('DELETE FROM invoices WHERE id = ?').run(id);
  }

  // Items
  private addItemStmt: any = null;
  private updateItemQtyStmt: any = null;
  private removeItemStmt: any = null;
  private findItemsByInvoiceIdStmt: any = null;

  public addItem(item: AddInvoiceItemRepoInput): InvoiceItem {
    if (!this.addItemStmt) {
      this.addItemStmt = this.db.prepare(`
        INSERT INTO invoice_items (
          invoice_id, product_variant_id, quantity_grams, quantity_units,
          rate_paise_snapshot, line_subtotal_paise, gst_rate_percent_snapshot, line_total_paise,
          override_applied, override_reason, overridden_by,
          stock_source, refrigerator_stock_id
        ) VALUES (
          @invoice_id, @product_variant_id, @quantity_grams, @quantity_units,
          @rate_paise_snapshot, @line_subtotal_paise, @gst_rate_percent_snapshot, @line_total_paise,
          @override_applied, @override_reason, @overridden_by,
          @stock_source, @refrigerator_stock_id
        )
      `);
    }
    const result = this.addItemStmt.run({
      invoice_id: item.invoice_id,
      product_variant_id: item.product_variant_id,
      quantity_grams: item.quantity_grams ?? null,
      quantity_units: item.quantity_units ?? null,
      rate_paise_snapshot: item.rate_paise_snapshot,
      line_subtotal_paise: item.line_subtotal_paise,
      gst_rate_percent_snapshot: item.gst_rate_percent_snapshot ?? null,
      line_total_paise: item.line_total_paise,
      override_applied: item.override_applied ? 1 : 0,
      override_reason: item.override_reason ?? null,
      overridden_by: item.overridden_by ?? null,
      stock_source: item.stock_source ?? 'none',
      refrigerator_stock_id: item.refrigerator_stock_id ?? null,
    });
    const created = this.db.prepare('SELECT * FROM invoice_items WHERE id = ?').get(result.lastInsertRowid) as InvoiceItem | undefined;
    if (!created) throw new Error('Failed to create invoice item');
    return created;
  }

  public updateItemQty(id: number, quantityGrams: number | null, quantityUnits: number | null, subtotalPaise: number, totalPaise: number): void {
    if (!this.updateItemQtyStmt) {
      this.updateItemQtyStmt = this.db.prepare(`
        UPDATE invoice_items SET
          quantity_grams = ?,
          quantity_units = ?,
          line_subtotal_paise = ?,
          line_total_paise = ?
        WHERE id = ?
      `);
    }
    this.updateItemQtyStmt.run(quantityGrams, quantityUnits, subtotalPaise, totalPaise, id);
  }

  public removeItem(id: number): void {
    if (!this.removeItemStmt) {
      this.removeItemStmt = this.db.prepare('DELETE FROM invoice_items WHERE id = ?');
    }
    this.removeItemStmt.run(id);
  }

  public findItemsByInvoiceId(invoiceId: number): InvoiceItem[] {
    if (!this.findItemsByInvoiceIdStmt) {
      this.findItemsByInvoiceIdStmt = this.db.prepare(`
        SELECT ii.*, pv.variant_name, p.name AS product_name, COALESCE(pv.product_code, CAST(pv.id AS TEXT)) AS product_code, p.unit_type, p.category
        FROM invoice_items ii
        LEFT JOIN product_variants pv ON ii.product_variant_id = pv.id
        LEFT JOIN products p ON pv.product_id = p.id
        WHERE ii.invoice_id = ?
        ORDER BY ii.id ASC
      `);
    }
    return this.findItemsByInvoiceIdStmt.all(invoiceId) as InvoiceItem[];
  }

  public findItemById(id: number): InvoiceItem {
    const item = this.db.prepare(`
      SELECT ii.*, pv.variant_name, p.name AS product_name, COALESCE(pv.product_code, CAST(pv.id AS TEXT)) AS product_code, p.unit_type, p.category
      FROM invoice_items ii
      LEFT JOIN product_variants pv ON ii.product_variant_id = pv.id
      LEFT JOIN products p ON pv.product_id = p.id
      WHERE ii.id = ?
    `).get(id) as InvoiceItem | undefined;
    if (!item) throw new NotFoundError(`Invoice item with id ${id} not found`);
    return item;
  }

  // Sequence
  public getNextSequenceNumber(financialYear: string): number {
    this.db.prepare(`
      INSERT INTO invoice_sequences (financial_year, last_number)
      VALUES (?, 1)
      ON CONFLICT(financial_year) DO UPDATE SET last_number = last_number + 1
    `).run(financialYear);

    const row = this.db.prepare('SELECT last_number FROM invoice_sequences WHERE financial_year = ?').get(financialYear) as { last_number: number } | undefined;
    if (!row) throw new Error('Failed to generate invoice sequence');
    return row.last_number;
  }

  // Payments
  public addPayment(payment: RecordPaymentRepoInput): Payment {
    const stmt = this.db.prepare(`
      INSERT INTO payments (invoice_id, method, amount_paise, reference_number)
      VALUES (@invoice_id, @method, @amount_paise, @reference_number)
    `);
    const result = stmt.run(payment);
    const created = this.db.prepare('SELECT * FROM payments WHERE id = ?').get(result.lastInsertRowid) as Payment | undefined;
    if (!created) throw new Error('Failed to log payment');
    return created;
  }

  private findPaymentsByInvoiceIdStmt: any = null;

  public findPaymentsByInvoiceId(invoiceId: number): Payment[] {
    if (!this.findPaymentsByInvoiceIdStmt) {
      this.findPaymentsByInvoiceIdStmt = this.db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY received_at');
    }
    return this.findPaymentsByInvoiceIdStmt.all(invoiceId) as Payment[];
  }

  // Reports
  public getSalesSummaryByDate(startDate: string, endDate: string): SalesSummaryRow {
    return this.db.prepare(`
      SELECT 
        COUNT(*) as total_invoices,
        COALESCE(SUM(total_paise), 0) as total_revenue,
        COALESCE(SUM(tax_paise), 0) as total_tax,
        COALESCE(SUM(subtotal_paise), 0) as subtotal,
        COALESCE(SUM(CASE WHEN is_gst_invoice = 1 THEN total_paise ELSE 0 END), 0) as gst_revenue,
        COALESCE(SUM(CASE WHEN is_gst_invoice = 0 THEN total_paise ELSE 0 END), 0) as non_gst_revenue,
        COALESCE(SUM(discount_paise), 0) as total_discount
      FROM invoices
      WHERE status = 'completed' 
        AND DATE(completed_at) BETWEEN DATE(?) AND DATE(?)
    `).get(startDate, endDate) as SalesSummaryRow;
  }

  public getInvoiceItemsByDate(startDate: string, endDate: string): InvoiceItemReportRow[] {
    return this.db.prepare(`
      SELECT 
        ii.product_variant_id,
        ii.quantity_grams,
        ii.quantity_units,
        ii.line_subtotal_paise,
        p.unit_type,
        ii.rate_paise_snapshot
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      JOIN product_variants pv ON ii.product_variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      WHERE i.status = 'completed'
        AND DATE(i.completed_at) BETWEEN DATE(?) AND DATE(?)
    `).all(startDate, endDate) as InvoiceItemReportRow[];
  }

  public updateItemGst(id: number, gstRatePercentSnapshot: number | null, lineTotalPaise: number): void {
    this.db.prepare(`
      UPDATE invoice_items
      SET gst_rate_percent_snapshot = ?, line_total_paise = ?
      WHERE id = ?
    `).run(gstRatePercentSnapshot, lineTotalPaise, id);
  }

  public applyDiscount(id: number, discountPaise: number, reason: string | null, appliedBy: number | null): void {
    this.db.prepare(`
      UPDATE invoices
      SET discount_paise = ?,
          discount_reason = ?,
          discount_applied_by = ?
      WHERE id = ?
    `).run(discountPaise, reason, appliedBy, id);
  }

  public searchInvoices(filter: { startDate?: string; endDate?: string; billNumber?: string; paymentStatus?: string }): Invoice[] {
    let query = "SELECT * FROM invoices WHERE status = 'completed'";
    const params: any[] = [];

    if (filter.billNumber && filter.billNumber.trim()) {
      query += " AND (invoice_number LIKE ? OR CAST(id AS TEXT) = ?)";
      params.push(`%${filter.billNumber.trim()}%`, filter.billNumber.trim());
    }

    if (filter.startDate && filter.startDate.trim()) {
      query += " AND DATE(completed_at) >= DATE(?)";
      params.push(filter.startDate.trim());
    }

    if (filter.endDate && filter.endDate.trim()) {
      query += " AND DATE(completed_at) <= DATE(?)";
      params.push(filter.endDate.trim());
    }

    query += " ORDER BY completed_at DESC LIMIT 50";
    return this.db.prepare(query).all(...params) as Invoice[];
  }
}

export class PurchaseRepository implements IPurchaseRepository {
  constructor(private dbProvider: IDatabaseProvider) {}

  private get db(): Database {
    return this.dbProvider.getRawConnection();
  }

  public create(input: CreatePurchaseRepoInput): PurchaseRow {
    const stmt = this.db.prepare(`
      INSERT INTO purchases (supplier_id, product_variant_id, quantity_grams, quantity_units, cost_paise, created_by)
      VALUES (@supplier_id, @product_variant_id, @quantity_grams, @quantity_units, @cost_paise, @created_by)
    `);
    const result = stmt.run(input);
    const created = this.db.prepare('SELECT * FROM purchases WHERE id = ?').get(result.lastInsertRowid) as PurchaseRow | undefined;
    if (!created) throw new Error('Failed to record purchase');
    return created;
  }

  public findAll(): PurchaseDetailRow[] {
    return this.db.prepare(`
      SELECT pur.*, s.name as supplier_name, pv.variant_name, p.name as product_name, p.category, p.unit_type
      FROM purchases pur
      JOIN suppliers s ON pur.supplier_id = s.id
      JOIN product_variants pv ON pur.product_variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      ORDER BY pur.created_at DESC
    `).all() as PurchaseDetailRow[];
  }

  public getAverageCostForVariants(variantIds: number[]): AverageCostRow[] {
    if (variantIds.length === 0) return [];
    
    // Safety sanitization of integers for raw binding representation
    const placeholders = variantIds.map(() => '?').join(',');
    return this.db.prepare(`
      SELECT 
        product_variant_id,
        SUM(cost_paise) as total_cost,
        SUM(quantity_grams) as total_grams,
        SUM(quantity_units) as total_units
      FROM purchases
      WHERE product_variant_id IN (${placeholders})
      GROUP BY product_variant_id
    `).all(variantIds) as AverageCostRow[];
  }

  public getAverageCostMap(): Map<number, { costPerGram: number; costPerUnit: number }> {
    const purchaseRecords = this.db.prepare(`
      SELECT 
        product_variant_id,
        SUM(cost_paise) as total_cost,
        SUM(quantity_grams) as total_grams,
        SUM(quantity_units) as total_units
      FROM purchases
      GROUP BY product_variant_id
    `).all() as AverageCostRow[];

    const avgCostMap = new Map<number, { costPerGram: number; costPerUnit: number }>();
    purchaseRecords.forEach(p => {
      const costPerGram = p.total_grams ? p.total_cost / p.total_grams : 0;
      const costPerUnit = p.total_units ? p.total_cost / p.total_units : 0;
      avgCostMap.set(p.product_variant_id, { costPerGram, costPerUnit });
    });
    return avgCostMap;
  }
}

export class InventoryRepository implements IInventoryRepository {
  constructor(private dbProvider: IDatabaseProvider) {}

  private get db(): Database {
    return this.dbProvider.getRawConnection();
  }

  private findLedgerByVariantIdStmt: any = null;
  private insertLedgerStockStmt: any = null;
  private updateLedgerStockStmt: any = null;

  // Ledger
  public findLedgerByVariantId(variantId: number): StockLedgerRow | undefined {
    if (!this.findLedgerByVariantIdStmt) {
      this.findLedgerByVariantIdStmt = this.db.prepare('SELECT * FROM stock_ledger WHERE product_variant_id = ?');
    }
    return this.findLedgerByVariantIdStmt.get(variantId) as StockLedgerRow | undefined;
  }

  public findAllLedger(): StockStatusRow[] {
    return this.db.prepare(`
      SELECT 
        COALESCE(sl.id, 0) as id,
        pv.id as product_variant_id,
        COALESCE(sl.quantity_grams, 0) as quantity_grams,
        COALESCE(sl.quantity_units, 0) as quantity_units,
        COALESCE(sl.safety_threshold_grams, 5000) as safety_threshold_grams,
        COALESCE(sl.safety_threshold_units, 10) as safety_threshold_units,
        COALESCE(sl.updated_at, CURRENT_TIMESTAMP) as updated_at,
        pv.variant_name,
        pv.parent_variant_id,
        p.name as product_name,
        COALESCE(pv.product_code, p.product_code) as product_code,
        p.category,
        pv.unit_type,
        pv.is_processed_cut,
        (
          SELECT COALESCE(SUM(ii.quantity_grams), SUM(ii.quantity_units), 0)
          FROM invoice_items ii
          JOIN invoices i ON ii.invoice_id = i.id
          WHERE ii.product_variant_id = pv.id
            AND i.status = 'completed'
            AND i.completed_at >= datetime('now', '-30 days')
        ) as thirty_day_sales
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      LEFT JOIN stock_ledger sl ON sl.product_variant_id = pv.id
      WHERE pv.is_active = 1
      ORDER BY p.category, p.name, pv.variant_name
    `).all() as StockStatusRow[];
  }

  public getLowStock(): StockStatusRow[] {
    return this.db.prepare(`
      SELECT sl.*, pv.variant_name, pv.parent_variant_id, p.name as product_name, p.product_code, p.category, p.unit_type, p.is_processed_cut
      FROM stock_ledger sl
      JOIN product_variants pv ON sl.product_variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      WHERE (p.unit_type = 'weight' AND sl.quantity_grams <= sl.safety_threshold_grams)
         OR (p.unit_type = 'piece' AND sl.quantity_units <= sl.safety_threshold_units)
      ORDER BY p.category, p.name, pv.variant_name
    `).all() as StockStatusRow[];
  }

  public updateLedgerStock(variantId: number, deltaGrams: number | null, deltaUnits: number | null): void {
    const existing = this.findLedgerByVariantId(variantId);
    
    if (!existing) {
      // Create new ledger entry
      if (!this.insertLedgerStockStmt) {
        this.insertLedgerStockStmt = this.db.prepare(`
          INSERT INTO stock_ledger (product_variant_id, quantity_grams, quantity_units, safety_threshold_grams, safety_threshold_units)
          VALUES (?, ?, ?, ?, ?)
        `);
      }
      this.insertLedgerStockStmt.run(
        variantId,
        deltaGrams,
        deltaUnits,
        deltaGrams !== null ? 5000 : null, // Default 5kg threshold
        deltaUnits !== null ? 10 : null   // Default 10 pcs threshold
      );
    } else {
      // Calculate updated stock handling nullish previous values
      const updatedGrams = deltaGrams !== null
        ? (existing.quantity_grams ?? 0) + deltaGrams 
        : existing.quantity_grams;

      const updatedUnits = deltaUnits !== null
        ? (existing.quantity_units ?? 0) + deltaUnits 
        : existing.quantity_units;

      if (!this.updateLedgerStockStmt) {
        this.updateLedgerStockStmt = this.db.prepare(`
          UPDATE stock_ledger SET
            quantity_grams = ?,
            quantity_units = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE product_variant_id = ?
        `);
      }
      this.updateLedgerStockStmt.run(updatedGrams, updatedUnits, variantId);
    }
  }

  // Adjustments
  public createAdjustment(input: CreateAdjustmentRepoInput): StockAdjustmentRow {
    const stmt = this.db.prepare(`
      INSERT INTO stock_adjustments (product_variant_id, adjustment_type, quantity_grams, quantity_units, reason, adjusted_by)
      VALUES (@product_variant_id, @adjustment_type, @quantity_grams, @quantity_units, @reason, @adjusted_by)
    `);
    const result = stmt.run(input);
    const created = this.db.prepare('SELECT * FROM stock_adjustments WHERE id = ?').get(result.lastInsertRowid) as StockAdjustmentRow | undefined;
    if (!created) throw new Error('Failed to record stock adjustment');
    return created;
  }

  public findAllAdjustments(limit: number): StockAdjustmentDetailRow[] {
    return this.db.prepare(`
      SELECT sa.*, pv.variant_name, p.name as product_name, u.username as adjusted_by_username
      FROM stock_adjustments sa
      JOIN product_variants pv ON sa.product_variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      JOIN users u ON sa.adjusted_by = u.id
      ORDER BY sa.created_at DESC LIMIT ?
    `).all(limit) as StockAdjustmentDetailRow[];
  }

  // Transactions
  public createTransaction(input: CreateTransactionRepoInput): StockTransactionRow {
    const stmt = this.db.prepare(`
      INSERT INTO stock_transactions (product_variant_id, transaction_type, quantity_grams, quantity_units, reference_id)
      VALUES (@product_variant_id, @transaction_type, @quantity_grams, @quantity_units, @reference_id)
    `);
    const result = stmt.run(input);
    const created = this.db.prepare('SELECT * FROM stock_transactions WHERE id = ?').get(result.lastInsertRowid) as StockTransactionRow | undefined;
    if (!created) throw new Error('Failed to write stock transaction');
    return created;
  }

  public findAllTransactions(limit: number): StockTransactionDetailRow[] {
    return this.db.prepare(`
      SELECT st.*, pv.variant_name, p.name as product_name
      FROM stock_transactions st
      JOIN product_variants pv ON st.product_variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      ORDER BY st.created_at DESC LIMIT ?
    `).all(limit) as StockTransactionDetailRow[];
  }

  // Pending events
  public findPendingEvents(): PendingStockEvent[] {
    return this.db.prepare('SELECT * FROM pending_stock_events ORDER BY id ASC').all() as PendingStockEvent[];
  }

  public deletePendingEvent(id: number): void {
    this.db.prepare('DELETE FROM pending_stock_events WHERE id = ?').run(id);
  }

  public createPendingEvent(input: { invoice_id: number; invoice_item_id: number; product_variant_id: number; quantity_grams: number | null; quantity_units: number | null; event_type: 'sale_pending_deduction' | 'sale_reversal' }): void {
    this.db.prepare(`
      INSERT INTO pending_stock_events (invoice_id, invoice_item_id, product_variant_id, quantity_grams, quantity_units, event_type)
      VALUES (@invoice_id, @invoice_item_id, @product_variant_id, @quantity_grams, @quantity_units, @event_type)
    `).run(input);
  }

  // Oversold
  public logOversold(input: CreateOversoldInput): void {
    this.db.prepare(`
      INSERT INTO oversold_unreconciled (invoice_id, invoice_item_id, product_variant_id, shortfall_grams, shortfall_units, manager_id, override_reason)
      VALUES (@invoice_id, @invoice_item_id, @product_variant_id, @shortfall_grams, @shortfall_units, @manager_id, @override_reason)
    `).run(input);
  }

  public getOversoldRecords(): OversoldUnreconciledRow[] {
    return this.db.prepare(`
      SELECT 
        o.*,
        pv.variant_name,
        p.name as product_name,
        u.username as manager_name
      FROM oversold_unreconciled o
      JOIN product_variants pv ON o.product_variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      JOIN users u ON o.manager_id = u.id
      ORDER BY o.created_at DESC
    `).all() as OversoldUnreconciledRow[];
  }

  public getLastInOutIndicators(): Record<number, { lastIn: { date: string; qty: string } | null, lastOut: { date: string; qty: string } | null }> {
    const inQuery = `
      SELECT product_variant_id, MAX(created_at) as max_date, quantity_grams, quantity_units
      FROM stock_transactions 
      WHERE (quantity_grams > 0 OR quantity_units > 0)
      GROUP BY product_variant_id
    `;
    const outQuery = `
      SELECT product_variant_id, MAX(created_at) as max_date, quantity_grams, quantity_units
      FROM stock_transactions 
      WHERE (quantity_grams < 0 OR quantity_units < 0)
      GROUP BY product_variant_id
    `;
    const inRows = this.db.prepare(inQuery).all() as any[];
    const outRows = this.db.prepare(outQuery).all() as any[];

    const result: Record<number, any> = {};
    const formatQty = (g: number | null, u: number | null) => {
      if (g) return `${g >= 0 ? g : -g}g`;
      if (u) return `${u >= 0 ? u : -u}pcs`;
      return '';
    };

    inRows.forEach(row => {
      if (!result[row.product_variant_id]) result[row.product_variant_id] = { lastIn: null, lastOut: null };
      result[row.product_variant_id].lastIn = { date: row.max_date, qty: formatQty(row.quantity_grams, row.quantity_units) };
    });

    outRows.forEach(row => {
      if (!result[row.product_variant_id]) result[row.product_variant_id] = { lastIn: null, lastOut: null };
      result[row.product_variant_id].lastOut = { date: row.max_date, qty: formatQty(row.quantity_grams, row.quantity_units) };
    });

    return result;
  }
}

export class CustomerRepository implements ICustomerRepository {
  constructor(private dbProvider: IDatabaseProvider) {}

  private get db(): Database {
    return this.dbProvider.getRawConnection();
  }

  public create(input: CreateCustomerInput): CustomerRow {
    const credit = input.credit_limit_paise ?? 0;
    const stmt = this.db.prepare(`
      INSERT INTO customers (name, phone, credit_limit_paise, current_balance_paise)
      VALUES (?, ?, ?, 0)
    `);
    const result = stmt.run(input.name, input.phone ?? null, credit);
    const created = this.findById(result.lastInsertRowid as number);
    if (!created) throw new Error('Failed to create customer');
    return created;
  }

  public findById(id: number): CustomerRow {
    const row = this.db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as CustomerRow | undefined;
    if (!row) throw new NotFoundError(`Customer with id ${id} not found`);
    return row;
  }

  public findByPhone(phone: string): CustomerRow | undefined {
    return this.db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone) as CustomerRow | undefined;
  }

  public updateCreditBalance(id: number, deltaPaise: number): void {
    this.db.prepare('UPDATE customers SET current_balance_paise = current_balance_paise + ? WHERE id = ?').run(deltaPaise, id);
  }
}

export class SupplierRepository implements ISupplierRepository {
  constructor(private dbProvider: IDatabaseProvider) {}

  private get db(): Database {
    return this.dbProvider.getRawConnection();
  }

  public create(input: { name: string; contact?: string | null }): SupplierRow {
    const code = `SPL-${String(Date.now()).slice(-6)}`;
    const stmt = this.db.prepare(`
      INSERT INTO suppliers (code, company_name, phone)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(code, input.name, input.contact ?? null);
    const created = this.findById(result.lastInsertRowid as number);
    if (!created) throw new Error('Failed to create supplier');
    return created;
  }

  public findAll(): SupplierRow[] {
    return this.db.prepare(`
      SELECT id, code, company_name AS name, phone AS contact, created_at, updated_at 
      FROM suppliers 
      ORDER BY company_name
    `).all() as SupplierRow[];
  }

  public findById(id: number): SupplierRow {
    const row = this.db.prepare(`
      SELECT id, code, company_name AS name, phone AS contact, created_at, updated_at 
      FROM suppliers 
      WHERE id = ?
    `).get(id) as SupplierRow | undefined;
    if (!row) throw new NotFoundError(`Supplier with id ${id} not found`);
    return row;
  }
}

export class SupplierProfileRepository implements ISupplierProfileRepository {
  constructor(private dbProvider: IDatabaseProvider) {}

  private get db(): Database {
    return this.dbProvider.getRawConnection();
  }

  public create(input: CreateSupplierProfileInput): FullSupplierRow {
    const code = `SPL-${String(Date.now()).slice(-6)}`;
    const stmt = this.db.prepare(`
      INSERT INTO suppliers (
        code, company_name, salutation, first_name, last_name, display_name, owner_name, gstin, pan,
        phone, work_phone, mobile_phone, whatsapp, email, category_id, payment_terms, currency,
        billing_address_json, bank_name, account_number, ifsc_code, remarks, document_paths_json,
        is_preferred, credit_limit_paise, opening_balance_paise, opening_balance_date,
        preferred_payment_method, notes, tags
      ) VALUES (
        @code, @company_name, @salutation, @first_name, @last_name, @display_name, @owner_name, @gstin, @pan,
        @phone, @work_phone, @mobile_phone, @whatsapp, @email, @category_id, @payment_terms, @currency,
        @billing_address_json, @bank_name, @account_number, @ifsc_code, @remarks, @document_paths_json,
        @is_preferred, @credit_limit_paise, @opening_balance_paise, @opening_balance_date,
        @preferred_payment_method, @notes, @tags
      )
    `);

    const result = stmt.run({
      code,
      company_name: input.company_name,
      salutation: (input as any).salutation ?? null,
      first_name: (input as any).first_name ?? null,
      last_name: (input as any).last_name ?? null,
      display_name: (input as any).display_name ?? null,
      owner_name: input.owner_name ?? null,
      gstin: input.gstin ?? null,
      pan: input.pan ?? null,
      phone: input.phone ?? null,
      work_phone: (input as any).work_phone ?? null,
      mobile_phone: (input as any).mobile_phone ?? null,
      whatsapp: input.whatsapp ?? null,
      email: input.email ?? null,
      category_id: input.category_id ?? null,
      payment_terms: (input as any).payment_terms ?? null,
      currency: (input as any).currency ?? 'INR',
      billing_address_json: (input as any).billing_address_json ?? null,
      bank_name: (input as any).bank_name ?? null,
      account_number: (input as any).account_number ?? null,
      ifsc_code: (input as any).ifsc_code ?? null,
      remarks: (input as any).remarks ?? null,
      document_paths_json: (input as any).document_paths_json ?? null,
      is_preferred: input.is_preferred ?? 0,
      credit_limit_paise: input.credit_limit_paise ?? 0,
      opening_balance_paise: input.opening_balance_paise ?? 0,
      opening_balance_date: input.opening_balance_date ?? null,
      preferred_payment_method: input.preferred_payment_method ?? null,
      notes: input.notes ?? null,
      tags: input.tags ?? null
    });

    const created = this.findById(result.lastInsertRowid as number);
    if (!created) throw new Error('Failed to create supplier profile');
    return created;
  }

  public findById(id: number): FullSupplierRow | undefined {
    return this.db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id) as FullSupplierRow | undefined;
  }

  public findByCode(code: string): FullSupplierRow | undefined {
    return this.db.prepare('SELECT * FROM suppliers WHERE code = ?').get(code) as FullSupplierRow | undefined;
  }

  public findAll(): FullSupplierRow[] {
    return this.db.prepare('SELECT * FROM suppliers ORDER BY company_name').all() as FullSupplierRow[];
  }

  public update(id: number, fields: Partial<FullSupplierRow>): FullSupplierRow {
    const existing = this.findById(id);
    if (!existing) throw new NotFoundError(`Supplier with id ${id} not found`);

    const updateFields: string[] = [];
    const params: Record<string, any> = { id };

    const keys: (keyof FullSupplierRow | string)[] = [
      'company_name', 'salutation', 'first_name', 'last_name', 'display_name', 'owner_name',
      'gstin', 'pan', 'phone', 'work_phone', 'mobile_phone', 'whatsapp', 'email',
      'category_id', 'payment_terms', 'currency', 'billing_address_json', 'bank_name',
      'account_number', 'ifsc_code', 'remarks', 'document_paths_json',
      'is_active', 'is_preferred', 'credit_limit_paise',
      'outstanding_balance_paise', 'opening_balance_paise', 'opening_balance_date',
      'preferred_payment_method', 'notes', 'tags', 'rating'
    ];

    for (const key of keys) {
      if ((fields as any)[key] !== undefined) {
        updateFields.push(`${key} = @${key}`);
        params[key] = (fields as any)[key];
      }
    }

    if (updateFields.length > 0) {
      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      const query = `UPDATE suppliers SET ${updateFields.join(', ')} WHERE id = @id`;
      this.db.prepare(query).run(params);
    }

    return this.findById(id)!;
  }

  public updateOutstandingBalance(id: number, deltaPaise: number): void {
    this.db.prepare(`
      UPDATE suppliers 
      SET outstanding_balance_paise = outstanding_balance_paise + ?, 
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(deltaPaise, id);
  }

  // Category management
  public createCategory(name: string, description?: string | null): SupplierCategoryRow {
    const stmt = this.db.prepare(`
      INSERT INTO supplier_categories (name, description) VALUES (?, ?)
    `);
    const result = stmt.run(name, description ?? null);
    const created = this.db.prepare('SELECT * FROM supplier_categories WHERE id = ?').get(result.lastInsertRowid) as SupplierCategoryRow | undefined;
    if (!created) throw new Error('Failed to create supplier category');
    return created;
  }

  public findAllCategories(): SupplierCategoryRow[] {
    return this.db.prepare('SELECT * FROM supplier_categories ORDER BY name').all() as SupplierCategoryRow[];
  }

  // Contacts
  public addContact(supplierId: number, contact: Omit<SupplierContactRow, 'id' | 'supplier_id' | 'created_at'>): SupplierContactRow {
    const stmt = this.db.prepare(`
      INSERT INTO supplier_contacts (supplier_id, contact_name, phone, email, role)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(supplierId, contact.contact_name, contact.phone ?? null, contact.email ?? null, contact.role ?? null);
    const created = this.db.prepare('SELECT * FROM supplier_contacts WHERE id = ?').get(result.lastInsertRowid) as SupplierContactRow | undefined;
    if (!created) throw new Error('Failed to add contact');
    return created;
  }

  public getContacts(supplierId: number): SupplierContactRow[] {
    return this.db.prepare('SELECT * FROM supplier_contacts WHERE supplier_id = ? ORDER BY contact_name').all(supplierId) as SupplierContactRow[];
  }

  public removeContact(id: number): void {
    this.db.prepare('DELETE FROM supplier_contacts WHERE id = ?').run(id);
  }

  // Addresses
  public addAddress(supplierId: number, address: Omit<SupplierAddressRow, 'id' | 'supplier_id' | 'created_at'>): SupplierAddressRow {
    const stmt = this.db.prepare(`
      INSERT INTO supplier_addresses (supplier_id, address_type, address_line1, address_line2, city, state, pincode)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(supplierId, address.address_type, address.address_line1, address.address_line2 ?? null, address.city ?? null, address.state ?? null, address.pincode ?? null);
    const created = this.db.prepare('SELECT * FROM supplier_addresses WHERE id = ?').get(result.lastInsertRowid) as SupplierAddressRow | undefined;
    if (!created) throw new Error('Failed to add address');
    return created;
  }

  public getAddresses(supplierId: number): SupplierAddressRow[] {
    return this.db.prepare('SELECT * FROM supplier_addresses WHERE supplier_id = ?').all(supplierId) as SupplierAddressRow[];
  }

  public removeAddress(id: number): void {
    this.db.prepare('DELETE FROM supplier_addresses WHERE id = ?').run(id);
  }

  // Bank accounts
  public addBankAccount(supplierId: number, account: Omit<SupplierBankAccountRow, 'id' | 'supplier_id' | 'created_at'>): SupplierBankAccountRow {
    const stmt = this.db.prepare(`
      INSERT INTO supplier_bank_accounts (supplier_id, bank_name, account_number, ifsc_code, account_holder_name, upi_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(supplierId, account.bank_name, account.account_number, account.ifsc_code, account.account_holder_name, account.upi_id ?? null);
    const created = this.db.prepare('SELECT * FROM supplier_bank_accounts WHERE id = ?').get(result.lastInsertRowid) as SupplierBankAccountRow | undefined;
    if (!created) throw new Error('Failed to add bank account');
    return created;
  }

  public getBankAccounts(supplierId: number): SupplierBankAccountRow[] {
    return this.db.prepare('SELECT * FROM supplier_bank_accounts WHERE supplier_id = ?').all(supplierId) as SupplierBankAccountRow[];
  }

  public removeBankAccount(id: number): void {
    this.db.prepare('DELETE FROM supplier_bank_accounts WHERE id = ?').run(id);
  }

  // Payment terms
  public upsertPaymentTerms(supplierId: number, terms: { payment_terms_days?: number; grace_period_days?: number }): SupplierPaymentTermsRow {
    const existing = this.getPaymentTerms(supplierId);
    if (existing) {
      const days = terms.payment_terms_days ?? existing.payment_terms_days;
      const grace = terms.grace_period_days ?? existing.grace_period_days;
      this.db.prepare(`
        UPDATE supplier_payment_terms
        SET payment_terms_days = ?, grace_period_days = ?
        WHERE supplier_id = ?
      `).run(days, grace, supplierId);
    } else {
      const days = terms.payment_terms_days ?? 30;
      const grace = terms.grace_period_days ?? 5;
      this.db.prepare(`
        INSERT INTO supplier_payment_terms (supplier_id, payment_terms_days, grace_period_days)
        VALUES (?, ?, ?)
      `).run(supplierId, days, grace);
    }
    return this.getPaymentTerms(supplierId)!;
  }

  public getPaymentTerms(supplierId: number): SupplierPaymentTermsRow | undefined {
    return this.db.prepare('SELECT * FROM supplier_payment_terms WHERE supplier_id = ?').get(supplierId) as SupplierPaymentTermsRow | undefined;
  }
}

export class PurchaseOrderRepository implements IPurchaseOrderRepository {
  constructor(private dbProvider: IDatabaseProvider) {}

  private get db(): Database {
    return this.dbProvider.getRawConnection();
  }

  public create(input: CreatePurchaseOrderRepoInput): PurchaseOrderRow {
    const txn = this.db.transaction(() => {
      const stmt = this.db.prepare(`
        INSERT INTO purchase_orders (
          po_number, supplier_id, order_date, expected_delivery_date, status, total_amount_paise, notes, created_by
        ) VALUES (
          @po_number, @supplier_id, @order_date, @expected_delivery_date, @status, @total_amount_paise, @notes, @created_by
        )
      `);

      const totalAmount = input.items.reduce((sum, item) => sum + item.subtotal_paise, 0);

      const result = stmt.run({
        po_number: input.po_number,
        supplier_id: input.supplier_id,
        order_date: input.order_date,
        expected_delivery_date: input.expected_delivery_date ?? null,
        status: input.status,
        total_amount_paise: totalAmount,
        notes: input.notes ?? null,
        created_by: input.created_by
      });

      const poId = result.lastInsertRowid as number;

      const itemStmt = this.db.prepare(`
        INSERT INTO purchase_order_items (
          purchase_order_id, product_variant_id, quantity_ordered, unit_type, unit_price_paise, subtotal_paise
        ) VALUES (
          ?, ?, ?, ?, ?, ?
        )
      `);

      for (const item of input.items) {
        itemStmt.run(poId, item.product_variant_id, item.quantity_ordered, item.unit_type, item.unit_price_paise, item.subtotal_paise);
      }

      return poId;
    });

    const poId = txn();
    const created = this.findById(poId);
    if (!created) throw new Error('Failed to create purchase order');
    return created;
  }

  public findById(id: number): PurchaseOrderRow | undefined {
    return this.db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id) as PurchaseOrderRow | undefined;
  }

  public findByPoNumber(poNumber: string): PurchaseOrderRow | undefined {
    return this.db.prepare('SELECT * FROM purchase_orders WHERE po_number = ?').get(poNumber) as PurchaseOrderRow | undefined;
  }

  public findItemsByPoId(poId: number): PurchaseOrderItemRow[] {
    return this.db.prepare('SELECT * FROM purchase_order_items WHERE purchase_order_id = ?').all(poId) as PurchaseOrderItemRow[];
  }

  public findAll(): PurchaseOrderRow[] {
    return this.db.prepare('SELECT * FROM purchase_orders ORDER BY order_date DESC').all() as PurchaseOrderRow[];
  }

  public updateStatus(id: number, status: PurchaseOrderRow['status'], approvedBy?: number | null): void {
    if (status === 'approved') {
      this.db.prepare(`
        UPDATE purchase_orders 
        SET status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(status, approvedBy ?? null, id);
    } else {
      this.db.prepare(`
        UPDATE purchase_orders 
        SET status = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(status, id);
    }
  }

  public updateQuantityReceived(itemId: number, qtyReceived: number): void {
    this.db.prepare(`
      UPDATE purchase_order_items 
      SET quantity_received = ? 
      WHERE id = ?
    `).run(qtyReceived, itemId);
  }

  public addItem(poId: number, item: Omit<PurchaseOrderItemRow, 'id' | 'purchase_order_id' | 'quantity_received'>): PurchaseOrderItemRow {
    const stmt = this.db.prepare(`
      INSERT INTO purchase_order_items (
        purchase_order_id, product_variant_id, quantity_ordered, unit_type, unit_price_paise, subtotal_paise
      ) VALUES (
        ?, ?, ?, ?, ?, ?
      )
    `);
    const result = stmt.run(poId, item.product_variant_id, item.quantity_ordered, item.unit_type, item.unit_price_paise, item.subtotal_paise);

    const po = this.findById(poId);
    if (po) {
      const newTotal = po.total_amount_paise + item.subtotal_paise;
      this.updateTotalAmount(poId, newTotal);
    }

    const created = this.db.prepare('SELECT * FROM purchase_order_items WHERE id = ?').get(result.lastInsertRowid) as PurchaseOrderItemRow | undefined;
    if (!created) throw new Error('Failed to add PO item');
    return created;
  }

  public updateTotalAmount(poId: number, totalAmountPaise: number): void {
    this.db.prepare(`
      UPDATE purchase_orders 
      SET total_amount_paise = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(totalAmountPaise, poId);
  }
}

export class GoodsReceiptRepository implements IGoodsReceiptRepository {
  constructor(private dbProvider: IDatabaseProvider) {}

  private get db(): Database {
    return this.dbProvider.getRawConnection();
  }

  public create(input: CreateGoodsReceiptRepoInput): GoodsReceiptRow {
    const txn = this.db.transaction(() => {
      const stmt = this.db.prepare(`
        INSERT INTO goods_receipts (
          grn_number, purchase_order_id, supplier_id, delivery_note_number, received_date, received_by, notes
        ) VALUES (
          @grn_number, @purchase_order_id, @supplier_id, @delivery_note_number, @received_date, @received_by, @notes
        )
      `);

      const result = stmt.run({
        grn_number: input.grn_number,
        purchase_order_id: input.purchase_order_id ?? null,
        supplier_id: input.supplier_id,
        delivery_note_number: input.delivery_note_number ?? null,
        received_date: input.received_date,
        received_by: input.received_by,
        notes: input.notes ?? null
      });

      const grnId = result.lastInsertRowid as number;

      const itemStmt = this.db.prepare(`
        INSERT INTO goods_receipt_items (
          goods_receipt_id, purchase_order_item_id, product_variant_id, quantity_accepted, quantity_rejected, rejection_reason, batch_number, expiry_date
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?
        )
      `);

      for (const item of input.items) {
        itemStmt.run(
          grnId,
          item.purchase_order_item_id ?? null,
          item.product_variant_id,
          item.quantity_accepted,
          item.quantity_rejected ?? 0,
          item.rejection_reason ?? null,
          item.batch_number ?? null,
          item.expiry_date ?? null
        );

        if (item.purchase_order_item_id) {
          this.db.prepare(`
            UPDATE purchase_order_items
            SET quantity_received = quantity_received + ?
            WHERE id = ?
          `).run(item.quantity_accepted, item.purchase_order_item_id);
        }
      }

      return grnId;
    });

    const grnId = txn();
    const created = this.findById(grnId);
    if (!created) throw new Error('Failed to create goods receipt');
    return created;
  }

  public findById(id: number): GoodsReceiptRow | undefined {
    return this.db.prepare('SELECT * FROM goods_receipts WHERE id = ?').get(id) as GoodsReceiptRow | undefined;
  }

  public findByGrnNumber(grnNumber: string): GoodsReceiptRow | undefined {
    return this.db.prepare('SELECT * FROM goods_receipts WHERE grn_number = ?').get(grnNumber) as GoodsReceiptRow | undefined;
  }

  public findItemsByGrnId(grnId: number): GoodsReceiptItemRow[] {
    return this.db.prepare('SELECT * FROM goods_receipt_items WHERE goods_receipt_id = ?').all(grnId) as GoodsReceiptItemRow[];
  }

  public findAll(): GoodsReceiptRow[] {
    return this.db.prepare('SELECT * FROM goods_receipts ORDER BY received_date DESC').all() as GoodsReceiptRow[];
  }
}

export class PurchaseInvoiceRepository implements IPurchaseInvoiceRepository {
  constructor(private dbProvider: IDatabaseProvider) {}

  private get db(): Database {
    return this.dbProvider.getRawConnection();
  }

  public create(input: CreatePurchaseInvoiceRepoInput): PurchaseInvoiceRow {
    const txn = this.db.transaction(() => {
      const stmt = this.db.prepare(`
        INSERT INTO purchase_invoices (
          invoice_number, supplier_invoice_number, purchase_ref_number, purchase_order_id, goods_receipt_id, supplier_id, invoice_date,
          subtotal_paise, gst_paise, cgst_paise, sgst_paise, igst_paise, freight_charges_paise, loading_charges_paise,
          packing_charges_paise, other_charges_paise, discount_paise, round_off_paise, total_amount_paise,
          outstanding_amount_paise, payment_status, status, file_path, created_by
        ) VALUES (
          @invoice_number, @supplier_invoice_number, @purchase_ref_number, @purchase_order_id, @goods_receipt_id, @supplier_id, @invoice_date,
          @subtotal_paise, @gst_paise, @cgst_paise, @sgst_paise, @igst_paise, @freight_charges_paise, @loading_charges_paise,
          @packing_charges_paise, @other_charges_paise, @discount_paise, @round_off_paise, @total_amount_paise,
          @outstanding_amount_paise, @payment_status, @status, @file_path, @created_by
        )
      `);

      const result = stmt.run({
        invoice_number: input.invoice_number,
        supplier_invoice_number: input.supplier_invoice_number,
        purchase_ref_number: input.purchase_ref_number ?? null,
        purchase_order_id: input.purchase_order_id ?? null,
        goods_receipt_id: input.goods_receipt_id ?? null,
        supplier_id: input.supplier_id,
        invoice_date: input.invoice_date,
        subtotal_paise: input.subtotal_paise,
        gst_paise: input.gst_paise ?? 0,
        cgst_paise: input.cgst_paise ?? 0,
        sgst_paise: input.sgst_paise ?? 0,
        igst_paise: input.igst_paise ?? 0,
        freight_charges_paise: input.freight_charges_paise ?? 0,
        loading_charges_paise: input.loading_charges_paise ?? 0,
        packing_charges_paise: input.packing_charges_paise ?? 0,
        other_charges_paise: input.other_charges_paise ?? 0,
        discount_paise: input.discount_paise ?? 0,
        round_off_paise: input.round_off_paise ?? 0,
        total_amount_paise: input.total_amount_paise,
        outstanding_amount_paise: input.outstanding_amount_paise,
        payment_status: input.payment_status,
        status: input.status,
        file_path: input.file_path ?? null,
        created_by: input.created_by
      });

      const invoiceId = result.lastInsertRowid as number;

      const itemStmt = this.db.prepare(`
        INSERT INTO purchase_invoice_items (
          purchase_invoice_id, product_variant_id, quantity, unit_price_paise, gst_rate_bps, gst_amount_paise, total_amount_paise
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?
        )
      `);

      for (const item of input.items) {
        itemStmt.run(
          invoiceId,
          item.product_variant_id,
          item.quantity,
          item.unit_price_paise,
          item.gst_rate_bps,
          item.gst_amount_paise,
          item.total_amount_paise
        );

        this.db.prepare(`
          INSERT INTO supplier_price_history (supplier_id, product_variant_id, unit_price_paise, effective_date, purchase_invoice_id)
          VALUES (?, ?, ?, ?, ?)
        `).run(input.supplier_id, item.product_variant_id, item.unit_price_paise, input.invoice_date, invoiceId);
      }

      this.db.prepare(`
        UPDATE suppliers 
        SET outstanding_balance_paise = outstanding_balance_paise + ?
        WHERE id = ?
      `).run(input.total_amount_paise, input.supplier_id);

      return invoiceId;
    });

    const invoiceId = txn();
    const created = this.findById(invoiceId);
    if (!created) throw new Error('Failed to create purchase invoice');
    return created;
  }

  public findById(id: number): PurchaseInvoiceRow | undefined {
    return this.db.prepare('SELECT * FROM purchase_invoices WHERE id = ?').get(id) as PurchaseInvoiceRow | undefined;
  }

  public findByInvoiceNumber(invoiceNumber: string): PurchaseInvoiceRow | undefined {
    return this.db.prepare('SELECT * FROM purchase_invoices WHERE invoice_number = ?').get(invoiceNumber) as PurchaseInvoiceRow | undefined;
  }

  public findItemsByInvoiceId(invoiceId: number): PurchaseInvoiceItemRow[] {
    return this.db.prepare('SELECT * FROM purchase_invoice_items WHERE purchase_invoice_id = ?').all(invoiceId) as PurchaseInvoiceItemRow[];
  }

  public findAll(): PurchaseInvoiceRow[] {
    return this.db.prepare('SELECT * FROM purchase_invoices ORDER BY invoice_date DESC').all() as PurchaseInvoiceRow[];
  }

  public updateOutstandingAndPaymentStatus(id: number, outstandingAmountPaise: number, paymentStatus: PurchaseInvoiceRow['payment_status']): void {
    const stmt = this.db.prepare('UPDATE purchase_invoices SET outstanding_amount_paise = ?, payment_status = ? WHERE id = ?');
    stmt.run(outstandingAmountPaise, paymentStatus, id);
  }

  public updateStatus(id: number, status: PurchaseInvoiceRow['status']): void {
    const stmt = this.db.prepare('UPDATE purchase_invoices SET status = ? WHERE id = ?');
    stmt.run(status, id);
  }
}

export class SupplierLedgerRepository implements ISupplierLedgerRepository {
  constructor(private dbProvider: IDatabaseProvider) {}

  private get db(): Database {
    return this.dbProvider.getRawConnection();
  }

  public create(input: CreateSupplierLedgerEntryInput): SupplierLedgerEntryRow {
    const txn = this.db.transaction(() => {
      const lastEntry = this.db.prepare(`
        SELECT running_balance_paise FROM supplier_ledger
        WHERE supplier_id = ?
        ORDER BY entry_date DESC, id DESC LIMIT 1
      `).get(input.supplier_id) as { running_balance_paise: number } | undefined;

      const previousBalance = lastEntry ? lastEntry.running_balance_paise : 0;
      const debit = input.debit_paise ?? 0;
      const credit = input.credit_paise ?? 0;
      const runningBalance = previousBalance + credit - debit;

      const stmt = this.db.prepare(`
        INSERT INTO supplier_ledger (
          supplier_id, entry_date, ref_type, ref_id, description, debit_paise, credit_paise, running_balance_paise, status
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `);

      const result = stmt.run(
        input.supplier_id,
        input.entry_date,
        input.ref_type,
        input.ref_id ?? null,
        input.description,
        debit,
        credit,
        runningBalance,
        input.status || 'approved'
      );

      return result.lastInsertRowid as number;
    });

    const entryId = txn();
    const created = this.db.prepare('SELECT * FROM supplier_ledger WHERE id = ?').get(entryId) as SupplierLedgerEntryRow | undefined;
    if (!created) throw new Error('Failed to create ledger entry');
    return created;
  }

  public updateStatus(id: number, status: SupplierLedgerEntryRow['status']): void {
    const stmt = this.db.prepare('UPDATE supplier_ledger SET status = ? WHERE id = ?');
    stmt.run(status, id);
  }

  public findBySupplierId(supplierId: number): SupplierLedgerEntryRow[] {
    return this.db.prepare('SELECT * FROM supplier_ledger WHERE supplier_id = ? ORDER BY entry_date ASC, id ASC').all(supplierId) as SupplierLedgerEntryRow[];
  }

  public getRunningBalance(supplierId: number): number {
    const row = this.db.prepare(`
      SELECT running_balance_paise FROM supplier_ledger
      WHERE supplier_id = ?
      ORDER BY entry_date DESC, id DESC LIMIT 1
    `).get(supplierId) as { running_balance_paise: number } | undefined;
    return row ? row.running_balance_paise : 0;
  }
}

export class SupplierPaymentRepository implements ISupplierPaymentRepository {
  constructor(private dbProvider: IDatabaseProvider) {}

  private get db(): Database {
    return this.dbProvider.getRawConnection();
  }

  public create(input: CreateSupplierPaymentRepoInput): SupplierPaymentRow {
    const txn = this.db.transaction(() => {
      const stmt = this.db.prepare(`
        INSERT INTO supplier_payments (
          supplier_id, amount_paise, payment_method, reference_number, cheque_number, cheque_date, bank_name,
          payment_date, notes, is_advance, unallocated_amount_paise, created_by
        ) VALUES (
          @supplier_id, @amount_paise, @payment_method, @reference_number, @cheque_number, @cheque_date, @bank_name,
          @payment_date, @notes, @is_advance, @unallocated_amount_paise, @created_by
        )
      `);

      const result = stmt.run({
        supplier_id: input.supplier_id,
        amount_paise: input.amount_paise,
        payment_method: input.payment_method,
        reference_number: input.reference_number ?? null,
        cheque_number: input.cheque_number ?? null,
        cheque_date: input.cheque_date ?? null,
        bank_name: input.bank_name ?? null,
        payment_date: input.payment_date,
        notes: input.notes ?? null,
        is_advance: input.is_advance ?? 0,
        unallocated_amount_paise: input.unallocated_amount_paise ?? input.amount_paise,
        created_by: input.created_by
      });

      this.db.prepare(`
        UPDATE suppliers
        SET outstanding_balance_paise = outstanding_balance_paise - ?
        WHERE id = ?
      `).run(input.amount_paise, input.supplier_id);

      return result.lastInsertRowid as number;
    });

    const paymentId = txn();
    const created = this.findById(paymentId);
    if (!created) throw new Error('Failed to record supplier payment');
    return created;
  }

  public findById(id: number): SupplierPaymentRow | undefined {
    return this.db.prepare('SELECT * FROM supplier_payments WHERE id = ?').get(id) as SupplierPaymentRow | undefined;
  }

  public findBySupplierId(supplierId: number): SupplierPaymentRow[] {
    return this.db.prepare('SELECT * FROM supplier_payments WHERE supplier_id = ? ORDER BY payment_date DESC').all(supplierId) as SupplierPaymentRow[];
  }

  public allocatePayment(paymentId: number, invoiceId: number, amountPaise: number): SupplierPaymentAllocationRow {
    const txn = this.db.transaction(() => {
      const stmt = this.db.prepare(`
        INSERT INTO supplier_payment_allocations (supplier_payment_id, purchase_invoice_id, allocated_amount_paise)
        VALUES (?, ?, ?)
      `);
      const result = stmt.run(paymentId, invoiceId, amountPaise);

      this.db.prepare(`
        UPDATE supplier_payments
        SET unallocated_amount_paise = unallocated_amount_paise - ?
        WHERE id = ?
      `).run(amountPaise, paymentId);

      const invoice = this.db.prepare('SELECT outstanding_amount_paise, total_amount_paise FROM purchase_invoices WHERE id = ?').get(invoiceId) as { outstanding_amount_paise: number; total_amount_paise: number } | undefined;
      if (!invoice) throw new Error(`Invoice with id ${invoiceId} not found`);

      const newOutstanding = Math.max(0, invoice.outstanding_amount_paise - amountPaise);
      const newStatus = newOutstanding === 0 
        ? 'paid' 
        : (newOutstanding === invoice.total_amount_paise ? 'unpaid' : 'partially_paid');

      this.db.prepare(`
        UPDATE purchase_invoices
        SET outstanding_amount_paise = ?, payment_status = ?
        WHERE id = ?
      `).run(newOutstanding, newStatus, invoiceId);

      return result.lastInsertRowid as number;
    });

    const allocationId = txn();
    const created = this.db.prepare('SELECT * FROM supplier_payment_allocations WHERE id = ?').get(allocationId) as SupplierPaymentAllocationRow | undefined;
    if (!created) throw new Error('Failed to create payment allocation');
    return created;
  }

  public findAllocationsByPaymentId(paymentId: number): SupplierPaymentAllocationRow[] {
    return this.db.prepare('SELECT * FROM supplier_payment_allocations WHERE supplier_payment_id = ?').all(paymentId) as SupplierPaymentAllocationRow[];
  }

  public findAllocationsByInvoiceId(invoiceId: number): SupplierPaymentAllocationRow[] {
    return this.db.prepare('SELECT * FROM supplier_payment_allocations WHERE purchase_invoice_id = ?').all(invoiceId) as SupplierPaymentAllocationRow[];
  }

  public updateUnallocatedAmount(paymentId: number, unallocatedAmountPaise: number): void {
    this.db.prepare(`
      UPDATE supplier_payments
      SET unallocated_amount_paise = ?
      WHERE id = ?
    `).run(unallocatedAmountPaise, paymentId);
  }
}

export class SupplierReportRepository implements ISupplierReportRepository {
  constructor(private dbProvider: IDatabaseProvider) {}

  private get db(): Database {
    return this.dbProvider.getRawConnection();
  }

  public getSupplierAgingReport(): SupplierAgingRow[] {
    return this.db.prepare(`
      SELECT 
        s.id AS supplier_id,
        s.company_name,
        s.outstanding_balance_paise,
        COALESCE(SUM(CASE WHEN (julianday('now') - julianday(pi.invoice_date)) <= 30 THEN pi.outstanding_amount_paise ELSE 0 END), 0) AS current_due_paise,
        COALESCE(SUM(CASE WHEN (julianday('now') - julianday(pi.invoice_date)) BETWEEN 30.0001 AND 60 THEN pi.outstanding_amount_paise ELSE 0 END), 0) AS overdue_30_days_paise,
        COALESCE(SUM(CASE WHEN (julianday('now') - julianday(pi.invoice_date)) BETWEEN 60.0001 AND 90 THEN pi.outstanding_amount_paise ELSE 0 END), 0) AS overdue_60_days_paise,
        COALESCE(SUM(CASE WHEN (julianday('now') - julianday(pi.invoice_date)) > 90 THEN pi.outstanding_amount_paise ELSE 0 END), 0) AS overdue_90_days_paise
      FROM suppliers s
      LEFT JOIN purchase_invoices pi ON s.id = pi.supplier_id AND pi.outstanding_amount_paise > 0
      GROUP BY s.id
      ORDER BY s.company_name
    `).all() as SupplierAgingRow[];
  }

  public getSupplierPurchaseVolumes(startDate: string, endDate: string): SupplierPurchaseVolumeRow[] {
    return this.db.prepare(`
      SELECT 
        s.id AS supplier_id,
        s.company_name,
        COALESCE(SUM(pi.total_amount_paise), 0) AS total_purchases_paise,
        COUNT(pi.id) AS total_invoices_count
      FROM suppliers s
      LEFT JOIN purchase_invoices pi ON s.id = pi.supplier_id AND DATE(pi.invoice_date) BETWEEN DATE(?) AND DATE(?)
      GROUP BY s.id
      ORDER BY total_purchases_paise DESC
    `).all(startDate, endDate) as SupplierPurchaseVolumeRow[];
  }

  public getSupplierLedgerSummary(supplierId: number, startDate: string, endDate: string): {
    opening_balance_paise: number;
    total_debit_paise: number;
    total_credit_paise: number;
    closing_balance_paise: number;
  } {
    const openingRow = this.db.prepare(`
      SELECT running_balance_paise FROM supplier_ledger
      WHERE supplier_id = ? AND DATE(entry_date) < DATE(?)
      ORDER BY entry_date DESC, id DESC LIMIT 1
    `).get(supplierId, startDate) as { running_balance_paise: number } | undefined;

    const opening_balance_paise = openingRow ? openingRow.running_balance_paise : 0;

    const sumsRow = this.db.prepare(`
      SELECT 
        COALESCE(SUM(debit_paise), 0) AS total_debit,
        COALESCE(SUM(credit_paise), 0) AS total_credit
      FROM supplier_ledger
      WHERE supplier_id = ? AND DATE(entry_date) BETWEEN DATE(?) AND DATE(?)
    `).get(supplierId, startDate, endDate) as { total_debit: number; total_credit: number } | undefined;

    const total_debit_paise = sumsRow ? sumsRow.total_debit : 0;
    const total_credit_paise = sumsRow ? sumsRow.total_credit : 0;

    const closingRow = this.db.prepare(`
      SELECT running_balance_paise FROM supplier_ledger
      WHERE supplier_id = ? AND DATE(entry_date) <= DATE(?)
      ORDER BY entry_date DESC, id DESC LIMIT 1
    `).get(supplierId, endDate) as { running_balance_paise: number } | undefined;

    const closing_balance_paise = closingRow ? closingRow.running_balance_paise : (opening_balance_paise + total_credit_paise - total_debit_paise);

    return {
      opening_balance_paise,
      total_debit_paise,
      total_credit_paise,
      closing_balance_paise
    };
  }
}

export class CashRepository implements ICashRepository {
  constructor(private dbProvider: IDatabaseProvider) {}

  private get db(): Database {
    return this.dbProvider.getRawConnection();
  }

  public startSession(input: { user_id: number; opening_float_paise: number }): CashSessionRow {
    const stmt = this.db.prepare(`
      INSERT INTO cash_sessions (user_id, opening_float_paise, status)
      VALUES (?, ?, 'open')
    `);
    const result = stmt.run(input.user_id, input.opening_float_paise);
    const created = this.findSessionById(result.lastInsertRowid as number);
    if (!created) throw new Error('Failed to open cash drawer session');
    return created;
  }

  public reconcileSession(input: { session_id: number; actual_cash_paise: number; remarks?: string | null }): CashSessionRow {
    this.db.prepare(`
      UPDATE cash_sessions SET
        actual_cash_paise = ?,
        status = 'reconciled',
        remarks = ?,
        closed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(input.actual_cash_paise, input.remarks ?? null, input.session_id);
    const updated = this.findSessionById(input.session_id);
    if (!updated) throw new Error('Failed to reconcile session');
    return updated;
  }

  public findSessionById(id: number): CashSessionRow | undefined {
    return this.db.prepare('SELECT * FROM cash_sessions WHERE id = ?').get(id) as CashSessionRow | undefined;
  }

  public findActiveSession(): CashSessionRow | undefined {
    return this.db.prepare("SELECT * FROM cash_sessions WHERE status = 'open' LIMIT 1").get() as CashSessionRow | undefined;
  }
}

export class SettingsRepository implements ISettingsRepository {
  constructor(private configService: IConfigService) {}

  public getShopInfo(): ShopInfo {
    const config = this.configService.get();
    return {
      name: config.shopInfo.name,
      address: config.shopInfo.address,
      phone: config.shopInfo.phone,
      gstin: config.shopInfo.gstin,
    };
  }

  public updateShopInfo(info: ShopInfo): void {
    this.configService.update({
      shopInfo: {
        name: info.name,
        address: info.address,
        phone: info.phone,
        gstin: info.gstin,
        currencySymbol: '₹',
      }
    });
  }
}

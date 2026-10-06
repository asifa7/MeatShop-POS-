import { db } from '../../../../core/backend/db';

export interface InvoiceItemRow {
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
  stock_source?: string;
  refrigerator_stock_id?: number | null;
}

export interface InvoiceItemWithDetails extends InvoiceItemRow {
  variant_name: string;
  product_name: string;
  product_code: string;
  unit_type: 'weight' | 'piece' | 'live_dual';
  category: string;
  stock_source?: string;
  refrigerator_stock_id?: number | null;
}

export interface CreateInvoiceItemInput {
  invoice_id: number;
  product_variant_id: number;
  quantity_grams: number | null;
  quantity_units: number | null;
  rate_paise_snapshot: number;
  line_subtotal_paise: number;
  gst_rate_percent_snapshot: number | null;
  line_total_paise: number;
  override_applied: boolean;
  override_reason: string | null;
  overridden_by: number | null;
  stock_source?: string;
  refrigerator_stock_id?: number | null;
}

const invoiceItemsRepository = {
  findByInvoiceId(invoiceId: number): InvoiceItemWithDetails[] {
    return db.prepare(`
      SELECT ii.*,
        pv.variant_name,
        p.name AS product_name,
        COALESCE(pv.product_code, CAST(pv.id AS TEXT)) AS product_code,
        p.unit_type,
        p.category
      FROM invoice_items ii
      LEFT JOIN product_variants pv ON ii.product_variant_id = pv.id
      LEFT JOIN products p ON pv.product_id = p.id
      WHERE ii.invoice_id = ?
      ORDER BY ii.id ASC
    `).all(invoiceId) as InvoiceItemWithDetails[];
  },

  findById(id: number): InvoiceItemRow | undefined {
    return db.prepare('SELECT * FROM invoice_items WHERE id = ?').get(id) as InvoiceItemRow | undefined;
  },

  create(input: CreateInvoiceItemInput): InvoiceItemRow {
    const stockSource = input.stock_source || 'none';
    const result = db.prepare(`
      INSERT INTO invoice_items (
        invoice_id, product_variant_id,
        quantity_grams, quantity_units,
        rate_paise_snapshot, line_subtotal_paise,
        gst_rate_percent_snapshot, line_total_paise,
        override_applied, override_reason, overridden_by,
        stock_source, refrigerator_stock_id
      ) VALUES (
        @invoice_id, @product_variant_id,
        @quantity_grams, @quantity_units,
        @rate_paise_snapshot, @line_subtotal_paise,
        @gst_rate_percent_snapshot, @line_total_paise,
        @override_applied, @override_reason, @overridden_by,
        @stock_source, @refrigerator_stock_id
      )
    `).run({
      ...input,
      override_applied: input.override_applied ? 1 : 0,
      stock_source: stockSource,
      refrigerator_stock_id: input.refrigerator_stock_id ?? null,
    });
    return db.prepare('SELECT * FROM invoice_items WHERE id = ?').get(result.lastInsertRowid) as InvoiceItemRow;
  },

  updateQuantityAndTotals(
    id: number,
    quantityGrams: number | null,
    quantityUnits: number | null,
    lineSubtotalPaise: number,
    lineTotalPaise: number
  ): void {
    db.prepare(`
      UPDATE invoice_items
      SET quantity_grams = @grams, quantity_units = @units,
          line_subtotal_paise = @subtotal, line_total_paise = @total
      WHERE id = @id
    `).run({ id, grams: quantityGrams, units: quantityUnits, subtotal: lineSubtotalPaise, total: lineTotalPaise });
  },

  deleteById(id: number): void {
    db.prepare('DELETE FROM invoice_items WHERE id = ?').run(id);
  },

  deleteByInvoiceId(invoiceId: number): void {
    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(invoiceId);
  },
};

export { invoiceItemsRepository };

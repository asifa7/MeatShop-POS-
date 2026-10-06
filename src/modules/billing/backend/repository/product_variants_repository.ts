import { db } from '../../../../core/backend/db';
import { NotFoundError } from '../../../../core/backend/errors';

export interface ProductVariantRow {
  id: number;
  product_id: number;
  variant_name: string;
  product_code?: string;
  current_rate_paise_per_unit: number;
  cost_price_paise_per_unit?: number;
  barcode?: string | null;
  effective_from: string;
  is_active: number;
  last_purchase_cost?: number;
  weighted_average_cost?: number;
  fifo_current_cost?: number;
  current_stock?: number;
  inventory_value?: number;
  parent_variant_id?: number | null;
  yield_ratio?: number | null;
  is_processed_cut: number;
  latest_purchase_rate_paise?: number | null;
  previous_purchase_rate_paise?: number | null;
}

export interface ProductVariantWithProduct extends ProductVariantRow {
  product_code: string;
  product_name: string;
  unit_type: 'weight' | 'piece' | 'live_dual';
  category: string;
}

export interface CreateVariantInput {
  product_id: number;
  variant_name: string;
  current_rate_paise_per_unit: number;
  cost_price_paise_per_unit?: number;
  barcode?: string | null;
  parent_variant_id?: number | null;
  yield_ratio?: number | null;
  is_processed_cut?: number;
}

const productVariantsRepository = {
  findAllActive(): ProductVariantWithProduct[] {
    return db.prepare(`
      SELECT pv.*, COALESCE(pv.product_code, CAST(pv.id AS TEXT)) AS product_code, p.name AS product_name, p.unit_type, p.category
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE pv.is_active = 1 AND p.is_active = 1
      ORDER BY CAST(COALESCE(pv.product_code, CAST(pv.id AS TEXT)) AS INTEGER) ASC
    `).all() as ProductVariantWithProduct[];
  },

  findById(id: number): ProductVariantWithProduct {
    const row = db.prepare(`
      SELECT pv.*, COALESCE(pv.product_code, CAST(pv.id AS TEXT)) AS product_code, p.name AS product_name, p.unit_type, p.category
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE pv.id = ?
    `).get(id) as ProductVariantWithProduct | undefined;
    if (!row) {
      throw new NotFoundError(`Product variant with id ${id} not found`);
    }
    return row;
  },

  findByCode(code: string): ProductVariantWithProduct | null {
    const row = db.prepare(`
      SELECT pv.*, COALESCE(pv.product_code, CAST(pv.id AS TEXT)) AS product_code, p.name AS product_name, p.unit_type, p.category
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE (pv.product_code = ? OR CAST(pv.id AS TEXT) = ?) AND pv.is_active = 1 AND p.is_active = 1
    `).get(code, code) as ProductVariantWithProduct | undefined;
    return row || null;
  },

  /** Returns active variants for a product (for Billing use) */
  findByProductId(productId: number): ProductVariantRow[] {
    return db.prepare(
      'SELECT * FROM product_variants WHERE product_id = ? AND is_active = 1 ORDER BY variant_name'
    ).all(productId) as ProductVariantRow[];
  },

  /** Returns ALL variants for a product including inactive (for admin management view) */
  findAllByProductId(productId: number): ProductVariantRow[] {
    return db.prepare(
      'SELECT * FROM product_variants WHERE product_id = ? ORDER BY variant_name'
    ).all(productId) as ProductVariantRow[];
  },

  create(input: CreateVariantInput): ProductVariantRow {
    const isProcessedCut = input.is_processed_cut ?? 0;
    const stmt = db.prepare(`
      INSERT INTO product_variants (product_id, variant_name, current_rate_paise_per_unit, cost_price_paise_per_unit, barcode, effective_from, parent_variant_id, yield_ratio, is_processed_cut)
      VALUES (@product_id, @variant_name, @current_rate_paise_per_unit, @cost_price_paise_per_unit, @barcode, CURRENT_TIMESTAMP, @parent_variant_id, @yield_ratio, @is_processed_cut)
    `);
    const result = stmt.run({
      product_id: input.product_id,
      variant_name: input.variant_name,
      current_rate_paise_per_unit: input.current_rate_paise_per_unit,
      cost_price_paise_per_unit: input.cost_price_paise_per_unit || 0,
      barcode: input.barcode || null,
      parent_variant_id: input.parent_variant_id || null,
      yield_ratio: input.yield_ratio || null,
      is_processed_cut: isProcessedCut,
    });
    return db.prepare('SELECT * FROM product_variants WHERE id = ?').get(result.lastInsertRowid) as ProductVariantRow;
  },

  updateRate(id: number, newRatePaise: number): void {
    db.prepare(`
      UPDATE product_variants
      SET current_rate_paise_per_unit = @rate, effective_from = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ id, rate: newRatePaise });
  },

  updateName(id: number, variantName: string): void {
    db.prepare(
      'UPDATE product_variants SET variant_name = @variant_name WHERE id = @id'
    ).run({ id, variant_name: variantName });
  },

  updateVariantDetails(id: number, input: { variant_name?: string; cost_price_paise_per_unit?: number; barcode?: string | null; parent_variant_id?: number | null; yield_ratio?: number | null }): void {
    if (input.variant_name !== undefined) {
      db.prepare('UPDATE product_variants SET variant_name = ? WHERE id = ?').run(input.variant_name, id);
    }
    if (input.cost_price_paise_per_unit !== undefined) {
      db.prepare('UPDATE product_variants SET cost_price_paise_per_unit = ? WHERE id = ?').run(input.cost_price_paise_per_unit, id);
    }
    if (input.barcode !== undefined) {
      db.prepare('UPDATE product_variants SET barcode = ? WHERE id = ?').run(input.barcode, id);
    }
    if (input.parent_variant_id !== undefined) {
      db.prepare('UPDATE product_variants SET parent_variant_id = ? WHERE id = ?').run(input.parent_variant_id, id);
    }
    if (input.yield_ratio !== undefined) {
      db.prepare('UPDATE product_variants SET yield_ratio = ? WHERE id = ?').run(input.yield_ratio, id);
    }
    this.syncVariantCostCache(id);
  },

  deactivate(id: number): void {
    db.prepare('UPDATE product_variants SET is_active = 0 WHERE id = ?').run(id);
  },

  deactivateAllForProduct(productId: number): void {
    db.prepare('UPDATE product_variants SET is_active = 0 WHERE product_id = ?').run(productId);
  },

  reactivate(id: number): void {
    db.prepare('UPDATE product_variants SET is_active = 1 WHERE id = ?').run(id);
  },

  insertRateHistory(variantId: number, ratePaise: number, setBy: number): void {
    db.prepare(`
      INSERT INTO product_variant_rate_history (product_variant_id, rate_paise_per_unit, effective_from, set_by)
      VALUES (@variant_id, @rate, CURRENT_TIMESTAMP, @set_by)
    `).run({ variant_id: variantId, rate: ratePaise, set_by: setBy });
  },

  getRateHistory(variantId: number): { id: number; rate_paise_per_unit: number; effective_from: string; set_by: number }[] {
    return db.prepare(
      'SELECT * FROM product_variant_rate_history WHERE product_variant_id = ? ORDER BY effective_from DESC'
    ).all(variantId) as { id: number; rate_paise_per_unit: number; effective_from: string; set_by: number }[];
  },

  /**
   * Returns true if this variant has ever appeared on an invoice_item.
   * Used to gate hard-delete vs deactivate decisions.
   */
  hasInvoiceHistory(id: number): boolean {
    const row = db.prepare(
      'SELECT 1 FROM invoice_items WHERE product_variant_id = ? LIMIT 1'
    ).get(id);
    return row !== undefined;
  },

  /**
   * Hard-deletes a variant and its rate history. Only call after confirming hasInvoiceHistory returns false.
   */
  hardDelete(id: number): void {
    const deleteTx = db.transaction(() => {
      // Nullify parent_variant_id references
      db.prepare('UPDATE product_variants SET parent_variant_id = NULL WHERE parent_variant_id = ?').run(id);

      const tables = [
        'stock_ledger',
        'stock_transactions',
        'product_stock_batches',
        'inventory_ledger',
        'purchases',
        'purchase_invoice_items',
        'goods_receipt_items',
        'purchase_return_items',
        'purchase_order_items',
        'supplier_price_history',
        'pending_stock_events',
        'legacy_negative_stock_review',
        'oversold_unreconciled',
        'sales_return_items',
        'yield_processing_runs',
        'yield_processing_outputs',
        'stock_transfer_items',
        'bulk_orders',
        'stock_adjustments',
        'daily_inventory_reconciliations',
        'physical_stock_audit_items',
        'invoice_items',
        'product_variant_rate_history',
      ];

      // Get parent product ID before deleting
      const vRow = db.prepare('SELECT product_id FROM product_variants WHERE id = ?').get(id) as { product_id: number } | undefined;
      const parentProductId = vRow?.product_id;

      for (const t of tables) {
        try {
          db.prepare(`DELETE FROM ${t} WHERE product_variant_id = ?`).run(id);
        } catch (e) {
          try {
            db.prepare(`DELETE FROM ${t} WHERE variant_id = ?`).run(id);
          } catch (e2) {}
        }
      }
      try {
        db.prepare('DELETE FROM sales_returns WHERE replacement_variant_id = ?').run(id);
      } catch (e) {}

      db.prepare('DELETE FROM product_variants WHERE id = ?').run(id);

      // If parent product has no more variants, remove parent product cleanly
      if (parentProductId) {
        const remaining = db.prepare('SELECT COUNT(*) as cnt FROM product_variants WHERE product_id = ?').get(parentProductId) as { cnt: number };
        if (remaining.cnt === 0) {
          try { db.prepare('DELETE FROM product_tracking_change_log WHERE product_id = ?').run(parentProductId); } catch (e) {}
          try { db.prepare('DELETE FROM inventory_ledger WHERE product_id = ?').run(parentProductId); } catch (e) {}
          try { db.prepare('DELETE FROM customer_intelligence_cache WHERE product_id = ?').run(parentProductId); } catch (e) {}
          db.prepare('DELETE FROM products WHERE id = ?').run(parentProductId);
        }
      }
    });
    deleteTx();
  },

  syncVariantCostCache(variantId: number): void {
    // 1. Calculate current_stock (grams or units)
    const activeQtyRow = db.prepare(`
      SELECT 
        SUM(COALESCE(current_quantity_grams, 0)) as total_grams,
        SUM(COALESCE(current_quantity_units, 0)) as total_units
      FROM product_stock_batches
      WHERE product_variant_id = ? AND status = 'active'
    `).get(variantId) as { total_grams: number | null; total_units: number | null } | undefined;

    const variant = db.prepare(`
      SELECT p.unit_type, pv.cost_price_paise_per_unit 
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE pv.id = ?
    `).get(variantId) as { unit_type: 'weight' | 'piece', cost_price_paise_per_unit: number } | undefined;
    if (!variant) return;

    const isWeight = variant.unit_type === 'weight';
    const currentStock = isWeight ? (activeQtyRow?.total_grams ?? 0) : (activeQtyRow?.total_units ?? 0);

    // 2. last_purchase_cost: unit_cost_paise of the most recent batch or purchase
    const lastPurchaseRow = db.prepare(`
      SELECT unit_cost_paise
      FROM product_stock_batches
      WHERE product_variant_id = ? AND source_type = 'purchase'
      ORDER BY received_date DESC, id DESC
      LIMIT 1
    `).get(variantId) as { unit_cost_paise: number } | undefined;
    const lastPurchaseCost = lastPurchaseRow ? lastPurchaseRow.unit_cost_paise : variant.cost_price_paise_per_unit;

    // 3. weighted_average_cost: Weighted average cost from purchase history. Fall back to cost_price_paise_per_unit
    const avgCostRow = db.prepare(`
      SELECT 
        SUM(unit_cost_paise * (COALESCE(initial_quantity_grams, 0) + COALESCE(initial_quantity_units, 0))) as total_cost,
        SUM(COALESCE(initial_quantity_grams, 0) + COALESCE(initial_quantity_units, 0)) as total_qty
      FROM product_stock_batches
      WHERE product_variant_id = ?
    `).get(variantId) as { total_cost: number | null; total_qty: number | null } | undefined;

    let weightedAverageCost = variant.cost_price_paise_per_unit;
    if (avgCostRow && avgCostRow.total_qty && avgCostRow.total_qty > 0) {
      weightedAverageCost = Math.round((avgCostRow.total_cost ?? 0) / avgCostRow.total_qty);
    }

    // 4. fifo_current_cost: Cost of the oldest remaining active batch (FIFO current cost)
    const oldestActiveRow = db.prepare(`
      SELECT unit_cost_paise
      FROM product_stock_batches
      WHERE product_variant_id = ? AND status = 'active'
      ORDER BY received_date ASC, id ASC
      LIMIT 1
    `).get(variantId) as { unit_cost_paise: number } | undefined;
    const fifoCurrentCost = oldestActiveRow ? oldestActiveRow.unit_cost_paise : (weightedAverageCost || variant.cost_price_paise_per_unit);

    // 5. inventory_value:
    // For weight: (currentStock * weightedAverageCost) / 1000
    // For piece: currentStock * weightedAverageCost
    const inventoryValue = isWeight 
      ? Math.round((currentStock * weightedAverageCost) / 1000)
      : currentStock * weightedAverageCost;

    // 6. Update database row
    db.prepare(`
      UPDATE product_variants
      SET 
        current_stock = ?,
        last_purchase_cost = ?,
        weighted_average_cost = ?,
        fifo_current_cost = ?,
        inventory_value = ?
      WHERE id = ?
    `).run(currentStock, lastPurchaseCost, weightedAverageCost, fifoCurrentCost, inventoryValue, variantId);
  },
};

export { productVariantsRepository };

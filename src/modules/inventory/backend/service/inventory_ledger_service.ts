// src/modules/inventory/backend/service/inventory_ledger_service.ts
// Single Source of Truth Inventory Ledger & Movement Engine for MeatPOS

import { db, dbManager } from '../../../../core/backend/db';
import { ValidationError, NotFoundError } from '../../../../core/backend/errors';
import { logger, auditLogger } from '../../../../core/backend/logger';

export type InventoryActionType = 
  | 'PURCHASE'
  | 'SALE'
  | 'SALE_RETURN'
  | 'STOCK_ADJUSTMENT'
  | 'TRANSFER'
  | 'TRANSFER_RETURN'
  | 'WASTAGE'
  | 'DAMAGE'
  | 'PHYSICAL_COUNT_ADJUSTMENT'
  | 'FRIDGE_OUT'
  | 'FRIDGE_RETURN'
  | 'OTHER_IN'
  | 'OTHER_OUT'
  // Legacy compatibility:
  | 'purchase'
  | 'sale'
  | 'return'
  | 'transfer_out'
  | 'transfer_in'
  | 'yield_in'
  | 'yield_out'
  | 'audit_adjustment'
  | 'wastage'
  | 'fridge_removal'
  | 'fridge_deposit';

export interface InventoryLedgerEntryInput {
  product_variant_id: number;
  product_id?: number;
  branch_id?: number;
  action_type: InventoryActionType;
  quantity_grams?: number | null;
  quantity_units?: number | null;
  unit_cost_paise?: number;
  batch_id?: number | null;
  source_location_id?: number | null;
  destination_location_id?: number | null;
  reference_type?: 'purchase' | 'invoice' | 'stock_transfer' | 'yield_batch' | 'stock_adjustment' | 'manual' | string;
  reference_id?: number | null;
  reference_number?: string | null;
  reason_code?: string | null;
  notes?: string | null;
  created_by?: number | null;
}

export interface InventoryLedgerActivityFilter {
  startDate?: string;
  endDate?: string;
  productVariantIds?: number[];
  actionTypes?: string[];
  branchId?: number;
  limit?: number;
  offset?: number;
}

export class InventoryLedgerService {
  /**
   * Single atomic entry point for ALL stock movements in the system.
   * Atomically:
   * 1. Validates product & eligibility (is_inventory_tracked)
   * 2. Determines exact signed delta based on canonical movement type
   * 3. Calculates new running balance
   * 4. Appends audit log to inventory_ledger
   * 5. Synchronizes stock_ledger current balance
   * 6. Creates/updates product_stock_batches for FIFO and aging tracking
   */
  public recordMovement(input: InventoryLedgerEntryInput): {
    ledger_id: number;
    running_balance_grams: number | null;
    running_balance_units: number | null;
    delta_grams: number | null;
    delta_units: number | null;
  } {
    const branchId = input.branch_id || 1;
    const variantId = input.product_variant_id;

    const variant = db.prepare(`
      SELECT pv.*, p.id as prod_id, p.name as prod_name, p.unit_type, p.is_inventory_tracked, p.category
      FROM product_variants pv 
      JOIN products p ON pv.product_id = p.id 
      WHERE pv.id = ?
    `).get(variantId) as any;

    if (!variant) {
      throw new NotFoundError(`Cannot record inventory movement: variant #${variantId} not found`);
    }

    const isWeight = variant.unit_type === 'weight' || variant.unit_type === 'live_dual';
    const isTracked = variant.is_inventory_tracked !== 0;

    // Determine current balance from stock_ledger
    let currentGrams = 0;
    let currentUnits = 0;

    const stockRow = db.prepare(`
      SELECT quantity_grams, quantity_units 
      FROM stock_ledger 
      WHERE product_variant_id = ? AND (location_id = ? OR location_id IS NULL)
      LIMIT 1
    `).get(variantId, branchId) as any;

    if (stockRow) {
      currentGrams = stockRow.quantity_grams ?? 0;
      currentUnits = stockRow.quantity_units ?? 0;
    }

    // Determine signed delta based on canonical action type
    const actionNormalized = input.action_type.toUpperCase();
    let deltaGrams: number | null = null;
    let deltaUnits: number | null = null;

    const rawGrams = input.quantity_grams !== undefined && input.quantity_grams !== null ? input.quantity_grams : null;
    const rawUnits = input.quantity_units !== undefined && input.quantity_units !== null ? input.quantity_units : null;

    if (isWeight && rawGrams !== null) {
      if (['PURCHASE', 'TRANSFER_IN', 'YIELD_IN', 'OTHER_IN', 'FRIDGE_RETURN'].includes(actionNormalized)) {
        deltaGrams = Math.abs(rawGrams);
      } else if (['SALE', 'TRANSFER_OUT', 'TRANSFER', 'YIELD_OUT', 'WASTAGE', 'DAMAGE', 'FRIDGE_OUT', 'OTHER_OUT'].includes(actionNormalized)) {
        deltaGrams = -Math.abs(rawGrams);
      } else if (['SALE_RETURN', 'RETURN'].includes(actionNormalized)) {
        // Return is an inflow if restored
        deltaGrams = Math.abs(rawGrams);
      } else {
        // Explicit adjustment or physical count adjustment uses the signed value provided
        deltaGrams = rawGrams;
      }
    } else if (!isWeight && rawUnits !== null) {
      if (['PURCHASE', 'TRANSFER_IN', 'YIELD_IN', 'OTHER_IN', 'FRIDGE_RETURN'].includes(actionNormalized)) {
        deltaUnits = Math.abs(rawUnits);
      } else if (['SALE', 'TRANSFER_OUT', 'TRANSFER', 'YIELD_OUT', 'WASTAGE', 'DAMAGE', 'FRIDGE_OUT', 'OTHER_OUT'].includes(actionNormalized)) {
        deltaUnits = -Math.abs(rawUnits);
      } else if (['SALE_RETURN', 'RETURN'].includes(actionNormalized)) {
        deltaUnits = Math.abs(rawUnits);
      } else {
        deltaUnits = rawUnits;
      }
    }

    // Compute new running balance
    const newRunningGrams = isWeight ? (currentGrams + (deltaGrams || 0)) : null;
    const newRunningUnits = !isWeight ? (currentUnits + (deltaUnits || 0)) : null;

    // Determine unit cost
    let unitCostPaise = input.unit_cost_paise ?? 0;
    if (unitCostPaise <= 0) {
      unitCostPaise = variant.last_purchase_cost_paise || variant.unit_cost_paise_cache || variant.cost_price_paise_per_unit || variant.current_rate_paise_per_unit || 0;
    }

    // 1. Insert into inventory_ledger
    const insertStmt = db.prepare(`
      INSERT INTO inventory_ledger (
        product_variant_id, product_id, branch_id, action_type,
        quantity_grams, quantity_units,
        running_balance_grams, running_balance_units,
        unit_cost_paise, batch_id, source_location_id, destination_location_id,
        reference_type, reference_id, reference_number, reason_code,
        notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const res = insertStmt.run(
      variantId,
      variant.prod_id,
      branchId,
      input.action_type,
      deltaGrams,
      deltaUnits,
      newRunningGrams,
      newRunningUnits,
      unitCostPaise,
      input.batch_id || null,
      input.source_location_id || null,
      input.destination_location_id || null,
      input.reference_type || null,
      input.reference_id || null,
      input.reference_number || null,
      input.reason_code || null,
      input.notes || null,
      input.created_by || 1
    );

    const ledgerId = Number(res.lastInsertRowid);

    // 2. Synchronize stock_ledger (Single Source of Truth Balance)
    if (stockRow) {
      db.prepare(`
        UPDATE stock_ledger SET
          quantity_grams = ?,
          quantity_units = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE product_variant_id = ? AND (location_id = ? OR location_id IS NULL)
      `).run(newRunningGrams, newRunningUnits, variantId, branchId);
    } else {
      db.prepare(`
        INSERT INTO stock_ledger (
          product_variant_id, quantity_grams, quantity_units, location_id,
          safety_threshold_grams, safety_threshold_units, updated_at
        ) VALUES (?, ?, ?, ?, 5000, 10, CURRENT_TIMESTAMP)
      `).run(variantId, newRunningGrams, newRunningUnits, branchId);
    }

    // 3. FIFO & Batch Synchronization for Purchases
    if (['PURCHASE', 'purchase'].includes(input.action_type)) {
      const batchQtyGrams = isWeight ? Math.abs(rawGrams || 0) : null;
      const batchQtyUnits = !isWeight ? Math.abs(rawUnits || 0) : null;
      const cleanDate = new Date().toISOString().slice(0, 10).replace(/[^0-9]/g, '');
      const batchNumber = `BAT-PUR-${cleanDate}-${ledgerId}`;

      try {
        db.prepare(`
          INSERT INTO product_stock_batches (
            batch_number, product_variant_id, received_date, original_batch_date,
            initial_quantity_grams, initial_quantity_units,
            current_quantity_grams, current_quantity_units,
            unit_cost_paise, source_type, source_ref_id, status, location_id
          ) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, 'purchase', ?, 'active', ?)
        `).run(
          batchNumber,
          variantId,
          batchQtyGrams,
          batchQtyUnits,
          batchQtyGrams,
          batchQtyUnits,
          unitCostPaise,
          input.reference_id || ledgerId,
          branchId
        );

        // Update product_variants unit cost cache and last purchase cost
        db.prepare(`
          UPDATE product_variants SET
            last_purchase_cost = ?,
            unit_cost_paise_cache = ?,
            last_purchase_cost_paise = ?,
            cost_price_paise_per_unit = CASE WHEN cost_price_paise_per_unit <= 0 THEN ? ELSE cost_price_paise_per_unit END
          WHERE id = ?
        `).run(unitCostPaise, unitCostPaise, unitCostPaise, unitCostPaise, variantId);
      } catch (e: any) {
        logger.warn(`Batch creation notice for variant #${variantId}: ${e.message}`);
      }
    }

    return {
      ledger_id: ledgerId,
      running_balance_grams: newRunningGrams,
      running_balance_units: newRunningUnits,
      delta_grams: deltaGrams,
      delta_units: deltaUnits,
    };
  }

  /**
   * Recalculates and enforces canonical Current Stock directly from the full movement ledger:
   * Current Stock = Opening Stock + Purchases + Valid Returns In + Transfers In + Other In
   *                 - Sales - Wastage - Transfers Out - Other Out ± Adjustments
   */
  public recalculateStockFromLedger(productVariantId: number, branchId: number = 1): {
    calculated_grams: number | null;
    calculated_units: number | null;
    synced: boolean;
  } {
    const variant = db.prepare('SELECT pv.*, p.unit_type FROM product_variants pv JOIN products p ON pv.product_id = p.id WHERE pv.id = ?').get(productVariantId) as any;
    if (!variant) throw new NotFoundError('Variant not found');

    const isWeight = variant.unit_type === 'weight' || variant.unit_type === 'live_dual';

    const sumRow = db.prepare(`
      SELECT 
        SUM(COALESCE(quantity_grams, 0)) as sum_grams,
        SUM(COALESCE(quantity_units, 0)) as sum_units
      FROM inventory_ledger
      WHERE product_variant_id = ? AND branch_id = ?
    `).get(productVariantId, branchId) as any;

    const calcGrams = isWeight ? (sumRow?.sum_grams ?? 0) : null;
    const calcUnits = !isWeight ? (sumRow?.sum_units ?? 0) : null;

    // Check against stock_ledger
    const existing = db.prepare('SELECT quantity_grams, quantity_units FROM stock_ledger WHERE product_variant_id = ? AND (location_id = ? OR location_id IS NULL)').get(productVariantId, branchId) as any;
    const synced = existing && (
      (isWeight && existing.quantity_grams === calcGrams) ||
      (!isWeight && existing.quantity_units === calcUnits)
    );

    if (!synced) {
      if (existing) {
        db.prepare('UPDATE stock_ledger SET quantity_grams = ?, quantity_units = ?, updated_at = CURRENT_TIMESTAMP WHERE product_variant_id = ? AND (location_id = ? OR location_id IS NULL)')
          .run(calcGrams, calcUnits, productVariantId, branchId);
      } else {
        db.prepare('INSERT INTO stock_ledger (product_variant_id, quantity_grams, quantity_units, location_id, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)')
          .run(productVariantId, calcGrams, calcUnits, branchId);
      }
    }

    return {
      calculated_grams: calcGrams,
      calculated_units: calcUnits,
      synced: !synced,
    };
  }

  /**
   * Compatibility wrapper for recordEntry
   */
  public recordEntry(input: InventoryLedgerEntryInput): number {
    const res = this.recordMovement(input);
    return res.ledger_id;
  }

  /**
   * Get activity log with comprehensive filtering for the Inventory Stock Report
   */
  public getActivityLog(filters: InventoryLedgerActivityFilter) {
    const { assertValidDateRange } = require('../../../../core/utils/date_validation');
    assertValidDateRange(filters.startDate, filters.endDate);

    let sql = `
      SELECT 
        il.*,
        pv.variant_name,
        p.name as product_name,
        p.unit_type,
        b.name as branch_name,
        b.code as branch_code,
        u.full_name as created_by_name
      FROM inventory_ledger il
      JOIN product_variants pv ON pv.id = il.product_variant_id
      JOIN products p ON p.id = pv.product_id
      LEFT JOIN branches b ON b.id = il.branch_id
      LEFT JOIN users u ON u.id = il.created_by
      WHERE 1=1
    `;

    const params: any[] = [];

    if (filters.startDate) {
      sql += ' AND date(il.created_at) >= date(?)';
      params.push(filters.startDate.slice(0, 10));
    }
    if (filters.endDate) {
      sql += ' AND date(il.created_at) <= date(?)';
      params.push(filters.endDate.slice(0, 10));
    }
    if (filters.productVariantIds && filters.productVariantIds.length > 0) {
      const placeholders = filters.productVariantIds.map(() => '?').join(',');
      sql += ` AND il.product_variant_id IN (${placeholders})`;
      params.push(...filters.productVariantIds);
    }
    if (filters.actionTypes && filters.actionTypes.length > 0) {
      const placeholders = filters.actionTypes.map(() => '?').join(',');
      sql += ` AND UPPER(il.action_type) IN (${placeholders.toUpperCase()})`;
      params.push(...filters.actionTypes.map(a => a.toUpperCase()));
    }
    if (filters.branchId) {
      sql += ' AND il.branch_id = ?';
      params.push(filters.branchId);
    }

    sql += ' ORDER BY il.created_at DESC, il.id DESC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
      if (filters.offset) {
        sql += ' OFFSET ?';
        params.push(filters.offset);
      }
    }

    const rows = db.prepare(sql).all(...params) as any[];

    return rows.map(row => {
      const isWeight = row.unit_type === 'weight' || row.unit_type === 'live_dual';
      const qty = isWeight 
        ? (row.quantity_grams !== null ? row.quantity_grams / 1000 : null)
        : row.quantity_units;

      const balance = isWeight
        ? (row.running_balance_grams !== null ? row.running_balance_grams / 1000 : 0)
        : (row.running_balance_units ?? 0);

      return {
        ...row,
        is_weight: isWeight,
        quantity_display: qty,
        running_balance_display: balance,
        unit_label: isWeight ? 'kg' : 'pcs'
      };
    });
  }

  /**
   * Get Live Product Stock Valuation Report across all inventory-tracked products
   */
  public getValuationReport(filters: {
    startDate?: string;
    endDate?: string;
    productVariantIds?: number[];
    branchId?: number;
  }) {
    let sql = `
      SELECT 
        pv.id as variant_id,
        pv.variant_name,
        pv.product_code,
        pv.current_rate_paise_per_unit as selling_price_paise,
        COALESCE(
          (SELECT unit_cost_paise FROM product_stock_batches WHERE product_variant_id = pv.id AND status = 'active' ORDER BY received_date DESC, id DESC LIMIT 1),
          pv.last_purchase_cost_paise,
          pv.unit_cost_paise_cache,
          pv.last_purchase_cost,
          pv.cost_price_paise_per_unit,
          pv.current_rate_paise_per_unit,
          0
        ) as buying_cost_paise,
        p.id as product_id,
        p.name as product_name,
        p.category,
        p.unit_type,
        p.stock_classification,
        COALESCE(sl.quantity_grams, 0) as quantity_grams,
        COALESCE(sl.quantity_units, 0) as quantity_units
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      LEFT JOIN stock_ledger sl ON sl.product_variant_id = pv.id
      WHERE pv.is_active = 1 AND p.is_active = 1 AND p.is_inventory_tracked = 1
    `;

    const params: any[] = [];

    if (filters.productVariantIds && filters.productVariantIds.length > 0) {
      const placeholders = filters.productVariantIds.map(() => '?').join(',');
      sql += ` AND pv.id IN (${placeholders})`;
      params.push(...filters.productVariantIds);
    }

    sql += ' ORDER BY p.category ASC, p.name ASC, pv.variant_name ASC';

    const rawVariants = db.prepare(sql).all(...params) as any[];

    let grandTotalBuyingPaise = 0;
    let grandTotalSellingPaise = 0;
    let grandTotalPotentialProfitPaise = 0;

    const items = rawVariants.map(v => {
      const isWeight = v.unit_type === 'weight' || v.unit_type === 'live_dual';
      const qtyNumber = isWeight ? (v.quantity_grams / 1000) : v.quantity_units;

      const buyingCostPaise = v.buying_cost_paise || 0;
      const sellingPricePaise = v.selling_price_paise || 0;

      const totalBuyingPaise = Math.round(qtyNumber * buyingCostPaise);
      const totalSellingPaise = Math.round(qtyNumber * sellingPricePaise);
      const potentialProfitPaise = totalSellingPaise - totalBuyingPaise;

      grandTotalBuyingPaise += totalBuyingPaise;
      grandTotalSellingPaise += totalSellingPaise;
      grandTotalPotentialProfitPaise += potentialProfitPaise;

      return {
        variant_id: v.variant_id,
        product_id: v.product_id,
        product_name: v.product_name,
        variant_name: v.variant_name,
        product_code: v.product_code,
        category: v.category,
        unit_type: v.unit_type,
        stock_classification: v.stock_classification,
        is_weight: isWeight,
        quantity: qtyNumber,
        unit_label: isWeight ? 'kg' : 'pcs',
        buying_cost_paise: buyingCostPaise,
        selling_price_paise: sellingPricePaise,
        total_buying_paise: totalBuyingPaise,
        total_selling_paise: totalSellingPaise,
        potential_profit_paise: potentialProfitPaise,
      };
    });

    return {
      items,
      summary: {
        itemCount: items.length,
        totalBuyingValuePaise: grandTotalBuyingPaise,
        totalPotentialSellingValuePaise: grandTotalSellingPaise,
        potentialProfitPaise: grandTotalPotentialProfitPaise,
        profitMarginPercent: grandTotalSellingPaise > 0 
          ? Number(((grandTotalPotentialProfitPaise / grandTotalSellingPaise) * 100).toFixed(2))
          : 0,
      }
    };
  }
}

export const inventoryLedgerService = new InventoryLedgerService();

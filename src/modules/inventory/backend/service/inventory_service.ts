import { ValidationError, NotFoundError } from '../../../../core/backend/errors';
import { logger, auditLogger } from '../../../../core/backend/logger';
import { db, dbManager } from '../../../../core/backend/db';
import { AdjustStockSchema } from '../validation/inventory.schema';
import { CreatePurchaseSchema } from '../validation/purchase.schema';
import { authService } from '../../../auth/backend/service/auth_service';
import { inventoryLedgerService } from './inventory_ledger_service';
import { assertValidDateRange } from '../../../../core/utils/date_validation';
import {
  IInventoryRepository,
  ISupplierRepository,
  IPurchaseRepository,
  IUserRepository,
  SupplierRow,
  PurchaseRow,
  PurchaseDetailRow,
  StockStatusRow,
  StockTransactionDetailRow,
  StockAdjustmentDetailRow
} from '../../../../core/database/repositories/repository_interfaces';

export class InventoryService {
  constructor(
    private inventoryRepo: IInventoryRepository,
    private supplierRepo: ISupplierRepository,
    private purchaseRepo: IPurchaseRepository,
    private userRepo: IUserRepository
  ) {}

  public processPendingEvents(): void {
    // Run all events inside a database transaction sequence
    dbManager.transaction(() => {
      const events = this.inventoryRepo.findPendingEvents();

      if (events.length === 0) {
        return;
      }

      logger.info(`Processing ${events.length} pending stock events...`);

      for (const event of events) {
        const isDeduction = event.event_type === 'sale_pending_deduction';
        const multiplier = isDeduction ? -1 : 1;

        const deltaGrams = event.quantity_grams !== null ? event.quantity_grams * multiplier : null;
        const deltaUnits = event.quantity_units !== null ? event.quantity_units * multiplier : null;

        // Update the running balance in the ledger
        this.inventoryRepo.updateLedgerStock(event.product_variant_id, deltaGrams, deltaUnits);

        // Record a transaction history entry
        this.inventoryRepo.createTransaction({
          product_variant_id: event.product_variant_id,
          transaction_type: isDeduction ? 'sale_deduction' : 'sale_reversal',
          quantity_grams: deltaGrams,
          quantity_units: deltaUnits,
          reference_id: event.invoice_id,
        });

        // Delete the processed event
        this.inventoryRepo.deletePendingEvent(event.id);
      }

      logger.info('Successfully processed pending stock events and updated stock ledger.');
    });
  }

  public adjustStock(input: {
    product_variant_id: number;
    adjustment_type: 'stock_in' | 'stock_out' | 'wastage' | 'damage';
    quantity_grams: number | null;
    quantity_units: number | null;
    reason: string;
    adjusted_by?: number;
  }): void {
    const userId = input.adjusted_by ?? authService.getCurrentUserId();
    const parsed = AdjustStockSchema.safeParse({
      adjusted_by: userId,
      ...input,
    });

    if (!parsed.success) {
      throw new ValidationError('Invalid stock adjustment input', parsed.error.flatten());
    }



    dbManager.transaction(() => {
      // 1. Create stock adjustment record
      const adjustment = this.inventoryRepo.createAdjustment({
        product_variant_id: parsed.data.product_variant_id,
        adjustment_type: parsed.data.adjustment_type,
        quantity_grams: parsed.data.quantity_grams ?? null,
        quantity_units: parsed.data.quantity_units ?? null,
        reason: parsed.data.reason,
        adjusted_by: parsed.data.adjusted_by,
      });

      // 2. Calculate stock change delta
      // stock_in adds (+1), all others subtract (-1)
      const isAddition = parsed.data.adjustment_type === 'stock_in';
      const multiplier = isAddition ? 1 : -1;

      const deltaGrams = parsed.data.quantity_grams !== null && parsed.data.quantity_grams !== undefined
        ? parsed.data.quantity_grams * multiplier 
        : null;

      const deltaUnits = parsed.data.quantity_units !== null && parsed.data.quantity_units !== undefined
        ? parsed.data.quantity_units * multiplier 
        : null;

      // 3. Create stock transaction record
      this.inventoryRepo.createTransaction({
        product_variant_id: parsed.data.product_variant_id,
        transaction_type: 'manual_adjustment',
        quantity_grams: deltaGrams,
        quantity_units: deltaUnits,
        reference_id: adjustment.id,
      });

      // 5. Add audit log record
      auditLogger.log(
        parsed.data.adjusted_by,
        'STOCK_ADJUSTMENT_CREATED',
        {
          adjustment_type: parsed.data.adjustment_type,
          variant_id: parsed.data.product_variant_id,
          reason: parsed.data.reason
        }
      );

      // 6. Record to unified inventory_ledger
      const { inventoryLedgerService } = require('./inventory_ledger_service');
      const actionType = (parsed.data.adjustment_type === 'damage' || parsed.data.adjustment_type === 'wastage') 
        ? 'wastage' 
        : 'audit_adjustment';

      inventoryLedgerService.recordEntry({
        product_variant_id: parsed.data.product_variant_id,
        branch_id: 1,
        action_type: actionType,
        quantity_grams: deltaGrams,
        quantity_units: deltaUnits,
        reference_type: 'stock_adjustment',
        reference_id: adjustment.id,
        reference_number: `ADJ-${adjustment.id}`,
        notes: `${parsed.data.adjustment_type.toUpperCase()}: ${parsed.data.reason}`,
        created_by: parsed.data.adjusted_by,
      });

      logger.info('Logged manual stock adjustment and updated ledger', {
        adjustmentId: adjustment.id,
        variantId: parsed.data.product_variant_id,
        type: parsed.data.adjustment_type,
      });
    });
  }

  public getIndicators(): Record<number, { lastIn: { date: string; qty: string } | null, lastOut: { date: string; qty: string } | null }> {
    return this.inventoryRepo.getLastInOutIndicators();
  }

  public listSuppliers(): SupplierRow[] {
    return this.supplierRepo.findAll();
  }

  public createSupplier(input: { name: string; contact?: string | null }): SupplierRow {
    authService.requireRole(['ADMIN', 'MANAGER']);
    if (!input.name?.trim()) {
      throw new ValidationError('Supplier name is required');
    }
    return this.supplierRepo.create(input);
  }

  public recordPurchase(input: {
    supplier_id: number;
    product_variant_id: number;
    quantity_grams: number | null;
    quantity_units: number | null;
    cost_paise: number;
    created_by?: number;
  }): PurchaseRow {
    const userId = input.created_by ?? authService.getCurrentUserId();
    const parsed = CreatePurchaseSchema.safeParse({
      created_by: userId,
      ...input,
    });

    if (!parsed.success) {
      throw new ValidationError('Invalid purchase input', parsed.error.flatten());
    }

    return dbManager.transaction(() => {
      // 1. Verify supplier exists
      this.supplierRepo.findById(parsed.data.supplier_id);

      // 2. Record purchase record
      const purchase = this.purchaseRepo.create({
        supplier_id: parsed.data.supplier_id,
        product_variant_id: parsed.data.product_variant_id,
        quantity_grams: parsed.data.quantity_grams ?? null,
        quantity_units: parsed.data.quantity_units ?? null,
        cost_paise: parsed.data.cost_paise,
        created_by: parsed.data.created_by,
      });

      // 3. Add audit logs record
      auditLogger.log(
        parsed.data.created_by,
        'PURCHASE_RECORDED',
        {
          purchase_id: purchase.id,
          supplier_id: parsed.data.supplier_id,
          variant_id: parsed.data.product_variant_id,
          cost_paise: parsed.data.cost_paise,
        }
      );

      // 4. Record to unified inventory ledger, synchronize stock_ledger, and create active FIFO batch
      const { inventoryLedgerService } = require('./inventory_ledger_service');
      inventoryLedgerService.recordMovement({
        product_variant_id: parsed.data.product_variant_id,
        branch_id: 1,
        action_type: 'PURCHASE',
        quantity_grams: parsed.data.quantity_grams ?? null,
        quantity_units: parsed.data.quantity_units ?? null,
        unit_cost_paise: parsed.data.cost_paise,
        reference_type: 'purchase',
        reference_id: purchase.id,
        reference_number: `PUR-${purchase.id}`,
        reason_code: 'unrecorded_purchase',
        notes: `Purchase from Supplier #${parsed.data.supplier_id}`,
        created_by: parsed.data.created_by,
      });

      // 5. If live chicken, also record in live_chicken_batches for yield/mortality tracking
      try {
        const variantRow = db.prepare(`
          SELECT pv.*, p.category, p.name as product_name, p.stock_classification 
          FROM product_variants pv 
          JOIN products p ON pv.product_id = p.id 
          WHERE pv.id = ?
        `).get(parsed.data.product_variant_id) as any;

        const isLiveChicken = (variantRow?.unit_type === 'live_dual' || variantRow?.stock_classification === 'live_yield') &&
          (variantRow?.category?.toLowerCase().includes('chicken') || variantRow?.product_name?.toLowerCase().includes('chicken'));

        if (isLiveChicken) {
          const liveWeightGrams = parsed.data.quantity_grams ?? 0;
          const countVal = Math.max(1, Math.round((liveWeightGrams || 1600) / 1600));
          const cleanDate = new Date().toISOString().slice(0, 10).replace(/[^0-9]/g, '');
          const countRow = db.prepare('SELECT COUNT(*) as cnt FROM live_chicken_batches').get() as { cnt: number };
          const seq = String((countRow?.cnt || 0) + 1).padStart(4, '0');
          const batchNum = `BAT-LIVE-${cleanDate}-${seq}`;

          db.prepare(`
            INSERT INTO live_chicken_batches (
              batch_number, supplier_id, purchase_date,
              cost_per_kg_paise, initial_weight_grams, initial_count,
              remaining_weight_grams, remaining_count, status, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
          `).run(
            batchNum,
            parsed.data.supplier_id,
            new Date().toISOString().slice(0, 10),
            parsed.data.cost_paise,
            liveWeightGrams,
            countVal,
            liveWeightGrams,
            countVal,
            `Direct Purchase #${purchase.id}`
          );
        }
      } catch (e: any) {
        logger.warn(`Live chicken batch tracking notice on purchase: ${e.message}`);
      }

      logger.info('Purchase transaction recorded and stock updated', {
        purchaseId: purchase.id,
        variantId: parsed.data.product_variant_id,
      });

      return purchase;
    });
  }

  public listPurchases(): PurchaseDetailRow[] {
    return this.purchaseRepo.findAll();
  }

  public getStockStatus(): StockStatusRow[] {
    return this.inventoryRepo.findAllLedger();
  }

  public getLowStockAlerts(): StockStatusRow[] {
    return this.inventoryRepo.getLowStock();
  }

  public getTransactionHistory(limit = 100): StockTransactionDetailRow[] {
    return this.inventoryRepo.findAllTransactions(limit);
  }

  public getAdjustmentsHistory(limit = 100): StockAdjustmentDetailRow[] {
    return this.inventoryRepo.findAllAdjustments(limit);
  }

  public submitPhysicalStockCount(counts: Array<{ product_variant_id: number; counted_quantity: number; reason_code?: string }>): { adjustedCount: number; timestamp: string } {
    authService.requireRole(['ADMIN', 'MANAGER', 'CASHIER']);
    const { physicalAuditService } = require('./physical_audit_service');
    const { session_id } = physicalAuditService.createSession({ notes: 'Physical Stock Count from POS' });
    physicalAuditService.saveCounts(session_id, counts.map(c => ({
      product_variant_id: c.product_variant_id,
      counted_quantity: c.counted_quantity,
      reason_code: (c.reason_code as any) || 'measurement_error',
    })));
    physicalAuditService.submitSession(session_id);
    physicalAuditService.approveSession(session_id);
    return physicalAuditService.applySession(session_id);
  }

  public getLastPhysicalCountAt(): string | null {
    const { stockLedgerRepository } = require('../repository/stock_ledger_repository');
    return stockLedgerRepository.getMetadata('last_physical_count_at');
  }

  public getSidebarSummary(): any {
    const { stockLedgerRepository } = require('../repository/stock_ledger_repository');
    return stockLedgerRepository.getSidebarSummary();
  }

  public logLivestockLoss(input: { product_variant_id: number; quantity: number; notes?: string }, userId: number) {
    const variant = db.prepare(`
      SELECT pv.*, p.unit_type 
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE pv.id = ?
    `).get(input.product_variant_id) as any;
    if (!variant) throw new ValidationError('Product variant not found');

    const isWeight = variant.unit_type === 'weight';
    const grams = isWeight ? Math.round(input.quantity * 1000) : null;
    const units = !isWeight ? Math.round(input.quantity) : null;

    return dbManager.transaction(() => {
      const { fifoService } = require('./fifo_service');
      const fifoRes = fifoService.drawdownFifo(input.product_variant_id, grams, units);

      db.prepare(`
        INSERT INTO stock_adjustments (
          product_variant_id, adjustment_type, quantity_grams, quantity_units,
          reason, adjusted_by
        ) VALUES (?, 'wastage', ?, ?, ?, ?)
      `).run(
        input.product_variant_id,
        grams,
        units,
        input.notes?.trim() || 'Livestock Loss (Dead Stock)',
        userId
      );

      auditLogger.log(userId, 'LIVESTOCK_LOSS_LOGGED', {
        product_variant_id: input.product_variant_id,
        quantity: input.quantity,
        cogs_paise: fifoRes.total_cogs_paise
      });

      const { inventoryLedgerService } = require('./inventory_ledger_service');
      inventoryLedgerService.recordEntry({
        product_variant_id: input.product_variant_id,
        branch_id: 1,
        action_type: 'wastage',
        quantity_grams: isWeight ? -grams! : null,
        quantity_units: !isWeight ? -units! : null,
        reference_type: 'stock_adjustment',
        notes: input.notes?.trim() || 'Livestock Loss (Dead Stock)',
        created_by: userId,
      });

      return { success: true, cogs_paise: fifoRes.total_cogs_paise };
    });
  }

  /**
   * Section 1: Stock Valuation Report
   * Per item/variant: current quantity x weighted FIFO batch unit cost across active non-exhausted batches.
   * Items with 0 current stock but active non-exhausted batches flagged as "Recount Needed".
   */
  public getStockValuationReport(filter?: { location_id?: number | string; category?: string }): {
    items: Array<{
      product_variant_id: number;
      product_name: string;
      variant_name: string;
      product_code: string;
      category: string;
      unit_type: 'weight' | 'piece';
      location_id: number;
      location_name: string;
      current_quantity_grams: number | null;
      current_quantity_units: number | null;
      weighted_batch_unit_cost_paise: number;
      total_cost_value_paise: number;
      current_rate_paise_per_unit: number;
      total_selling_value_paise: number;
      gross_potential_margin_paise: number;
      gross_potential_margin_percent: number;
      recount_needed: boolean;
      active_batch_count: number;
    }>;
    categoryTotals: Array<{
      category: string;
      total_cost_value_paise: number;
      total_selling_value_paise: number;
      gross_potential_margin_paise: number;
    }>;
    grandTotals: {
      total_cost_value_paise: number;
      total_selling_value_paise: number;
      gross_potential_margin_paise: number;
      gross_potential_margin_percent: number;
    };
  } {
    let locationClause = '';
    const params: any[] = [];

    if (filter?.location_id && filter.location_id !== 'all') {
      locationClause = 'AND sl.location_id = ?';
      params.push(Number(filter.location_id));
    }

    let categoryClause = '';
    if (filter?.category && filter.category !== 'All') {
      categoryClause = 'AND p.category = ?';
      params.push(filter.category);
    }

    const query = `
      SELECT 
        sl.product_variant_id,
        sl.location_id,
        loc.name as location_name,
        sl.quantity_grams,
        sl.quantity_units,
        p.name as product_name,
        pv.variant_name,
        p.product_code,
        p.category,
        p.unit_type,
        pv.current_rate_paise_per_unit,
        pv.cost_price_paise_per_unit
      FROM stock_ledger sl
      JOIN product_variants pv ON pv.id = sl.product_variant_id
      JOIN products p ON p.id = pv.product_id
      LEFT JOIN locations loc ON loc.id = sl.location_id
      WHERE 1=1 ${locationClause} ${categoryClause} 
      AND p.is_inventory_tracked = 1
      AND p.is_active = 1
      ORDER BY p.category ASC, p.name ASC, pv.variant_name ASC
    `;

    const rows = db.prepare(query).all(...params) as any[];

    const valuationItems: any[] = [];
    const catMap = new Map<string, { cost: number; selling: number; margin: number }>();

    let grandCostPaise = 0;
    let grandSellingPaise = 0;

    for (const r of rows) {
      const isWeight = r.unit_type === 'weight';
      const currentQty = isWeight ? (r.quantity_grams ?? 0) / 1000 : (r.quantity_units ?? 0);

      // Fetch active batches for this variant and location
      let batchQuery = `
        SELECT * FROM product_stock_batches
        WHERE product_variant_id = ? AND status = 'active'
      `;
      const batchParams: any[] = [r.product_variant_id];
      if (filter?.location_id && filter.location_id !== 'all') {
        batchQuery += ' AND location_id = ?';
        batchParams.push(Number(filter.location_id));
      }

      const activeBatches = db.prepare(batchQuery).all(...batchParams) as any[];

      // Calculate weighted average unit cost across active batches
      let totalBatchQtyGrams = 0;
      let totalBatchQtyUnits = 0;
      let totalBatchCostPaise = 0;

      for (const b of activeBatches) {
        if (isWeight) {
          const bg = b.current_quantity_grams ?? 0;
          totalBatchQtyGrams += bg;
          totalBatchCostPaise += Math.round((bg / 1000) * b.unit_cost_paise);
        } else {
          const bu = b.current_quantity_units ?? 0;
          totalBatchQtyUnits += bu;
          totalBatchCostPaise += bu * b.unit_cost_paise;
        }
      }

      let weightedUnitCostPaise = 0;
      if (isWeight && totalBatchQtyGrams > 0) {
        weightedUnitCostPaise = Math.round((totalBatchCostPaise / totalBatchQtyGrams) * 1000);
      } else if (!isWeight && totalBatchQtyUnits > 0) {
        weightedUnitCostPaise = Math.round(totalBatchCostPaise / totalBatchQtyUnits);
      } else {
        // Fallback if no active batch stock
        weightedUnitCostPaise = r.cost_price_paise_per_unit || 0;
        if (weightedUnitCostPaise <= 0) {
          const vRow = db.prepare('SELECT last_purchase_cost_paise, unit_cost_paise_cache, last_purchase_cost, current_rate_paise_per_unit FROM product_variants WHERE id = ?').get(r.product_variant_id) as any;
          if (vRow) {
            weightedUnitCostPaise = vRow.last_purchase_cost_paise || vRow.unit_cost_paise_cache || vRow.last_purchase_cost || Math.round((vRow.current_rate_paise_per_unit || 0) * 0.7);
          }
        }
      }

      // Total monetary cost value
      const totalCostValuePaise = isWeight 
        ? Math.round(( (r.quantity_grams ?? 0) / 1000 ) * weightedUnitCostPaise)
        : Math.round((r.quantity_units ?? 0) * weightedUnitCostPaise);

      // Potential selling value
      const totalSellingValuePaise = isWeight
        ? Math.round(( (r.quantity_grams ?? 0) / 1000 ) * r.current_rate_paise_per_unit)
        : Math.round((r.quantity_units ?? 0) * r.current_rate_paise_per_unit);

      const marginPaise = totalSellingValuePaise - totalCostValuePaise;
      const marginPercent = totalSellingValuePaise > 0 
        ? Math.round((marginPaise / totalSellingValuePaise) * 10000) / 100 
        : 0;

      // Check recount needed flag: current stock is 0 but active non-exhausted batches exist with qty > 0
      const recountNeeded = currentQty <= 0 && activeBatches.length > 0;

      valuationItems.push({
        product_variant_id: r.product_variant_id,
        product_name: r.product_name,
        variant_name: r.variant_name,
        product_code: r.product_code,
        category: r.category,
        unit_type: r.unit_type,
        location_id: r.location_id,
        location_name: r.location_name || 'Main Store',
        current_quantity_grams: r.quantity_grams,
        current_quantity_units: r.quantity_units,
        weighted_batch_unit_cost_paise: weightedUnitCostPaise,
        total_cost_value_paise: Math.max(0, totalCostValuePaise),
        current_rate_paise_per_unit: r.current_rate_paise_per_unit,
        total_selling_value_paise: Math.max(0, totalSellingValuePaise),
        gross_potential_margin_paise: marginPaise,
        gross_potential_margin_percent: marginPercent,
        recount_needed: recountNeeded,
        active_batch_count: activeBatches.length,
      });

      grandCostPaise += currentQty > 0 ? Math.max(0, totalCostValuePaise) : 0;
      grandSellingPaise += currentQty > 0 ? Math.max(0, totalSellingValuePaise) : 0;

      // Category totals accumulator (only include items with actual stock)
      if (!catMap.has(r.category)) {
        catMap.set(r.category, { cost: 0, selling: 0, margin: 0 });
      }
      if (currentQty > 0) {
        const catObj = catMap.get(r.category)!;
        catObj.cost += Math.max(0, totalCostValuePaise);
        catObj.selling += Math.max(0, totalSellingValuePaise);
        catObj.margin += marginPaise;
      }
    }

    const categoryTotals: any[] = [];
    catMap.forEach((val, category) => {
      categoryTotals.push({
        category,
        total_cost_value_paise: val.cost,
        total_selling_value_paise: val.selling,
        gross_potential_margin_paise: val.margin,
      });
    });

    const grandMarginPaise = grandSellingPaise - grandCostPaise;
    const grandMarginPercent = grandSellingPaise > 0 
      ? Math.round((grandMarginPaise / grandSellingPaise) * 10000) / 100
      : 0;

    return {
      items: valuationItems,
      categoryTotals,
      grandTotals: {
        total_cost_value_paise: grandCostPaise,
        total_selling_value_paise: grandSellingPaise,
        gross_potential_margin_paise: grandMarginPaise,
        gross_potential_margin_percent: grandMarginPercent,
      },
    };
  }

  /**
   * Section 2: Stock Movement Report
   * Chronological ledger of all IN (purchase, transfer receipt, return) and OUT (sale, wastage, damage, transfer sent, livestock loss)
   * for selected date range, category, and location. Includes opening balance, net change, closing balance.
   */
  public getStockMovementReport(filter: {
    startDate: string;
    endDate: string;
    location_id?: number | string;
    category?: string;
  }): {
    movements: Array<{
      id: string;
      timestamp: string;
      product_variant_id: number;
      product_name: string;
      variant_name: string;
      category: string;
      unit_type: 'weight' | 'piece';
      movement_type: 'IN' | 'OUT';
      action_kind: string;
      quantity_grams: number | null;
      quantity_units: number | null;
      reference: string;
      user_name?: string;
    }>;
    variantSummaries: Array<{
      product_variant_id: number;
      product_name: string;
      variant_name: string;
      category: string;
      unit_type: 'weight' | 'piece';
      opening_quantity_grams: number | null;
      opening_quantity_units: number | null;
      total_in_grams: number;
      total_in_units: number;
      total_out_grams: number;
      total_out_units: number;
      net_change_grams: number;
      net_change_units: number;
      closing_quantity_grams: number | null;
      closing_quantity_units: number | null;
    }>;
  } {
    assertValidDateRange(filter.startDate, filter.endDate);
    const startDate = filter.startDate;
    const endDate = filter.endDate + ' 23:59:59';

    let locationClause = '';
    const params: any[] = [startDate, endDate];

    if (filter.location_id && filter.location_id !== 'all') {
      locationClause = 'AND stx.location_id = ?';
      params.push(Number(filter.location_id));
    }

    let categoryClause = '';
    if (filter.category && filter.category !== 'All') {
      categoryClause = 'AND p.category = ?';
      params.push(filter.category);
    }

    // Query all stock transactions chronologically
    const query = `
      SELECT 
        stx.id,
        stx.created_at,
        stx.product_variant_id,
        stx.transaction_type,
        stx.quantity_grams,
        stx.quantity_units,
        stx.reference_id,
        p.name as product_name,
        pv.variant_name,
        p.category,
        p.unit_type
      FROM stock_transactions stx
      JOIN product_variants pv ON pv.id = stx.product_variant_id
      JOIN products p ON p.id = pv.product_id
      WHERE stx.created_at >= ? AND stx.created_at <= ?
      ${locationClause} ${categoryClause}
      ORDER BY stx.created_at ASC, stx.id ASC
    `;

    const txRows = db.prepare(query).all(...params) as any[];

    const movements: any[] = [];
    const summaryMap = new Map<number, {
      product_name: string;
      variant_name: string;
      category: string;
      unit_type: 'weight' | 'piece';
      inGrams: number;
      inUnits: number;
      outGrams: number;
      outUnits: number;
    }>();

    for (const r of txRows) {
      const isWeight = r.unit_type === 'weight';
      const g = r.quantity_grams ?? 0;
      const u = r.quantity_units ?? 0;

      const isIN = g > 0 || u > 0;
      const movementType: 'IN' | 'OUT' = isIN ? 'IN' : 'OUT';

      movements.push({
        id: `STX-${r.id}`,
        timestamp: r.created_at,
        product_variant_id: r.product_variant_id,
        product_name: r.product_name,
        variant_name: r.variant_name,
        category: r.category,
        unit_type: r.unit_type,
        movement_type: movementType,
        action_kind: r.transaction_type,
        quantity_grams: r.quantity_grams,
        quantity_units: r.quantity_units,
        reference: r.reference_id ? `#${r.reference_id}` : 'Direct',
      });

      if (!summaryMap.has(r.product_variant_id)) {
        summaryMap.set(r.product_variant_id, {
          product_name: r.product_name,
          variant_name: r.variant_name,
          category: r.category,
          unit_type: r.unit_type,
          inGrams: 0,
          inUnits: 0,
          outGrams: 0,
          outUnits: 0,
        });
      }

      const s = summaryMap.get(r.product_variant_id)!;
      if (isWeight) {
        if (g > 0) s.inGrams += g;
        else s.outGrams += Math.abs(g);
      } else {
        if (u > 0) s.inUnits += u;
        else s.outUnits += Math.abs(u);
      }
    }

    // Build variant summaries with closing and opening stock calculation
    const variantSummaries: any[] = [];
    summaryMap.forEach((val, variantId) => {
      const isWeight = val.unit_type === 'weight';
      const ledgerRow = db.prepare('SELECT quantity_grams, quantity_units FROM stock_ledger WHERE product_variant_id = ?').get(variantId) as any;

      const closingGrams = isWeight ? (ledgerRow?.quantity_grams ?? 0) : null;
      const closingUnits = !isWeight ? (ledgerRow?.quantity_units ?? 0) : null;

      const netChangeGrams = val.inGrams - val.outGrams;
      const netChangeUnits = val.inUnits - val.outUnits;

      const openingGrams = isWeight ? (closingGrams! - netChangeGrams) : null;
      const openingUnits = !isWeight ? (closingUnits! - netChangeUnits) : null;

      variantSummaries.push({
        product_variant_id: variantId,
        product_name: val.product_name,
        variant_name: val.variant_name,
        category: val.category,
        unit_type: val.unit_type,
        opening_quantity_grams: openingGrams,
        opening_quantity_units: openingUnits,
        total_in_grams: val.inGrams,
        total_in_units: val.inUnits,
        total_out_grams: val.outGrams,
        total_out_units: val.outUnits,
        net_change_grams: netChangeGrams,
        net_change_units: netChangeUnits,
        closing_quantity_grams: closingGrams,
        closing_quantity_units: closingUnits,
      });
    });

    return { movements, variantSummaries };
  }

  /**
   * Section 2: Wastage & Loss Report
   * All wastage, damage, livestock-loss, and loss-in-transit entries for a date range, category, and location.
   * Total loss value calculated using stored batch cost at time of wastage.
   */
  public getWastageLossReport(filter: {
    startDate: string;
    endDate: string;
    location_id?: number | string;
    category?: string;
  }): {
    entries: Array<{
      id: number;
      created_at: string;
      product_variant_id: number;
      product_name: string;
      variant_name: string;
      category: string;
      unit_type: 'weight' | 'piece';
      adjustment_type: 'wastage' | 'damage' | 'livestock_loss' | 'loss_in_transit' | string;
      quantity_grams: number | null;
      quantity_units: number | null;
      reason: string;
      unit_cost_paise: number;
      total_loss_value_paise: number;
    }>;
    groupedByType: Array<{
      type: string;
      entry_count: number;
      total_grams: number;
      total_units: number;
      total_loss_value_paise: number;
    }>;
    grandTotalLossPaise: number;
  } {
    assertValidDateRange(filter.startDate, filter.endDate);
    const startDate = filter.startDate;
    const endDate = filter.endDate + ' 23:59:59';

    let categoryClause = '';
    const params: any[] = [startDate, endDate];
    if (filter.category && filter.category !== 'All') {
      categoryClause = 'AND p.category = ?';
      params.push(filter.category);
    }

    const query = `
      SELECT 
        sa.id,
        sa.created_at,
        sa.product_variant_id,
        sa.adjustment_type,
        sa.quantity_grams,
        sa.quantity_units,
        sa.reason,
        p.name as product_name,
        pv.variant_name,
        p.category,
        p.unit_type,
        pv.cost_price_paise_per_unit
      FROM stock_adjustments sa
      JOIN product_variants pv ON pv.id = sa.product_variant_id
      JOIN products p ON p.id = pv.product_id
      WHERE sa.created_at >= ? AND sa.created_at <= ?
        AND sa.adjustment_type IN ('wastage', 'damage', 'livestock_loss', 'loss_in_transit')
        ${categoryClause}
      ORDER BY sa.created_at DESC
    `;

    const rows = db.prepare(query).all(...params) as any[];

    const entries: any[] = [];
    const typeGroupMap = new Map<string, { count: number; grams: number; units: number; lossPaise: number }>();
    let grandTotalLossPaise = 0;

    for (const r of rows) {
      const isWeight = r.unit_type === 'weight';
      const unitCost = r.cost_price_paise_per_unit || 0;

      const lossPaise = isWeight 
        ? Math.round(((r.quantity_grams ?? 0) / 1000) * unitCost)
        : Math.round((r.quantity_units ?? 0) * unitCost);

      entries.push({
        id: r.id,
        created_at: r.created_at,
        product_variant_id: r.product_variant_id,
        product_name: r.product_name,
        variant_name: r.variant_name,
        category: r.category,
        unit_type: r.unit_type,
        adjustment_type: r.adjustment_type,
        quantity_grams: r.quantity_grams,
        quantity_units: r.quantity_units,
        reason: r.reason,
        unit_cost_paise: unitCost,
        total_loss_value_paise: lossPaise,
      });

      grandTotalLossPaise += lossPaise;

      if (!typeGroupMap.has(r.adjustment_type)) {
        typeGroupMap.set(r.adjustment_type, { count: 0, grams: 0, units: 0, lossPaise: 0 });
      }

      const g = typeGroupMap.get(r.adjustment_type)!;
      g.count += 1;
      g.grams += r.quantity_grams ?? 0;
      g.units += r.quantity_units ?? 0;
      g.lossPaise += lossPaise;
    }

    const groupedByType: any[] = [];
    typeGroupMap.forEach((val, type) => {
      groupedByType.push({
        type,
        entry_count: val.count,
        total_grams: val.grams,
        total_units: val.units,
        total_loss_value_paise: val.lossPaise,
      });
    });

    return {
      entries,
      groupedByType,
      grandTotalLossPaise,
    };
  }

  /**
   * Section 2: COGS Report
   * Cost of goods sold breakdown per item per period, separated into confirmed real FIFO cost vs estimated (is_estimated_cogs = 1) portions.
   */
  public getCOGSReport(filter: {
    startDate: string;
    endDate: string;
    location_id?: number | string;
    category?: string;
  }): {
    items: Array<{
      product_variant_id: number;
      product_name: string;
      variant_name: string;
      category: string;
      unit_type: 'weight' | 'piece';
      total_quantity_grams: number;
      total_quantity_units: number;
      total_revenue_paise: number;
      total_cogs_paise: number;
      real_fifo_cogs_paise: number;
      estimated_cogs_paise: number;
      has_estimated_cogs: boolean;
      gross_profit_paise: number;
      gross_profit_margin_percent: number;
    }>;
    summary: {
      total_revenue_paise: number;
      total_cogs_paise: number;
      total_real_fifo_cogs_paise: number;
      total_estimated_cogs_paise: number;
      total_gross_profit_paise: number;
      overall_margin_percent: number;
    };
  } {
    assertValidDateRange(filter.startDate, filter.endDate);
    const startDate = filter.startDate;
    const endDate = filter.endDate + ' 23:59:59';

    let categoryClause = '';
    const params: any[] = [startDate, endDate];
    if (filter.category && filter.category !== 'All') {
      categoryClause = 'AND p.category = ?';
      params.push(filter.category);
    }

    const query = `
      SELECT 
        ii.product_variant_id,
        p.name as product_name,
        pv.variant_name,
        p.category,
        p.unit_type,
        SUM(COALESCE(ii.quantity_grams, 0)) as total_grams,
        SUM(COALESCE(ii.quantity_units, 0)) as total_units,
        SUM(ii.line_subtotal_paise) as total_revenue,
        SUM(COALESCE(ii.fifo_cogs_paise, 0)) as total_cogs,
        SUM(COALESCE(ii.real_cogs_paise, ii.fifo_cogs_paise, 0)) as total_real_cogs,
        SUM(COALESCE(ii.estimated_cogs_paise, 0)) as total_estimated_cogs,
        MAX(COALESCE(ii.is_estimated_cogs, 0)) as has_estimated
      FROM invoice_items ii
      JOIN invoices inv ON inv.id = ii.invoice_id
      JOIN product_variants pv ON pv.id = ii.product_variant_id
      JOIN products p ON p.id = pv.product_id
      WHERE inv.status = 'completed'
        AND inv.created_at >= ? AND inv.created_at <= ?
        ${categoryClause}
      GROUP BY ii.product_variant_id
      ORDER BY total_revenue DESC
    `;

    const rows = db.prepare(query).all(...params) as any[];

    let totalRevenuePaise = 0;
    let totalCogsPaise = 0;
    let totalRealCogsPaise = 0;
    let totalEstimatedCogsPaise = 0;

    const items = rows.map(r => {
      const revenue = r.total_revenue || 0;
      const cogs = r.total_cogs || 0;
      const realCogs = r.total_real_cogs || (cogs - (r.total_estimated_cogs || 0));
      const estimatedCogs = r.total_estimated_cogs || 0;

      const grossProfit = revenue - cogs;
      const marginPercent = revenue > 0 ? Math.round((grossProfit / revenue) * 10000) / 100 : 0;

      totalRevenuePaise += revenue;
      totalCogsPaise += cogs;
      totalRealCogsPaise += realCogs;
      totalEstimatedCogsPaise += estimatedCogs;

      return {
        product_variant_id: r.product_variant_id,
        product_name: r.product_name,
        variant_name: r.variant_name,
        category: r.category,
        unit_type: r.unit_type,
        total_quantity_grams: r.total_grams,
        total_quantity_units: r.total_units,
        total_revenue_paise: revenue,
        total_cogs_paise: cogs,
        real_fifo_cogs_paise: realCogs,
        estimated_cogs_paise: estimatedCogs,
        has_estimated_cogs: r.has_estimated === 1 || estimatedCogs > 0,
        gross_profit_paise: grossProfit,
        gross_profit_margin_percent: marginPercent,
      };
    });

    const totalGrossProfit = totalRevenuePaise - totalCogsPaise;
    const overallMargin = totalRevenuePaise > 0 ? Math.round((totalGrossProfit / totalRevenuePaise) * 10000) / 100 : 0;

    return {
      items,
      summary: {
        total_revenue_paise: totalRevenuePaise,
        total_cogs_paise: totalCogsPaise,
        total_real_fifo_cogs_paise: totalRealCogsPaise,
        total_estimated_cogs_paise: totalEstimatedCogsPaise,
        total_gross_profit_paise: totalGrossProfit,
        overall_margin_percent: overallMargin,
      },
    };
  }

  /**
   * Correct/reverse a stock batch with full audit logging.
   * Rule 1 (Unused Stock): If remaining qty equals initial qty - safe zero-out.
   * Rule 2 (Used/Partial Stock): If remaining qty < initial qty - reversal with cost logging.
   */
  public correctStockBatch(input: { batch_id: number; reason: string }): { success: boolean; message: string } {
    if (!input.reason || input.reason.trim().length < 3) {
      throw new ValidationError('A reason with at least 3 characters is required for stock corrections.');
    }

    return dbManager.transaction(() => {
      const batch = db.prepare('SELECT * FROM product_stock_batches WHERE id = ?').get(input.batch_id) as any;
      if (!batch) {
        throw new ValidationError(`Batch #${input.batch_id} not found.`);
      }
      if (batch.status !== 'active') {
        throw new ValidationError(`Batch #${input.batch_id} is already ${batch.status}. Only active batches can be corrected.`);
      }

      const isWeight = batch.current_quantity_grams !== null;
      const remainingQty = isWeight ? (batch.current_quantity_grams ?? 0) : (batch.current_quantity_units ?? 0);
      const initialQty = isWeight ? (batch.initial_quantity_grams ?? 0) : (batch.initial_quantity_units ?? 0);

      if (remainingQty <= 0) {
        throw new ValidationError('Batch has no remaining stock to correct.');
      }

      const isUnused = remainingQty === initialQty;
      const eventType = isUnused ? 'BATCH_CORRECTED_UNUSED' : 'BATCH_CORRECTED_USED';

      // Deduct from stock_ledger
      const deltaGrams = isWeight ? -remainingQty : null;
      const deltaUnits = !isWeight ? -remainingQty : null;
      this.inventoryRepo.updateLedgerStock(batch.product_variant_id, deltaGrams, deltaUnits);

//      // Zero out batch
db.prepare(`
  UPDATE product_stock_batches 
  SET current_quantity_grams = CASE 
        WHEN current_quantity_grams IS NOT NULL THEN 0 
        ELSE current_quantity_grams 
      END,
      current_quantity_units = CASE 
        WHEN current_quantity_units IS NOT NULL THEN 0 
        ELSE current_quantity_units 
      END,
      status = 'exhausted'
  WHERE id = ?
`).run(input.batch_id);

// Log inventory transaction
this.inventoryRepo.createTransaction({
  product_variant_id: batch.product_variant_id,
  transaction_type: 'manual_adjustment',
  quantity_grams: deltaGrams,
  quantity_units: deltaUnits,
  reference_id: input.batch_id,
});

// Audit log
auditLogger.log(
  authService.getCurrentUserId(),
  eventType,
  {
    batchId: input.batch_id,
    productVariantId: batch.product_variant_id,
    reversedQuantity: remainingQty,
    initialQuantity: initialQty,
    unitCostPaise: batch.unit_cost_paise,
    reason: input.reason.trim(),
  }
);

const label = isUnused
  ? 'Unused stock safely removed'
  : 'Used stock reversed';

      return {
        success: true,
        message: `${label}. Batch #${input.batch_id} exhausted. Reason: ${input.reason.trim()}`
      };
    });
  }

  /**
   * Get all active refrigerator stock items (refrigerator_direct classification)
   * Aggregated per product variant with oldest batch duration.
   */
  /**
   * Get all active refrigerator stock items (Isolated Pool from refrigerator_stock table).
   */
  public getRefrigeratorStock(branchId: number = 1): any[] {
    const { refrigeratorService } = require('./refrigerator_service');
    return refrigeratorService.getActiveRefrigeratorStock();
  }

  /**
   * Record removal from refrigerator stock.
   */
  public recordFridgeRemoval(input: {
    batch_id?: number;
    product_variant_id: number;
    quantity: number;
    unit_type: string;
    reason?: string;
    branch_id?: number;
    user_id?: number;
    removal_type?: 'sold' | 'transfer' | 'wastage' | 'staff';
  }): { success: boolean; message: string } {
    const { refrigeratorService } = require('./refrigerator_service');
    const isWeight = input.unit_type === 'weight' || input.unit_type === 'live_dual';
    const fridgeStockId = (input as any).refrigerator_stock_id || input.batch_id || input.product_variant_id;
    let removalType = input.removal_type;
    if (!removalType) {
      const rLower = (input.reason || '').toLowerCase();
      if (rLower.includes('regular') || rLower.includes('transfer') || rLower.includes('kitchen')) {
        removalType = 'transfer';
      } else if (rLower.includes('sold') || rLower.includes('sale')) {
        removalType = 'sold';
      } else if (rLower.includes('staff')) {
        removalType = 'staff';
      } else {
        removalType = 'wastage';
      }
    }

    refrigeratorService.executeRemoval({
      refrigerator_stock_id: fridgeStockId,
      removal_type: removalType,
      quantity_grams: isWeight ? Math.round(input.quantity * 1000) : null,
      count: !isWeight ? input.quantity : null,
      destination_mutton_variant_id: input.product_variant_id,
      reason_notes: input.reason,
    }, input.user_id || 1);

    return {
      success: true,
      message: `Successfully removed ${input.quantity} ${isWeight ? 'kg' : 'pcs'} from Refrigerator Stock.`,
    };
  }

  /**
   * Record "Move into Refrigerator".
   */
  public recordFridgeAddition(input: {
    product_variant_id: number;
    quantity: number;
    unit_type: string;
    entry_date?: string;
    cost_price_paise_per_unit?: number;
    notes?: string;
    branch_id?: number;
    user_id?: number;
    item_name?: string;
    item_type?: 'leg' | 'brain' | 'head' | 'liver' | 'meat' | 'custom';
  }): { success: boolean; message: string; batch_id: number; batch_number: string } {
    const { refrigeratorService } = require('./refrigerator_service');
    const isWeight = input.unit_type === 'weight' || input.unit_type === 'live_dual';
    const variant = db.prepare('SELECT pv.*, p.name as prod_name FROM product_variants pv JOIN products p ON pv.product_id = p.id WHERE pv.id = ?').get(input.product_variant_id) as any;

    const row = refrigeratorService.moveToRefrigerator({
      item_name: input.item_name || variant?.prod_name || 'Mutton Cut',
      item_type: input.item_type || 'meat',
      unit_type: isWeight ? 'weight' : 'piece',
      quantity_grams: isWeight ? Math.round(input.quantity * 1000) : null,
      count: !isWeight ? input.quantity : null,
      cost_paise_per_unit: input.cost_price_paise_per_unit || (variant?.cost_price_paise_per_unit || 0),
      date_added: input.entry_date,
      notes: input.notes,
      source_mutton_variant_id: input.product_variant_id,
    }, input.user_id || 1);

    return {
      success: true,
      message: `Successfully added ${input.quantity} ${isWeight ? 'kg' : 'pcs'} into Refrigerator Stock.`,
      batch_id: row.id,
      batch_number: `FRG-${row.id}`,
    };
  }

  /**
   * Get Cold Storage / Refrigerator In-Out Movement Activity Log.
   */
  public getFridgeActivityLog(filters?: { branchId?: number; date?: string; limit?: number }): any[] {
    const { refrigeratorService } = require('./refrigerator_service');
    return refrigeratorService.listRemovalEvents(filters?.limit || 100);
  }

  /**
   * Empty / reset inventory stock by scope (all, category, or specific products).
   * Atomically resets stock_ledger to 0, marks product_stock_batches as exhausted,
   * logs adjustment movements in inventory_ledger to maintain audit integrity,
   * resets product_variants.current_stock to 0, and optionally clears live chicken batches
   * and refrigerator stock.
   */
  public emptyInventory(input: {
    scope: 'all' | 'category' | 'products';
    category?: string;
    productIds?: number[];
    variantIds?: number[];
    includeLiveBirds?: boolean;
    includeRefrigerator?: boolean;
    reason?: string;
    userId?: number;
  }): {
    success: boolean;
    message: string;
    variantsReset: number;
    batchesExhausted: number;
    liveBatchesClosed: number;
    fridgeItemsRemoved: number;
  } {
    const userId = input.userId ?? authService.getCurrentUserId() ?? 1;
    const reason = input.reason?.trim() || 'Manual stock empty from Settings';

    return dbManager.transaction(() => {
      // 1. Identify target product_variants based on scope
      let targetVariants: Array<{ id: number; product_id: number; variant_name: string; prod_name: string; category: string; unit_type: string }> = [];

      if (input.scope === 'all') {
        targetVariants = db.prepare(`
          SELECT pv.id, pv.product_id, pv.variant_name, p.name as prod_name, p.category, pv.unit_type
          FROM product_variants pv
          JOIN products p ON pv.product_id = p.id
        `).all() as any[];
      } else if (input.scope === 'category') {
        if (!input.category) {
          throw new ValidationError('Category must be specified when emptying by category');
        }
        targetVariants = db.prepare(`
          SELECT pv.id, pv.product_id, pv.variant_name, p.name as prod_name, p.category, pv.unit_type
          FROM product_variants pv
          JOIN products p ON pv.product_id = p.id
          WHERE LOWER(p.category) = LOWER(?)
        `).all(input.category) as any[];
      } else if (input.scope === 'products') {
        const vIds = input.variantIds || [];
        const pIds = input.productIds || [];
        if (vIds.length === 0 && pIds.length === 0) {
          throw new ValidationError('At least one product or variant must be selected');
        }
        if (vIds.length > 0) {
          const placeholders = vIds.map(() => '?').join(',');
          targetVariants = db.prepare(`
            SELECT pv.id, pv.product_id, pv.variant_name, p.name as prod_name, p.category, pv.unit_type
            FROM product_variants pv
            JOIN products p ON pv.product_id = p.id
            WHERE pv.id IN (${placeholders})
          `).all(...vIds) as any[];
        } else {
          const placeholders = pIds.map(() => '?').join(',');
          targetVariants = db.prepare(`
            SELECT pv.id, pv.product_id, pv.variant_name, p.name as prod_name, p.category, pv.unit_type
            FROM product_variants pv
            JOIN products p ON pv.product_id = p.id
            WHERE pv.product_id IN (${placeholders})
          `).all(...pIds) as any[];
        }
      }

      let variantsReset = 0;
      let batchesExhausted = 0;

      // 2. For each target variant, calculate delta and zero out stock
      for (const variant of targetVariants) {
        const isWeight = variant.unit_type === 'weight' || variant.unit_type === 'live_dual';

        // Check stock_ledger current quantity
        const stockRow = db.prepare(`
          SELECT quantity_grams, quantity_units
          FROM stock_ledger
          WHERE product_variant_id = ?
        `).get(variant.id) as any;

        const currentGrams = stockRow?.quantity_grams ?? 0;
        const currentUnits = stockRow?.quantity_units ?? 0;

        // If there was existing non-zero stock, record an inventory_ledger adjustment so running sum is zero
        if (currentGrams !== 0 || currentUnits !== 0) {
          const deltaGrams = isWeight ? -currentGrams : null;
          const deltaUnits = !isWeight ? -currentUnits : null;

          db.prepare(`
            INSERT INTO inventory_ledger (
              product_variant_id, product_id, branch_id, action_type,
              quantity_grams, quantity_units,
              running_balance_grams, running_balance_units,
              reason_code, notes, created_by, created_at
            ) VALUES (?, ?, 1, 'STOCK_ADJUSTMENT', ?, ?, 0, 0, 'manual_empty', ?, ?, CURRENT_TIMESTAMP)
          `).run(variant.id, variant.product_id, deltaGrams, deltaUnits, reason, userId);

          variantsReset++;
        }

        // Reset stock_ledger row
        if (stockRow) {
          db.prepare(`
            UPDATE stock_ledger
            SET quantity_grams = 0, quantity_units = 0, quantity_count = 0, updated_at = CURRENT_TIMESTAMP
            WHERE product_variant_id = ?
          `).run(variant.id);
        } else {
          db.prepare(`
            INSERT INTO stock_ledger (
              product_variant_id, quantity_grams, quantity_units, location_id,
              safety_threshold_grams, safety_threshold_units, updated_at
            ) VALUES (?, 0, 0, 1, 5000, 10, CURRENT_TIMESTAMP)
          `).run(variant.id);
        }

        // Reset product_variants cached stock
        db.prepare(`
          UPDATE product_variants
          SET current_stock = 0, inventory_value = 0
          WHERE id = ?
        `).run(variant.id);

        // Exhaust active stock batches for this variant
        const batchRes = db.prepare(`
          UPDATE product_stock_batches
          SET current_quantity_grams = 0, current_quantity_units = 0, status = 'exhausted', updated_at = CURRENT_TIMESTAMP
          WHERE product_variant_id = ? AND status = 'active'
        `).run(variant.id);

        batchesExhausted += batchRes.changes;

        // Clean up pending events for this variant
        try {
          db.prepare(`DELETE FROM pending_stock_events WHERE product_variant_id = ?`).run(variant.id);
        } catch (_) {}
      }

      // 3. Handle Live Chicken Batches
      let liveBatchesClosed = 0;
      const shouldEmptyLive = input.includeLiveBirds || 
        input.scope === 'all' || 
        (input.scope === 'category' && (input.category?.toLowerCase() === 'chicken' || input.category?.toLowerCase() === 'live birds'));

      if (shouldEmptyLive) {
        try {
          const liveRes = db.prepare(`
            UPDATE live_chicken_batches
            SET status = 'exhausted', remaining_weight_grams = 0, remaining_count = 0, updated_at = CURRENT_TIMESTAMP
            WHERE status = 'active'
          `).run();
          liveBatchesClosed = liveRes.changes;
        } catch (_) {}
      }

      // 4. Handle Refrigerator Stock
      let fridgeItemsRemoved = 0;
      const shouldEmptyFridge = input.includeRefrigerator || 
        input.scope === 'all' || 
        (input.scope === 'category' && input.category?.toLowerCase() === 'mutton');

      if (shouldEmptyFridge) {
        try {
          const fridgeRes = db.prepare(`
            UPDATE refrigerator_stock
            SET status = 'removed', quantity_grams = 0, count = 0, updated_at = CURRENT_TIMESTAMP
            WHERE status = 'active'
          `).run();
          fridgeItemsRemoved = fridgeRes.changes;
        } catch (_) {}
      }

      auditLogger.log(userId, 'EMPTY_INVENTORY', {
        scope: input.scope,
        category: input.category,
        variantsReset,
        batchesExhausted,
        liveBatchesClosed,
        fridgeItemsRemoved,
        reason,
      });

      logger.info(`[Inventory] Emptied inventory: ${variantsReset} variants reset, ${batchesExhausted} batches exhausted, ${liveBatchesClosed} live batches closed, ${fridgeItemsRemoved} fridge items removed.`);

      return {
        success: true,
        message: `Inventory successfully emptied: ${variantsReset} products reset to zero stock, ${batchesExhausted} batches exhausted${liveBatchesClosed > 0 ? `, ${liveBatchesClosed} live bird batches closed` : ''}${fridgeItemsRemoved > 0 ? `, ${fridgeItemsRemoved} cold storage items cleared` : ''}.`,
        variantsReset,
        batchesExhausted,
        liveBatchesClosed,
        fridgeItemsRemoved,
      };
    });
  }
}

import { container } from '../../../../core/di/container';
export const inventoryService = container.inventoryService;
export default inventoryService;

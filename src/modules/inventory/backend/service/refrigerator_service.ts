import { db } from '../../../../core/backend/db';
import { ValidationError, NotFoundError } from '../../../../core/backend/errors';
import { logger } from '../../../../core/backend/logger';
import { container } from '../../../../core/di/container';
import { stockBatchRepository } from '../repository/stock_batch_repository';

export interface RefrigeratorStockRow {
  id: number;
  item_name: string;
  item_type: 'leg' | 'brain' | 'head' | 'liver' | 'meat' | 'custom';
  unit_type: 'weight' | 'piece';
  initial_quantity_grams: number | null;
  initial_count: number | null;
  quantity_grams: number | null;
  count: number | null;
  cost_paise_per_unit: number;
  selling_rate_paise: number;
  date_added: string;
  age_days: number;
  notes: string | null;
  status: 'active' | 'removed';
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface MoveToRefrigeratorInput {
  item_name: string;
  item_type: 'leg' | 'brain' | 'head' | 'liver' | 'meat' | 'custom';
  unit_type: 'weight' | 'piece';
  quantity_grams?: number | null;
  count?: number | null;
  cost_paise_per_unit?: number;
  selling_rate_paise?: number;
  date_added?: string;
  notes?: string;
  source_mutton_variant_id?: number | null; // If moving from sellable Mutton stock
}

export interface RefrigeratorRemovalInput {
  refrigerator_stock_id: number;
  removal_type: 'sold' | 'transfer' | 'wastage' | 'staff';
  quantity_grams?: number | null;
  count?: number | null;
  invoice_id?: number | null;
  invoice_item_id?: number | null;
  destination_mutton_variant_id?: number | null; // For 'transfer' to sellable Mutton
  staff_name?: string | null;
  reason_notes?: string | null;
}

export class RefrigeratorService {
  /**
   * Get all active refrigerator stock items with calculated age in days.
   * Completely decoupled from the general stock ledger.
   */
  public getActiveRefrigeratorStock(): RefrigeratorStockRow[] {
    const rows = db.prepare(`
      SELECT rs.*,
        CAST((julianday(date('now', 'localtime')) - julianday(rs.date_added)) AS INTEGER) as age_days
      FROM refrigerator_stock rs
      WHERE rs.status = 'active'
        AND (
          (rs.unit_type = 'weight' AND COALESCE(rs.quantity_grams, 0) > 0)
          OR (rs.unit_type = 'piece' AND COALESCE(rs.count, 0) > 0)
        )
      ORDER BY rs.date_added ASC, rs.id ASC
    `).all() as any[];

    return rows.map(r => ({
      ...r,
      age_days: Math.max(0, r.age_days ?? 0),
    }));
  }

  /**
   * Get single refrigerator stock item by ID.
   */
  public getItemById(id: number): RefrigeratorStockRow {
    const row = db.prepare(`
      SELECT rs.*,
        CAST((julianday(date('now', 'localtime')) - julianday(rs.date_added)) AS INTEGER) as age_days
      FROM refrigerator_stock rs
      WHERE rs.id = ?
    `).get(id) as any;

    if (!row) throw new NotFoundError(`Refrigerator stock item #${id} not found`);
    return {
      ...row,
      age_days: Math.max(0, row.age_days ?? 0),
    };
  }

  /**
   * Move items into Refrigerator Stock.
   * If sourced from sellable Mutton, guards against insufficient stock and deducts sellable Mutton.
   */
  public moveToRefrigerator(input: MoveToRefrigeratorInput, userId: number = 1): RefrigeratorStockRow {
    const isWeight = input.unit_type === 'weight';
    if (isWeight && (!input.quantity_grams || input.quantity_grams <= 0)) {
      throw new ValidationError('Weight in grams must be greater than 0');
    }
    if (!isWeight && (!input.count || input.count <= 0)) {
      throw new ValidationError('Piece count must be greater than 0');
    }

    const databaseProvider = (db as any);
    const runInTx = databaseProvider.transaction ? databaseProvider.transaction.bind(databaseProvider) : (fn: any) => fn();

    return runInTx(() => {
      let costPaise = input.cost_paise_per_unit || 0;
      const sourceVariantId = input.source_mutton_variant_id ?? (input as any).product_variant_id;

      // If deducted from sellable Mutton Stock
      if (sourceVariantId) {
        const ledger = db.prepare('SELECT * FROM stock_ledger WHERE product_variant_id = ?').get(sourceVariantId) as any;
        const availableGrams = ledger ? (ledger.quantity_grams ?? 0) : 0;
        const availableUnits = ledger ? (ledger.quantity_units ?? 0) : 0;

        if (isWeight && (input.quantity_grams || 0) > availableGrams) {
          throw new ValidationError(
            `Insufficient sellable Mutton stock. Available: ${(availableGrams / 1000).toFixed(2)} kg, Requested: ${((input.quantity_grams || 0) / 1000).toFixed(2)} kg`
          );
        }
        if (!isWeight && (input.count || 0) > availableUnits) {
          throw new ValidationError(
            `Insufficient sellable Mutton stock. Available: ${availableUnits} pcs, Requested: ${input.count} pcs`
          );
        }

        // Deduct sellable mutton ledger & create transaction
        container.inventoryRepository.updateLedgerStock(
          sourceVariantId,
          isWeight ? -(input.quantity_grams || 0) : null,
          !isWeight ? -(input.count || 0) : null
        );

        container.inventoryRepository.createTransaction({
          product_variant_id: sourceVariantId,
          transaction_type: 'manual_adjustment',
          quantity_grams: isWeight ? -(input.quantity_grams || 0) : null,
          quantity_units: !isWeight ? -(input.count || 0) : null,
          reference_id: 0,
        });

        // Pull cost price from variant if not explicitly provided
        const variant = db.prepare('SELECT cost_price_paise_per_unit FROM product_variants WHERE id = ?').get(sourceVariantId) as any;
        if (!costPaise && variant?.cost_price_paise_per_unit) {
          costPaise = variant.cost_price_paise_per_unit;
        }
      }

      const dateAdded = input.date_added || new Date().toISOString().slice(0, 10);

      const stmt = db.prepare(`
        INSERT INTO refrigerator_stock (
          item_name, item_type, unit_type,
          initial_quantity_grams, initial_count,
          quantity_grams, count,
          cost_paise_per_unit, selling_rate_paise,
          date_added, notes, status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
      `);

      const result = stmt.run(
        input.item_name.trim(),
        input.item_type,
        input.unit_type,
        isWeight ? input.quantity_grams : null,
        !isWeight ? input.count : null,
        isWeight ? input.quantity_grams : null,
        !isWeight ? input.count : null,
        costPaise,
        input.selling_rate_paise || 0,
        dateAdded,
        input.notes || null,
        userId
      );

      const newId = Number(result.lastInsertRowid);
      logger.info('Moved item to refrigerator stock', { id: newId, item: input.item_name });
      return this.getItemById(newId);
    })();
  }

  /**
   * Execute removal from refrigerator (sold, transfer to sellable mutton, wastage, staff).
   * Strict guard against insufficient stock. Decrements quantity_grams/count directly.
   * When quantity hits 0, marks status = 'removed'.
   */
  public executeRemoval(input: RefrigeratorRemovalInput, userId: number = 1): { success: boolean; removal_event_id: number } {
    const item = this.getItemById(input.refrigerator_stock_id);
    if (item.status !== 'active') {
      throw new ValidationError(`Refrigerator item #${item.id} (${item.item_name}) is already removed/exhausted`);
    }

    const isWeight = item.unit_type === 'weight';
    const deductGrams = isWeight ? (input.quantity_grams ?? item.quantity_grams ?? 0) : null;
    const deductCount = !isWeight ? (input.count ?? item.count ?? 0) : null;

    // Explicit insufficient-stock guard
    if (isWeight) {
      if (!deductGrams || deductGrams <= 0) {
        throw new ValidationError('Removal weight must be greater than 0 grams');
      }
      if (deductGrams > (item.quantity_grams ?? 0)) {
        throw new ValidationError(
          `Cannot remove ${(deductGrams / 1000).toFixed(2)} kg. Refrigerator only has ${((item.quantity_grams ?? 0) / 1000).toFixed(2)} kg remaining.`
        );
      }
    } else {
      if (!deductCount || deductCount <= 0) {
        throw new ValidationError('Removal count must be greater than 0');
      }
      if (deductCount > (item.count ?? 0)) {
        throw new ValidationError(
          `Cannot remove ${deductCount} pcs. Refrigerator only has ${item.count ?? 0} pcs remaining.`
        );
      }
    }
    const rawType = (input.removal_type ?? (input as any).removal_reason ?? 'sold').toLowerCase();
    const removalType: 'sold' | 'transfer' | 'wastage' | 'staff' = 
      rawType.includes('transfer') ? 'transfer' :
      rawType.includes('waste') || rawType.includes('spoil') ? 'wastage' :
      rawType.includes('staff') ? 'staff' : 'sold';

    const reasonNotes = input.reason_notes ?? (input as any).notes;
    const destVariantId = input.destination_mutton_variant_id ?? (input as any).product_variant_id;

    if (removalType === 'wastage' && (!reasonNotes || !reasonNotes.trim())) {
      throw new ValidationError('A mandatory reason note is required for wastage/spoiled removal');
    }
    if (removalType === 'staff' && (!input.staff_name || !input.staff_name.trim())) {
      throw new ValidationError('Staff name is required for staff/personal use removal');
    }
    if (removalType === 'transfer' && !destVariantId) {
      throw new ValidationError('A destination Mutton variant must be selected when transferring to regular stock');
    }

    const databaseProvider = (db as any);
    const runInTx = databaseProvider.transaction ? databaseProvider.transaction.bind(databaseProvider) : (fn: any) => fn();

    return runInTx(() => {
      // 1. Decrement live balance in refrigerator_stock
      const remGrams = isWeight ? Math.max(0, (item.quantity_grams ?? 0) - deductGrams!) : null;
      const remCount = !isWeight ? Math.max(0, (item.count ?? 0) - deductCount!) : null;
      const isExhausted = (isWeight && remGrams! <= 0) || (!isWeight && remCount! <= 0);

      db.prepare(`
        UPDATE refrigerator_stock
        SET quantity_grams = ?,
            count = ?,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(remGrams, remCount, isExhausted ? 'removed' : 'active', item.id);

      // 2. If transfer removal: weight added back to sellable Mutton stock carries cost_paise_per_unit
      if (removalType === 'transfer') {
        // Add back into sellable Mutton stock ledger
        container.inventoryRepository.updateLedgerStock(
          destVariantId,
          isWeight ? deductGrams : null,
          !isWeight ? deductCount : null
        );

        // Create stock batch with cost basis from refrigerator item
        const cleanDate = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 8);
        stockBatchRepository.createBatch({
          batch_number: `BAT-FRG-RET-${cleanDate}-${item.id}`,
          product_variant_id: destVariantId,
          received_date: new Date().toISOString(),
          quantity_grams: isWeight ? deductGrams : null,
          quantity_units: !isWeight ? deductCount : null,
          unit_cost_paise: item.cost_paise_per_unit || 0,
          source_type: 'adjustment',
          source_ref_id: item.id,
        });

        container.inventoryRepository.createTransaction({
          product_variant_id: destVariantId,
          transaction_type: 'manual_adjustment',
          quantity_grams: isWeight ? deductGrams : null,
          quantity_units: !isWeight ? deductCount : null,
          reference_id: item.id,
        });
      }

      // 3. Write to refrigerator_removal_events audit
      const stmt = db.prepare(`
        INSERT INTO refrigerator_removal_events (
          refrigerator_stock_id, removal_type, quantity_grams, count,
          invoice_id, invoice_item_id, staff_name, reason_notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const res = stmt.run(
        item.id,
        removalType,
        deductGrams,
        deductCount,
        input.invoice_id ?? null,
        input.invoice_item_id ?? null,
        input.staff_name ?? null,
        reasonNotes ?? null,
        userId || 1
      );

      const removalId = Number(res.lastInsertRowid);
      logger.info('Refrigerator removal executed', { removalId, type: input.removal_type, itemId: item.id });

      return { success: true, removal_event_id: removalId };
    })();
  }

  /**
   * Adjust refrigerator stock when an invoice item is added, increased, reduced, or removed on an open bill.
   * Handles immediate real-time synchronization between draft cart and refrigerator stock balance.
   *
   * @param deltaGrams positive means more weight taken out of fridge; negative means weight returned to fridge
   * @param deltaCount positive means more pieces taken out of fridge; negative means pieces returned to fridge
   */
  public adjustRefrigeratorStockForInvoice(
    refrigeratorStockId: number,
    deltaGrams: number | null,
    deltaCount: number | null,
    userId: number
  ): void {
    const item = this.getItemById(refrigeratorStockId);
    const isWeight = item.unit_type === 'weight';

    const currentGrams = item.quantity_grams ?? 0;
    const currentCount = item.count ?? 0;

    if (isWeight && deltaGrams !== null && deltaGrams !== 0) {
      // If taking more out, guard against insufficient stock
      if (deltaGrams > 0 && deltaGrams > currentGrams) {
        throw new ValidationError(
          `Insufficient refrigerator stock for ${item.item_name}. Available: ${(currentGrams / 1000).toFixed(2)} kg, Requested additional: ${(deltaGrams / 1000).toFixed(2)} kg`
        );
      }
      const newGrams = Math.max(0, currentGrams - deltaGrams);
      const isExhausted = newGrams <= 0;
      db.prepare(`
        UPDATE refrigerator_stock
        SET quantity_grams = ?,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newGrams, isExhausted ? 'removed' : 'active', item.id);

      logger.info('Adjusted refrigerator stock grams for invoice item', {
        itemId: item.id,
        deltaGrams,
        newGrams
      });
    }

    if (!isWeight && deltaCount !== null && deltaCount !== 0) {
      if (deltaCount > 0 && deltaCount > currentCount) {
        throw new ValidationError(
          `Insufficient refrigerator stock for ${item.item_name}. Available: ${currentCount} pcs, Requested additional: ${deltaCount} pcs`
        );
      }
      const newCount = Math.max(0, currentCount - deltaCount);
      const isExhausted = newCount <= 0;
      db.prepare(`
        UPDATE refrigerator_stock
        SET count = ?,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newCount, isExhausted ? 'removed' : 'active', item.id);

      logger.info('Adjusted refrigerator stock count for invoice item', {
        itemId: item.id,
        deltaCount,
        newCount
      });
    }
  }

  /**
   * List recent refrigerator removal events with item details.
   */
  public listRemovalEvents(limit: number = 50): any[] {
    return db.prepare(`
      SELECT rre.*, rs.item_name, rs.item_type, rs.unit_type, u.username as user_name
      FROM refrigerator_removal_events rre
      JOIN refrigerator_stock rs ON rs.id = rre.refrigerator_stock_id
      LEFT JOIN users u ON u.id = rre.created_by
      ORDER BY rre.created_at DESC
      LIMIT ?
    `).all(limit);
  }
}

export const refrigeratorService = new RefrigeratorService();

import { db } from '../../../../core/backend/db';
import { container } from '../../../../core/di/container';
import { fifoService } from './fifo_service';
import { stockBatchRepository } from '../repository/stock_batch_repository';
import { ValidationError } from '../../../../core/backend/errors';

export interface ExecuteYieldRunInput {
  raw_input_variant_id: number;
  input_quantity: number; // in kg (if weight) or units (if piece)
  input_count?: number; // count/animals (if live_dual)
  outputs: Array<{
    output_variant_id: number;
    quantity: number; // in kg or units
    cost_share_percent?: number; // optional custom ratio (0-100)
  }>;
  wastage_quantity: number; // in kg or units
  notes?: string;
}

export class YieldProcessingService {
  public executeYieldProcessing(input: ExecuteYieldRunInput, userId: number): any {
    const rawVariant = db.prepare(`
      SELECT pv.*, p.unit_type
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE pv.id = ?
    `).get(input.raw_input_variant_id) as any;
    if (!rawVariant) throw new ValidationError(`Input variant ${input.raw_input_variant_id} not found`);

    const isLiveDual = rawVariant.unit_type === 'live_dual';
    const isRawWeight = rawVariant.unit_type === 'weight' || isLiveDual;
    const inputGrams = isRawWeight ? Math.round(input.input_quantity * 1000) : null;
    const inputUnits = rawVariant.unit_type === 'piece' ? Math.round(input.input_quantity) : null;
    const inputCount = isLiveDual ? (input.input_count ?? null) : null;

    if ((isRawWeight && (!inputGrams || inputGrams <= 0)) || (!isRawWeight && (!inputUnits || inputUnits <= 0))) {
      throw new ValidationError('Input quantity must be a positive number');
    }

    const databaseProvider = container.databaseProvider;
    return databaseProvider.transaction(() => {
      // 1. Draw down raw input carcass using FIFO
      const fifoRes = fifoService.drawdownFifo(input.raw_input_variant_id, inputGrams, inputUnits, inputCount);
      const totalInputCostPaise = fifoRes.total_cogs_paise || (input.input_quantity * (rawVariant.cost_price_paise_per_unit || 0));

      // Generate Yield Run Number
      const cleanDate = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 8);
      const countRuns = db.prepare('SELECT COUNT(*) as cnt FROM yield_processing_runs').get() as { cnt: number };
      const runSeq = String(countRuns.cnt + 1).padStart(3, '0');
      const runNumber = `YLD-${cleanDate}-${runSeq}`;

      const wastageGrams = isRawWeight ? Math.round(input.wastage_quantity * 1000) : 0;
      const wastageUnits = !isRawWeight ? Math.round(input.wastage_quantity) : 0;

      // 2. Create Yield Processing Run Record
      const runStmt = db.prepare(`
        INSERT INTO yield_processing_runs (
          run_number, raw_input_variant_id, input_quantity_grams, input_quantity_units, input_count,
          total_input_cost_paise, wastage_quantity_grams, wastage_quantity_units,
          processed_by, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const runRes = runStmt.run(
        runNumber,
        input.raw_input_variant_id,
        inputGrams,
        inputUnits,
        inputCount,
        totalInputCostPaise,
        wastageGrams,
        wastageUnits,
        userId,
        input.notes || null
      );
      const runId = runRes.lastInsertRowid as number;

      // Calculate total saleable weight/units to allocate costs proportionally if custom ratio not supplied
      let totalSaleableQty = 0;
      input.outputs.forEach(o => { totalSaleableQty += o.quantity; });
      if (totalSaleableQty <= 0) throw new ValidationError('At least one output cut quantity must be greater than zero');

      const createdOutputs: any[] = [];

      // 3. Process each output cut
      input.outputs.forEach((out, idx) => {
        const outVariant = db.prepare('SELECT * FROM product_variants WHERE id = ?').get(out.output_variant_id) as any;
        if (!outVariant) throw new ValidationError(`Output variant ${out.output_variant_id} not found`);

        const isOutWeight = outVariant.unit_type === 'weight';
        const outGrams = isOutWeight ? Math.round(out.quantity * 1000) : null;
        const outUnits = !isOutWeight ? Math.round(out.quantity) : null;

        // Determine cost allocation
        let sharePct = out.cost_share_percent;
        if (sharePct === undefined || sharePct === null) {
          sharePct = (out.quantity / totalSaleableQty) * 100;
        }

        const allocatedCostPaise = Math.round(totalInputCostPaise * (sharePct / 100));
        const unitCostPaise = Math.round(allocatedCostPaise / (out.quantity || 1));

        // Create new batch for this output cut
        const batchNum = `BAT-YLD-${cleanDate}-${runId}-${idx + 1}`;
        const outputBatch = stockBatchRepository.createBatch({
          batch_number: batchNum,
          product_variant_id: out.output_variant_id,
          received_date: new Date().toISOString(),
          quantity_grams: outGrams,
          quantity_units: outUnits,
          unit_cost_paise: unitCostPaise,
          source_type: 'yield_processing',
          source_ref_id: runId,
        });

        // Update stock ledger & transaction
        container.inventoryRepository.updateLedgerStock(out.output_variant_id, outGrams, outUnits);
        container.inventoryRepository.createTransaction({
          product_variant_id: out.output_variant_id,
          transaction_type: 'manual_adjustment',
          quantity_grams: outGrams,
          quantity_units: outUnits,
          reference_id: runId,
        });

        db.prepare(`
          INSERT INTO yield_processing_outputs (
            yield_run_id, output_variant_id, output_quantity_grams, output_quantity_units,
            allocated_cost_paise, unit_cost_paise, output_batch_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(runId, out.output_variant_id, outGrams, outUnits, allocatedCostPaise, unitCostPaise, outputBatch.id);

        const { inventoryLedgerService } = require('./inventory_ledger_service');
        inventoryLedgerService.recordEntry({
          product_variant_id: out.output_variant_id,
          branch_id: 1,
          action_type: 'yield_in',
          quantity_grams: isOutWeight ? outGrams : null,
          quantity_units: !isOutWeight ? outUnits : null,
          unit_cost_paise: unitCostPaise,
          reference_type: 'yield_batch',
          reference_id: runId,
          reference_number: runNumber,
          notes: `Yield cut output (${runNumber})`,
          created_by: userId,
        });

        createdOutputs.push({
          output_variant_id: out.output_variant_id,
          quantity: out.quantity,
          unit_cost_paise: unitCostPaise,
          batch_number: batchNum,
        });
      });

      // 4. Auto-log Wastage/Loss into Phase 1 stock_adjustments if wastage > 0
      if (input.wastage_quantity > 0) {
        db.prepare(`
          INSERT INTO stock_adjustments (
            product_variant_id, adjustment_type, quantity_grams, quantity_units,
            reason, adjusted_by
          ) VALUES (?, 'wastage', ?, ?, ?, ?)
        `).run(
          input.raw_input_variant_id,
          wastageGrams,
          wastageUnits,
          `Yield Loss (${runNumber})`,
          userId
        );

        const { inventoryLedgerService } = require('./inventory_ledger_service');
        inventoryLedgerService.recordEntry({
          product_variant_id: input.raw_input_variant_id,
          branch_id: 1,
          action_type: 'wastage',
          quantity_grams: isRawWeight ? -wastageGrams : null,
          quantity_units: !isRawWeight ? -wastageUnits : null,
          reference_type: 'yield_batch',
          reference_id: runId,
          reference_number: runNumber,
          notes: `Yield processing loss/wastage (${runNumber})`,
          created_by: userId,
        });
      }

      // Record yield_out for raw input
      const { inventoryLedgerService } = require('./inventory_ledger_service');
      inventoryLedgerService.recordEntry({
        product_variant_id: input.raw_input_variant_id,
        branch_id: 1,
        action_type: 'yield_out',
        quantity_grams: isRawWeight ? -inputGrams! : null,
        quantity_units: !isRawWeight ? -inputUnits! : null,
        reference_type: 'yield_batch',
        reference_id: runId,
        reference_number: runNumber,
        notes: `Yield conversion raw input (${runNumber})`,
        created_by: userId,
      });

      const { auditLogger } = require('../../../../core/backend/logger');
      auditLogger.log(userId, 'YIELD_PROCESSING_EXECUTED', {
        runId,
        runNumber,
        rawInputVariantId: input.raw_input_variant_id,
        totalInputCostPaise,
        wastageQuantity: input.wastage_quantity,
        outputCount: createdOutputs.length,
      });

      return {
        runId,
        runNumber,
        rawInputVariantId: input.raw_input_variant_id,
        totalInputCostPaise,
        wastageQuantity: input.wastage_quantity,
        outputs: createdOutputs,
      };
    });
  }

  public processLiveChickenBatch(input: {
    batch_id: number;
    live_weight_grams: number;
    live_count: number;
    processed_weight_grams: number;
    yield_ratio_used: number;
    processed_variant_id: number;
    notes?: string;
  }, userId: number = 1): any {
    if (input.live_weight_grams <= 0) throw new ValidationError('Live weight used must be greater than 0 grams');
    if (input.live_count <= 0) throw new ValidationError('Live bird count used must be greater than 0');
    if (input.processed_weight_grams <= 0) throw new ValidationError('Processed weight yielded must be greater than 0 grams');
    if (input.yield_ratio_used <= 0) throw new ValidationError('Yield ratio must be greater than 0');

    const batch = db.prepare('SELECT * FROM live_chicken_batches WHERE id = ?').get(input.batch_id) as any;
    if (!batch) throw new ValidationError(`Live chicken batch #${input.batch_id} not found`);

    // Insufficient-stock guard
    if (input.live_weight_grams > batch.remaining_weight_grams) {
      throw new ValidationError(
        `Requested live weight ${(input.live_weight_grams / 1000).toFixed(2)} kg exceeds batch remaining ${(batch.remaining_weight_grams / 1000).toFixed(2)} kg`
      );
    }
    if (input.live_count > batch.remaining_count) {
      throw new ValidationError(
        `Requested live bird count ${input.live_count} exceeds batch remaining count ${batch.remaining_count}`
      );
    }

    const processedVariant = db.prepare('SELECT * FROM product_variants WHERE id = ?').get(input.processed_variant_id) as any;
    if (!processedVariant) throw new ValidationError(`Processed chicken variant #${input.processed_variant_id} not found`);

    const databaseProvider = container.databaseProvider;
    return databaseProvider.transaction(() => {
      // 1. Cost propagation: liveCostPaise = (cost_per_kg_paise / 1000) * live_weight_grams
      const liveCostPaise = (batch.cost_per_kg_paise / 1000) * input.live_weight_grams;
      const costPerGramProcessed = liveCostPaise / input.processed_weight_grams;
      const unitCostPaisePerKg = Math.round(costPerGramProcessed * 1000);

      // 2. Decrement Live Chicken Batch
      const newWeight = Math.max(0, batch.remaining_weight_grams - input.live_weight_grams);
      const newCount = Math.max(0, batch.remaining_count - input.live_count);
      const newStatus = (newWeight <= 0 || newCount <= 0) ? 'exhausted' : 'active';

      db.prepare(`
        UPDATE live_chicken_batches
        SET remaining_weight_grams = ?,
            remaining_count = ?,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newWeight, newCount, newStatus, batch.id);

      // 3. Generate Event and Batch Numbers
      const cleanDate = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 8);
      const countRow = db.prepare('SELECT COUNT(*) as cnt FROM processing_events').get() as { cnt: number };
      const seq = String(countRow.cnt + 1).padStart(4, '0');
      const eventNumber = `PRC-CHK-${cleanDate}-${seq}`;
      const outputBatchNumber = `BAT-PRC-${cleanDate}-${seq}`;

      // 4. Create stock batch in Processed Chicken (Sellable Pool)
      const outputBatch = stockBatchRepository.createBatch({
        batch_number: outputBatchNumber,
        product_variant_id: input.processed_variant_id,
        received_date: new Date().toISOString(),
        quantity_grams: input.processed_weight_grams,
        quantity_units: null,
        unit_cost_paise: unitCostPaisePerKg,
        source_type: 'yield_processing',
        source_ref_id: batch.id,
      });

      // 5. Update stock_ledger & transaction
      container.inventoryRepository.updateLedgerStock(input.processed_variant_id, input.processed_weight_grams, null);
      container.inventoryRepository.createTransaction({
        product_variant_id: input.processed_variant_id,
        transaction_type: 'manual_adjustment',
        quantity_grams: input.processed_weight_grams,
        quantity_units: null,
        reference_id: outputBatch.id,
      });

      // 6. Insert Processing Event audit record
      const insertStmt = db.prepare(`
        INSERT INTO processing_events (
          event_number, batch_id, live_weight_grams, live_count,
          processed_weight_grams, yield_ratio_used, cost_per_gram_processed_paise,
          processed_variant_id, destination_batch_id, created_by, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertRes = insertStmt.run(
        eventNumber,
        batch.id,
        input.live_weight_grams,
        input.live_count,
        input.processed_weight_grams,
        input.yield_ratio_used,
        costPerGramProcessed,
        input.processed_variant_id,
        outputBatch.id,
        userId || 1,
        input.notes || null
      );

      // Also record inventory_ledger entry
      const { inventoryLedgerService } = require('./inventory_ledger_service');
      inventoryLedgerService.recordEntry({
        product_variant_id: input.processed_variant_id,
        branch_id: 1,
        action_type: 'yield_in',
        quantity_grams: input.processed_weight_grams,
        quantity_units: null,
        unit_cost_paise: unitCostPaisePerKg,
        reference_type: 'processing_event',
        reference_id: Number(insertRes.lastInsertRowid),
        reference_number: eventNumber,
        notes: `Processed Chicken from Batch ${batch.batch_number}`,
        created_by: userId || 1,
      });

      return {
        success: true,
        event_number: eventNumber,
        batch_number: outputBatchNumber,
        processed_weight_grams: input.processed_weight_grams,
        cost_per_kg_paise: unitCostPaisePerKg,
      };
    });
  }

  public listProcessingEvents(limit: number = 50): any[] {
    return db.prepare(`
      SELECT pe.*,
        lcb.batch_number as live_batch_number,
        pv.variant_name as processed_variant_name,
        p.name as processed_product_name,
        u.username as created_by_user
      FROM processing_events pe
      JOIN live_chicken_batches lcb ON lcb.id = pe.batch_id
      LEFT JOIN product_variants pv ON pv.id = pe.processed_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      LEFT JOIN users u ON u.id = pe.created_by
      ORDER BY pe.created_at DESC
      LIMIT ?
    `).all(limit);
  }

  public listYieldRuns(): any[] {
    return db.prepare(`
      SELECT ypr.*, pv.variant_name as raw_variant_name, p.name as raw_product_name, u.username as processed_by_user
      FROM yield_processing_runs ypr
      JOIN product_variants pv ON pv.id = ypr.raw_input_variant_id
      JOIN products p ON p.id = pv.product_id
      JOIN users u ON u.id = ypr.processed_by
      ORDER BY ypr.created_at DESC
    `).all();
  }

  public getYieldRunDetails(runId: number): any {
    const run = db.prepare(`
      SELECT ypr.*, pv.variant_name as raw_variant_name, p.name as raw_product_name
      FROM yield_processing_runs ypr
      JOIN product_variants pv ON pv.id = ypr.raw_input_variant_id
      JOIN products p ON p.id = pv.product_id
      WHERE ypr.id = ?
    `).get(runId);
    if (!run) throw new ValidationError('Yield run not found');

    const outputs = db.prepare(`
      SELECT ypo.*, pv.variant_name as output_variant_name, p.name as output_product_name
      FROM yield_processing_outputs ypo
      JOIN product_variants pv ON pv.id = ypo.output_variant_id
      JOIN products p ON p.id = pv.product_id
      WHERE ypo.yield_run_id = ?
    `).all(runId);

    return { ...run, outputs };
  }
}

export const yieldProcessingService = new YieldProcessingService();

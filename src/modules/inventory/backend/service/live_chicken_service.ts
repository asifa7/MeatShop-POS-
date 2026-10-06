import { db } from '../../../../core/backend/db';
import { ValidationError, NotFoundError } from '../../../../core/backend/errors';
import { logger } from '../../../../core/backend/logger';

export interface LiveChickenBatchRow {
  id: number;
  batch_number: string;
  supplier_id: number | null;
  supplier_name?: string | null;
  purchase_invoice_id: number | null;
  purchase_date: string;
  cost_per_kg_paise: number;
  initial_weight_grams: number;
  initial_count: number;
  remaining_weight_grams: number;
  remaining_count: number;
  status: 'active' | 'exhausted';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateLiveChickenBatchInput {
  supplier_id?: number | null;
  purchase_invoice_id?: number | null;
  purchase_date: string;
  cost_per_kg_paise: number;
  initial_weight_grams: number;
  initial_count: number;
  notes?: string;
  batch_number?: string;
}

export interface EditLiveChickenBatchInput {
  batch_id: number;
  new_weight_grams: number;
  new_count: number;
  reason_notes: string;
  user_id: number;
}

export interface LivestockMortalityInput {
  batch_id: number;
  dead_count: number;
  dead_weight_grams: number;
  reason_notes: string;
  user_id: number;
}

export class LiveChickenService {
  /**
   * List live chicken batches with optional status filter.
   */
  public listBatches(status?: 'active' | 'exhausted'): LiveChickenBatchRow[] {
    let sql = `
      SELECT lcb.*, s.company_name as supplier_name
      FROM live_chicken_batches lcb
      LEFT JOIN suppliers s ON s.id = lcb.supplier_id
    `;
    const params: any[] = [];
    if (status) {
      sql += ' WHERE lcb.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY lcb.purchase_date DESC, lcb.id DESC';
    return db.prepare(sql).all(...params) as LiveChickenBatchRow[];
  }

  /**
   * Get single batch by ID.
   */
  public getBatchById(id: number): LiveChickenBatchRow {
    const row = db.prepare(`
      SELECT lcb.*, s.company_name as supplier_name
      FROM live_chicken_batches lcb
      LEFT JOIN suppliers s ON s.id = lcb.supplier_id
      WHERE lcb.id = ?
    `).get(id) as LiveChickenBatchRow | undefined;
    if (!row) throw new NotFoundError(`Live chicken batch #${id} not found`);
    return row;
  }

  /**
   * Create a new Live Chicken Batch upon purchase receipt.
   */
  public createBatch(input: CreateLiveChickenBatchInput): LiveChickenBatchRow {
    if (input.initial_weight_grams <= 0) {
      throw new ValidationError('Initial live weight must be greater than 0 grams');
    }
    if (input.initial_count <= 0) {
      throw new ValidationError('Initial bird count must be greater than 0');
    }

    const cleanDate = input.purchase_date.replace(/[^0-9]/g, '').slice(0, 8);
    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM live_chicken_batches').get() as { cnt: number };
    const seq = String(countRow.cnt + 1).padStart(4, '0');
    const batchNumber = input.batch_number || `BAT-LIVE-${cleanDate}-${seq}`;

    const stmt = db.prepare(`
      INSERT INTO live_chicken_batches (
        batch_number, supplier_id, purchase_invoice_id, purchase_date,
        cost_per_kg_paise, initial_weight_grams, initial_count,
        remaining_weight_grams, remaining_count, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `);

    const result = stmt.run(
      batchNumber,
      input.supplier_id ?? null,
      input.purchase_invoice_id ?? null,
      input.purchase_date,
      input.cost_per_kg_paise || 0,
      input.initial_weight_grams,
      input.initial_count,
      input.initial_weight_grams,
      input.initial_count,
      input.notes || null
    );

    return this.getBatchById(Number(result.lastInsertRowid));
  }

  /**
   * Edit an existing Live Chicken batch (remaining weight/count correction).
   * Logs reason note to live_chicken_batch_adjustments.
   */
  public editBatch(input: EditLiveChickenBatchInput): LiveChickenBatchRow {
    const reasonNotes = (input.reason_notes ?? (input as any).reason ?? '').trim();
    const newWeightGrams = input.new_weight_grams ?? (input as any).remaining_weight_grams ?? 0;
    const newCount = input.new_count ?? (input as any).remaining_count ?? 0;

    if (!reasonNotes) {
      throw new ValidationError('A mandatory reason note is required to edit batch stock');
    }
    if (newWeightGrams < 0) {
      throw new ValidationError('Remaining weight cannot be negative');
    }
    if (newCount < 0) {
      throw new ValidationError('Remaining bird count cannot be negative');
    }

    const current = this.getBatchById(input.batch_id);

    const weightDelta = newWeightGrams - current.remaining_weight_grams;
    const countDelta = newCount - current.remaining_count;
    const newStatus = (newWeightGrams <= 0 || newCount <= 0) ? 'exhausted' : 'active';

    const databaseProvider = (db as any);
    const runInTx = databaseProvider.transaction ? databaseProvider.transaction.bind(databaseProvider) : (fn: any) => fn();

    return runInTx(() => {
      db.prepare(`
        UPDATE live_chicken_batches
        SET remaining_weight_grams = ?,
            remaining_count = ?,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newWeightGrams, newCount, newStatus, input.batch_id);

      db.prepare(`
        INSERT INTO live_chicken_batch_adjustments (
          batch_id, adjustment_type, weight_delta_grams, count_delta,
          previous_weight_grams, new_weight_grams, previous_count, new_count,
          reason_notes, adjusted_by
        ) VALUES (?, 'correction', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.batch_id,
        weightDelta,
        countDelta,
        current.remaining_weight_grams,
        newWeightGrams,
        current.remaining_count,
        newCount,
        reasonNotes,
        input.user_id ?? 1
      );

      logger.info('Live chicken batch adjusted', {
        batchId: input.batch_id,
        weightDelta,
        countDelta,
        reason: reasonNotes
      });

      return this.getBatchById(input.batch_id);
    })();
  }

  /**
   * Log livestock mortality (dead bird write-off).
   * Insufficient-stock guard checks that requested dead birds/weight do not exceed remaining.
   */
  public logMortality(input: LivestockMortalityInput): LiveChickenBatchRow {
    const deadCount = input.dead_count;
    const deadWeightGrams = input.dead_weight_grams ?? (input as any).weight_loss_grams ?? 0;
    const reasonNotes = (input.reason_notes ?? (input as any).reason ?? '').trim();

    if (deadCount <= 0) {
      throw new ValidationError('Dead bird count must be greater than 0');
    }
    if (deadWeightGrams <= 0) {
      throw new ValidationError('Dead bird weight must be greater than 0 grams');
    }
    if (!reasonNotes) {
      throw new ValidationError('A mandatory reason note is required for mortality write-off');
    }

    const current = this.getBatchById(input.batch_id);

    // Insufficient-stock guards
    if (deadCount > current.remaining_count) {
      throw new ValidationError(
        `Cannot record ${deadCount} dead birds. Batch only has ${current.remaining_count} birds remaining.`
      );
    }
    if (deadWeightGrams > current.remaining_weight_grams) {
      throw new ValidationError(
        `Cannot write off ${(deadWeightGrams / 1000).toFixed(2)} kg. Batch only has ${(current.remaining_weight_grams / 1000).toFixed(2)} kg remaining.`
      );
    }

    const newWeight = Math.max(0, current.remaining_weight_grams - deadWeightGrams);
    const newCount = Math.max(0, current.remaining_count - deadCount);
    const newStatus = (newWeight <= 0 || newCount <= 0) ? 'exhausted' : 'active';

    const databaseProvider = (db as any);
    const runInTx = databaseProvider.transaction ? databaseProvider.transaction.bind(databaseProvider) : (fn: any) => fn();

    return runInTx(() => {
      db.prepare(`
        UPDATE live_chicken_batches
        SET remaining_weight_grams = ?,
            remaining_count = ?,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newWeight, newCount, newStatus, input.batch_id);

      db.prepare(`
        INSERT INTO live_chicken_batch_adjustments (
          batch_id, adjustment_type, weight_delta_grams, count_delta,
          previous_weight_grams, new_weight_grams, previous_count, new_count,
          reason_notes, adjusted_by
        ) VALUES (?, 'mortality', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.batch_id,
        -deadWeightGrams,
        -deadCount,
        current.remaining_weight_grams,
        newWeight,
        current.remaining_count,
        newCount,
        reasonNotes,
        input.user_id ?? 1
      );

      logger.info('Livestock mortality logged', {
        batchId: input.batch_id,
        deadCount: input.dead_count,
        deadWeight: input.dead_weight_grams,
        reason: input.reason_notes
      });

      return this.getBatchById(input.batch_id);
    })();
  }
}

export const liveChickenService = new LiveChickenService();

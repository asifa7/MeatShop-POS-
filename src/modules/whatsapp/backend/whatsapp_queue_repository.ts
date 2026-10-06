import { db } from '../../../core/backend/db';
import { logger } from '../../../core/backend/logger';
import { WhatsAppQueueItem } from '../../../core/shared/types';

export interface EnqueueWhatsAppInput {
  invoice_id?: number | null;
  phone: string;
  message_type: 'bill_image' | 'delivery_notice' | 'custom_text';
  payload: any;
  max_retries?: number;
}

export const whatsAppQueueRepository = {
  /**
   * Enqueues a message into the persistent WhatsApp send queue.
   */
  enqueue(input: EnqueueWhatsAppInput): number {
    const payloadStr = typeof input.payload === 'string' ? input.payload : JSON.stringify(input.payload);
    const maxRetries = typeof input.max_retries === 'number' ? input.max_retries : 3;

    const stmt = db.prepare(`
      INSERT INTO whatsapp_send_queue (
        invoice_id, phone, message_type, payload_json, status, retry_count, max_retries, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'pending', 0, ?, datetime('now'), datetime('now'))
    `);

    const result = stmt.run(
      input.invoice_id || null,
      input.phone.trim(),
      input.message_type,
      payloadStr,
      maxRetries
    );

    const queueId = Number(result.lastInsertRowid);
    logger.info(`[WhatsApp Queue] Enqueued item #${queueId} (type: ${input.message_type}) for phone ${input.phone}`);
    return queueId;
  },

  /**
   * Retrieves the next eligible item to process.
   * Eligible items have status 'pending' or 'failed_transient' with next_retry_at <= now.
   */
  peekNext(): WhatsAppQueueItem | null {
    const stmt = db.prepare(`
      SELECT * FROM whatsapp_send_queue
      WHERE (status = 'pending')
         OR (status = 'failed_transient' AND (next_retry_at IS NULL OR datetime(next_retry_at) <= datetime('now')))
      ORDER BY id ASC
      LIMIT 1
    `);

    const row = stmt.get() as WhatsAppQueueItem | undefined;
    return row || null;
  },

  /**
   * Marks an item as currently processing.
   */
  markProcessing(id: number): void {
    db.prepare(`
      UPDATE whatsapp_send_queue
      SET status = 'processing', updated_at = datetime('now')
      WHERE id = ?
    `).run(id);
  },

  /**
   * Marks an item as successfully sent.
   */
  markSent(id: number): void {
    db.prepare(`
      UPDATE whatsapp_send_queue
      SET status = 'sent', error_message = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(id);
  },

  /**
   * Records a transient failure with an exponential backoff retry timestamp.
   */
  markFailedTransient(id: number, errorMessage: string, backoffSeconds: number): void {
    const modifier = `+${Math.max(5, backoffSeconds)} seconds`;
    db.prepare(`
      UPDATE whatsapp_send_queue
      SET status = 'failed_transient',
          retry_count = retry_count + 1,
          next_retry_at = datetime('now', ?),
          error_message = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(modifier, errorMessage, id);
  },

  /**
   * Marks an item as permanently failed (retries exhausted or invalid phone).
   */
  markFailedFinal(id: number, errorMessage: string): void {
    db.prepare(`
      UPDATE whatsapp_send_queue
      SET status = 'failed_final',
          error_message = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(errorMessage, id);
  },

  /**
   * Places an item on hold because WhatsApp Web is not linked/logged in.
   * DOES NOT consume any retry attempts.
   */
  markHoldNotLoggedIn(id: number, reason: string): void {
    db.prepare(`
      UPDATE whatsapp_send_queue
      SET status = 'hold_not_logged_in',
          error_message = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(reason, id);
  },

  /**
   * Releases all items currently on hold due to not being logged in back to 'pending'.
   */
  releaseHoldItems(): number {
    const result = db.prepare(`
      UPDATE whatsapp_send_queue
      SET status = 'pending', error_message = NULL, updated_at = datetime('now')
      WHERE status = 'hold_not_logged_in'
    `).run();
    return result.changes;
  },

  /**
   * Manually retries a failed item by resetting it to 'pending' with retry_count = 0.
   */
  retryItem(id: number): boolean {
    const result = db.prepare(`
      UPDATE whatsapp_send_queue
      SET status = 'pending',
          retry_count = 0,
          next_retry_at = NULL,
          error_message = NULL,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(id);
    return result.changes > 0;
  },

  /**
   * Retrieves summary counts for the queue status.
   */
  getQueueStatus(): { pending: number; processing: number; sent: number; failed: number; onHold: number } {
    const rows = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM whatsapp_send_queue
      GROUP BY status
    `).all() as { status: string; count: number }[];

    const stats = { pending: 0, processing: 0, sent: 0, failed: 0, onHold: 0 };
    for (const r of rows) {
      if (r.status === 'pending' || r.status === 'failed_transient') stats.pending += r.count;
      else if (r.status === 'processing') stats.processing += r.count;
      else if (r.status === 'sent') stats.sent += r.count;
      else if (r.status === 'failed_final') stats.failed += r.count;
      else if (r.status === 'hold_not_logged_in') stats.onHold += r.count;
    }
    return stats;
  },

  /**
   * Retrieves recent queue items for auditing or UI status.
   */
  getRecentItems(limit = 20): WhatsAppQueueItem[] {
    return db.prepare(`
      SELECT * FROM whatsapp_send_queue
      ORDER BY id DESC
      LIMIT ?
    `).all(limit) as WhatsAppQueueItem[];
  },

  /**
   * Retrieves a queue item by ID.
   */
  findById(id: number): WhatsAppQueueItem | null {
    const row = db.prepare('SELECT * FROM whatsapp_send_queue WHERE id = ?').get(id) as WhatsAppQueueItem | undefined;
    return row || null;
  },

  /**
   * Resets any items stuck in 'processing' status back to 'pending' on startup.
   */
  resetStuckProcessingItems(): number {
    const res = db.prepare("UPDATE whatsapp_send_queue SET status = 'pending' WHERE status = 'processing'").run();
    if (res.changes > 0) {
      logger.info(`[WhatsApp Queue] Reset ${res.changes} stuck processing items back to pending`);
    }
    return res.changes;
  }
};

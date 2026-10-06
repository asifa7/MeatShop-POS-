// src/modules/inventory/backend/service/physical_audit_service.ts
// Multi-Stage Physical Stock Count & Variance Audit Engine for MeatPOS

import { db, dbManager } from '../../../../core/backend/db';
import { ValidationError, NotFoundError } from '../../../../core/backend/errors';
import { logger, auditLogger } from '../../../../core/backend/logger';
import { authService } from '../../../auth/backend/service/auth_service';
import { inventoryLedgerService } from './inventory_ledger_service';

export type AuditSessionStatus = 
  | 'draft'
  | 'counting'
  | 'submitted'
  | 'reviewed'
  | 'approved'
  | 'applied'
  | 'cancelled';

export type VarianceReasonCode = 
  | 'cutting_loss'
  | 'wastage'
  | 'spoilage'
  | 'measurement_error'
  | 'unrecorded_sale'
  | 'unrecorded_purchase'
  | 'other';

export interface AuditCountItemInput {
  product_variant_id: number;
  counted_quantity: number;
  reason_code?: VarianceReasonCode;
  notes?: string;
}

export class PhysicalAuditService {
  /**
   * Create a new Physical Stock Count Session (starts in 'draft')
   */
  public createSession(input: {
    storage_location_id?: number | null;
    notes?: string;
    branch_id?: number;
  }): { session_id: number; session_number: string } {
    authService.requireRole(['ADMIN', 'MANAGER', 'CASHIER']);
    const userId = authService.getCurrentUserId() || 1;
    const branchId = input.branch_id || 1;

    const cleanDate = new Date().toISOString().slice(0, 10).replace(/[^0-9]/g, '');
    const countRow = db.prepare(`SELECT COUNT(*) as c FROM physical_stock_audit_sessions WHERE date(created_at) = date('now')`).get() as any;
    const seq = String((countRow?.c || 0) + 1).padStart(3, '0');
    const sessionNumber = `AUD-${cleanDate}-${seq}`;

    const res = db.prepare(`
      INSERT INTO physical_stock_audit_sessions (
        session_number, status, branch_id, storage_location_id,
        counted_by, notes, created_at
      ) VALUES (?, 'draft', ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      sessionNumber,
      branchId,
      input.storage_location_id || null,
      userId,
      input.notes || null
    );

    const sessionId = Number(res.lastInsertRowid);

    // Pre-populate items from active tracked products
    const variants = db.prepare(`
      SELECT pv.id as variant_id, p.unit_type,
             COALESCE(sl.quantity_grams, 0) as system_grams,
             COALESCE(sl.quantity_units, 0) as system_units,
             COALESCE(pv.last_purchase_cost_paise, pv.unit_cost_paise_cache, pv.last_purchase_cost, pv.cost_price_paise_per_unit, 0) as unit_cost_paise
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      LEFT JOIN stock_ledger sl ON sl.product_variant_id = pv.id
      WHERE pv.is_active = 1 AND p.is_active = 1 AND p.is_inventory_tracked = 1
    `).all() as any[];

    const insertItemStmt = db.prepare(`
      INSERT INTO physical_stock_audit_items (
        session_id, product_variant_id, unit_type,
        system_quantity_grams, system_quantity_units,
        counted_quantity_grams, counted_quantity_units,
        variance_grams, variance_units,
        unit_cost_paise, variance_value_paise
      ) VALUES (?, ?, ?, ?, ?, NULL, NULL, 0, 0, ?, 0)
    `);

    for (const v of variants) {
      insertItemStmt.run(
        sessionId,
        v.variant_id,
        v.unit_type,
        v.unit_type === 'weight' ? v.system_grams : null,
        v.unit_type !== 'weight' ? v.system_units : null,
        v.unit_cost_paise
      );
    }

    return { session_id: sessionId, session_number: sessionNumber };
  }

  /**
   * Save count inputs into session (moves status to 'counting')
   */
  public saveCounts(sessionId: number, items: AuditCountItemInput[]): void {
    const session = db.prepare('SELECT * FROM physical_stock_audit_sessions WHERE id = ?').get(sessionId) as any;
    if (!session) throw new NotFoundError('Audit session not found');
    if (session.status === 'applied' || session.status === 'cancelled') {
      throw new ValidationError(`Cannot update counts on ${session.status} session`);
    }

    dbManager.transaction(() => {
      for (const item of items) {
        const existing = db.prepare('SELECT * FROM physical_stock_audit_items WHERE session_id = ? AND product_variant_id = ?').get(sessionId, item.product_variant_id) as any;
        if (!existing) continue;

        const isWeight = existing.unit_type === 'weight';
        const countedGrams = isWeight ? Math.round(item.counted_quantity * 1000) : null;
        const countedUnits = !isWeight ? Math.round(item.counted_quantity) : null;

        const sysGrams = existing.system_quantity_grams ?? 0;
        const sysUnits = existing.system_quantity_units ?? 0;

        const varGrams = isWeight ? (countedGrams! - sysGrams) : 0;
        const varUnits = !isWeight ? (countedUnits! - sysUnits) : 0;

        const costPaise = existing.unit_cost_paise || 0;
        const varValuePaise = isWeight 
          ? Math.round((varGrams / 1000.0) * costPaise)
          : (varUnits * costPaise);

        db.prepare(`
          UPDATE physical_stock_audit_items SET
            counted_quantity_grams = ?,
            counted_quantity_units = ?,
            variance_grams = ?,
            variance_units = ?,
            variance_value_paise = ?,
            reason_code = ?,
            notes = ?
          WHERE id = ?
        `).run(
          countedGrams,
          countedUnits,
          varGrams,
          varUnits,
          varValuePaise,
          item.reason_code || null,
          item.notes || null,
          existing.id
        );
      }

      if (session.status === 'draft') {
        db.prepare("UPDATE physical_stock_audit_sessions SET status = 'counting' WHERE id = ?").run(sessionId);
      }
    });
  }

  /**
   * Submit count session (locks from further cashier edits)
   */
  public submitSession(sessionId: number): void {
    const session = db.prepare('SELECT * FROM physical_stock_audit_sessions WHERE id = ?').get(sessionId) as any;
    if (!session) throw new NotFoundError('Audit session not found');
    if (!['draft', 'counting'].includes(session.status)) {
      throw new ValidationError(`Session cannot be submitted from status '${session.status}'`);
    }

    // Compute totals
    const sumRow = db.prepare(`
      SELECT 
        COUNT(CASE WHEN counted_quantity_grams IS NOT NULL OR counted_quantity_units IS NOT NULL THEN 1 END) as total_counted,
        SUM(COALESCE(variance_grams, 0)) as total_var_grams,
        SUM(COALESCE(variance_units, 0)) as total_var_units,
        SUM(COALESCE(variance_value_paise, 0)) as total_var_paise
      FROM physical_stock_audit_items
      WHERE session_id = ?
    `).get(sessionId) as any;

    db.prepare(`
      UPDATE physical_stock_audit_sessions SET
        status = 'submitted',
        submitted_at = CURRENT_TIMESTAMP,
        total_items_counted = ?,
        total_variance_grams = ?,
        total_variance_units = ?,
        total_variance_value_paise = ?
      WHERE id = ?
    `).run(
      sumRow?.total_counted || 0,
      sumRow?.total_var_grams || 0,
      sumRow?.total_var_units || 0,
      sumRow?.total_var_paise || 0,
      sessionId
    );
  }

  /**
   * Supervisor Review
   */
  public reviewSession(sessionId: number): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const userId = authService.getCurrentUserId() || 1;

    const session = db.prepare('SELECT * FROM physical_stock_audit_sessions WHERE id = ?').get(sessionId) as any;
    if (!session) throw new NotFoundError('Audit session not found');
    if (session.status !== 'submitted') {
      throw new ValidationError(`Session must be 'submitted' before review, currently '${session.status}'`);
    }

    db.prepare("UPDATE physical_stock_audit_sessions SET status = 'reviewed', reviewed_by = ? WHERE id = ?")
      .run(userId, sessionId);
  }

  /**
   * Manager Approval
   */
  public approveSession(sessionId: number): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const userId = authService.getCurrentUserId() || 1;

    const session = db.prepare('SELECT * FROM physical_stock_audit_sessions WHERE id = ?').get(sessionId) as any;
    if (!session) throw new NotFoundError('Audit session not found');
    if (!['submitted', 'reviewed'].includes(session.status)) {
      throw new ValidationError(`Session must be reviewed or submitted before approval, currently '${session.status}'`);
    }

    db.prepare("UPDATE physical_stock_audit_sessions SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(userId, sessionId);
  }

  /**
   * Final Application: atomically posts adjustments to unified inventory ledger
   */
  public applySession(sessionId: number): { appliedCount: number; timestamp: string } {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const userId = authService.getCurrentUserId() || 1;

    const session = db.prepare('SELECT * FROM physical_stock_audit_sessions WHERE id = ?').get(sessionId) as any;
    if (!session) throw new NotFoundError('Audit session not found');
    if (session.status !== 'approved') {
      throw new ValidationError(`Only 'approved' sessions can be applied. Current status: '${session.status}'`);
    }

    const items = db.prepare('SELECT * FROM physical_stock_audit_items WHERE session_id = ?').all(sessionId) as any[];
    let appliedCount = 0;
    const nowIso = new Date().toISOString();

    dbManager.transaction(() => {
      for (const it of items) {
        const hasCount = it.counted_quantity_grams !== null || it.counted_quantity_units !== null;
        if (!hasCount) continue;

        const isWeight = it.unit_type === 'weight';
        const varGrams = isWeight ? it.variance_grams : null;
        const varUnits = !isWeight ? it.variance_units : null;

        if ((isWeight && varGrams === 0) || (!isWeight && varUnits === 0)) {
          continue;
        }

        // Post to unified inventory_ledger
        inventoryLedgerService.recordMovement({
          product_variant_id: it.product_variant_id,
          branch_id: session.branch_id || 1,
          action_type: 'PHYSICAL_COUNT_ADJUSTMENT',
          quantity_grams: varGrams,
          quantity_units: varUnits,
          unit_cost_paise: it.unit_cost_paise || 0,
          reference_type: 'stock_audit',
          reference_id: session.id,
          reference_number: session.session_number,
          reason_code: it.reason_code || 'measurement_error',
          notes: `Physical Audit #${session.session_number}: ${it.reason_code || 'Variance'} - ${it.notes || ''}`,
          created_by: userId,
        });

        appliedCount++;
      }

      db.prepare(`
        UPDATE physical_stock_audit_sessions SET
          status = 'applied',
          applied_by = ?,
          applied_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId, sessionId);

      // Record last physical count date in metadata
      const { stockLedgerRepository } = require('../repository/stock_ledger_repository');
      stockLedgerRepository.setMetadata('last_physical_count_at', nowIso);
    });

    return { appliedCount, timestamp: nowIso };
  }

  /**
   * Get single session details and all counted items
   */
  public getSession(sessionId: number): any {
    const session = db.prepare(`
      SELECT s.*, 
             u1.full_name as counter_name,
             u2.full_name as reviewer_name,
             u3.full_name as approver_name,
             loc.name as location_name
      FROM physical_stock_audit_sessions s
      LEFT JOIN users u1 ON s.counted_by = u1.id
      LEFT JOIN users u2 ON s.reviewed_by = u2.id
      LEFT JOIN users u3 ON s.approved_by = u3.id
      LEFT JOIN storage_locations loc ON s.storage_location_id = loc.id
      WHERE s.id = ?
    `).get(sessionId) as any;

    if (!session) throw new NotFoundError('Session not found');

    const items = db.prepare(`
      SELECT it.*, pv.variant_name, p.name as product_name, p.product_code, p.category
      FROM physical_stock_audit_items it
      JOIN product_variants pv ON it.product_variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      WHERE it.session_id = ?
      ORDER BY p.category ASC, p.name ASC, pv.variant_name ASC
    `).all(sessionId) as any[];

    return {
      session,
      items: items.map(i => ({
        ...i,
        system_quantity: i.unit_type === 'weight' ? (i.system_quantity_grams / 1000) : i.system_quantity_units,
        counted_quantity: i.unit_type === 'weight' 
          ? (i.counted_quantity_grams !== null ? (i.counted_quantity_grams / 1000) : null)
          : i.counted_quantity_units,
        variance_quantity: i.unit_type === 'weight' ? (i.variance_grams / 1000) : i.variance_units,
      }))
    };
  }

  /**
   * List all audit sessions
   */
  public listSessions(): any[] {
    return db.prepare(`
      SELECT s.*, 
             u.full_name as counter_name,
             loc.name as location_name
      FROM physical_stock_audit_sessions s
      LEFT JOIN users u ON s.counted_by = u.id
      LEFT JOIN storage_locations loc ON s.storage_location_id = loc.id
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT 100
    `).all() as any[];
  }
}

export const physicalAuditService = new PhysicalAuditService();

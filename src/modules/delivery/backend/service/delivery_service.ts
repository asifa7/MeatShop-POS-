// delivery_service.ts
// Comprehensive Domain Service for MeatPOS Delivery Module V1

import { db } from '../../../../core/backend/db';
import {
  DeliveryOrder,
  CreateDeliveryInput,
  DeliveryStatus,
  DeliveryDriver,
  DeliveryZone,
  DeliveryAttempt,
  DeliveryStatusHistory,
  DeliveryCODReconciliation,
  DeliveryStats,
  DeliveryFilterState,
  DeliveryException
} from '../../types/delivery.types';
import { addressService } from './address_service';
import { creditService } from '../../../customers/backend/service/credit_service';

export class DeliveryService {
  private get db() {
    return db;
  }

  // ─── 1. State Machine Transition Validation ──────────────────────────────────
  private static readonly VALID_FORWARD_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
    order_created: ['pending', 'preparing', 'assigned', 'out_for_delivery', 'delivered', 'cancelled'],
    pending: ['preparing', 'ready_for_dispatch', 'assigned', 'out_for_delivery', 'delivered', 'cancelled'],
    preparing: ['ready_for_dispatch', 'assigned', 'out_for_delivery', 'delivered', 'cancelled'],
    ready_for_dispatch: ['assigned', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled'],
    assigned: ['picked_up', 'out_for_delivery', 'delivered', 'rescheduled', 'cancelled'],
    picked_up: ['out_for_delivery', 'delivered', 'arrived', 'failed', 'rescheduled', 'cancelled'],
    out_for_delivery: ['arrived', 'delivered', 'failed', 'rescheduled', 'returned', 'cancelled'],
    arrived: ['delivered', 'failed', 'rescheduled', 'returned', 'cancelled'],
    delivered: ['pending', 'out_for_delivery'], // allow quick toggle/revert
    failed: ['pending', 'assigned', 'delivered', 'rescheduled', 'returned', 'cancelled'],
    rescheduled: ['pending', 'preparing', 'assigned', 'delivered', 'cancelled'],
    returned: ['pending', 'delivered', 'cancelled'],
    cancelled: ['pending'],
  };

  public canTransition(currentStatus: DeliveryStatus, nextStatus: DeliveryStatus, userRole?: string): { allowed: boolean; isOverride: boolean; message?: string } {
    if (currentStatus === nextStatus) {
      return { allowed: true, isOverride: false };
    }

    // Direct transition to delivered or reverting from delivered is always permitted in shop POS
    if (nextStatus === 'delivered' || (currentStatus === 'delivered' && ['pending', 'out_for_delivery'].includes(nextStatus))) {
      return { allowed: true, isOverride: false };
    }

    const allowedNext = DeliveryService.VALID_FORWARD_TRANSITIONS[currentStatus] || [];
    if (allowedNext.includes(nextStatus)) {
      return { allowed: true, isOverride: false };
    }

    // Role-based override check (Admin & Manager can override backwards)
    const normalizedRole = (userRole || '').toUpperCase();
    if (normalizedRole === 'ADMIN' || normalizedRole === 'MANAGER' || normalizedRole === 'CASHIER') {
      return {
        allowed: true,
        isOverride: true,
        message: `Override from ${currentStatus} to ${nextStatus}`
      };
    }

    return {
      allowed: true, // Gracefully permit for local shop operations
      isOverride: true,
      message: `Direct state change from "${currentStatus}" to "${nextStatus}"`
    };
  }

  // ─── 2. Delivery Order Generation (Flow A & Flow B) ──────────────────────────
  public createDeliveryOrder(input: CreateDeliveryInput, userId: number = 1): DeliveryOrder {
    return this.db.transaction(() => {
      // 1. Resolve Customer ID (fallback to customer 1 for walk-ins)
      let customerId = input.customer_id;
      if (!customerId || customerId <= 0) {
        customerId = 1;
      }

      let customerName = (input.customer_name ?? '').trim();
      let customerPhone = (input.customer_phone ?? '').trim();
      let deliveryAddressSnapshot = (input.delivery_address_snapshot || input.delivery_notes || input.customer_notes || '').trim();

      // If customerId is a specific customer (> 1) and details were not provided, lookup from customer table
      if (customerId > 1 && (!customerName || !customerPhone)) {
        try {
          const cust = this.db.prepare('SELECT name, phone, phone2, whatsapp FROM customers WHERE id = ?').get(customerId) as any;
          if (cust) {
            if (!customerName) customerName = (cust.name || '').trim();
            if (!customerPhone) customerPhone = (cust.whatsapp || cust.phone || cust.phone2 || '').trim();
          }
        } catch (e) {}
      }

      // 1b. Resolve or create customer address
      let addressId = input.customer_address_id;
      if (!addressId && input.new_address && input.new_address.area && input.new_address.pincode) {
        try {
          const savedAddress = addressService.createAddress({
            ...input.new_address,
            customer_id: customerId,
            area: input.new_address.area!,
            pincode: input.new_address.pincode!,
          });
          addressId = savedAddress.id;
        } catch (e) {}
      } else if (!addressId && customerId && customerId > 1) {
        try {
          const defaultAddr = addressService.getDefaultAddress(customerId);
          if (defaultAddr) addressId = defaultAddr.id;
        } catch (e) {}
      }

      // 2. Resolve Zone & Calculate Delivery Fee
      const zone = input.zone_id ? this.getZoneById(input.zone_id) : this.getDefaultZone();
      const zoneId = zone?.id || 1;

      // 3. Resolve Invoice & Payment Breakdown
      let invoiceId = input.invoice_id;
      let subtotalPaise = input.subtotal_paise || 0;
      let totalPaise = input.total_paise || 0;
      let invoiceNumber = input.invoice_number;
      let amountPaidNowPaise = input.amount_paid_now_paise !== undefined ? input.amount_paid_now_paise : 0;
      let amountPendingPaise = input.amount_pending_paise !== undefined ? input.amount_pending_paise : 0;
      let detectedPaymentMethod = input.payment_method || 'cash';

      if (invoiceId) {
        try {
          const inv = this.db.prepare('SELECT id, total_paise, subtotal_paise, invoice_number, payment_status FROM invoices WHERE id = ?').get(invoiceId) as any;
          if (inv) {
            subtotalPaise = inv.subtotal_paise || subtotalPaise;
            totalPaise = inv.total_paise || totalPaise;
            invoiceNumber = inv.invoice_number || invoiceNumber;

            // Direct payments made at billing time
            const pRows = this.db.prepare('SELECT method, amount_paise FROM payments WHERE invoice_id = ?').all(invoiceId) as { method: string; amount_paise: number }[];
            const paidDirectPaise = pRows.reduce((sum, r) => sum + (r.amount_paise || 0), 0);

            // Allocated payments from customer ledger
            let allocPaise = 0;
            try {
              const aRow = this.db.prepare('SELECT COALESCE(SUM(allocated_paise), 0) as alloc_paise FROM customer_payment_allocations WHERE invoice_id = ?').get(invoiceId) as { alloc_paise: number };
              allocPaise = aRow?.alloc_paise || 0;
            } catch (e) {}

            const totalPaidPaise = paidDirectPaise + allocPaise;
            if (input.amount_paid_now_paise === undefined) {
              amountPaidNowPaise = totalPaidPaise;
            }
            if (input.amount_pending_paise === undefined) {
              amountPendingPaise = Math.max(0, (inv.total_paise || 0) - amountPaidNowPaise);
            }

            // Determine accurate payment_method
            if (amountPendingPaise > 0 && amountPaidNowPaise > 0) {
              detectedPaymentMethod = 'split';
            } else if (amountPendingPaise > 0 && amountPaidNowPaise === 0) {
              detectedPaymentMethod = (input.payment_method === 'credit' || inv.payment_status === 'unpaid') ? 'credit' : (input.payment_method || 'credit');
            } else {
              const distinctMethods = Array.from(new Set(pRows.map(r => r.method).filter(Boolean)));
              if (distinctMethods.length > 1) {
                detectedPaymentMethod = 'split';
              } else if (distinctMethods.length === 1) {
                detectedPaymentMethod = distinctMethods[0];
              } else {
                detectedPaymentMethod = input.payment_method || 'cash';
              }
            }
          }
        } catch (e) {}
      }

      // Determine delivery charge
      let deliveryChargePaise = input.delivery_charge_paise ?? 0;

      // 4. Generate Unique Delivery Number (e.g. DEL-20260901-0001)
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const countRow = this.db.prepare(`
        SELECT COUNT(*) as count FROM deliveries 
        WHERE delivery_number LIKE ?
      `).get(`DEL-${todayStr}-%`) as { count: number };
      const nextSeq = String((countRow?.count || 0) + 1).padStart(4, '0');
      const deliveryNumber = `DEL-${todayStr}-${nextSeq}`;

      // 5. Generate 4-digit OTP for delivery confirmation
      const otpCode = Math.floor(1000 + Math.random() * 9000).toString();

      const requestedDate = input.requested_date || new Date().toISOString().slice(0, 10);
      const deliveryType = input.delivery_type || 'immediate';
      const priority = input.priority || 'normal';

      // Payment Status: New delivery orders start with payment_received = 0 (unless explicitly passed as 1 or true).
      // Delivery tickets move Open -> Payment Pending (on delivered) -> Closed (on payment received/cashier close).
      const paymentReceived = (input.payment_received === 1 || (input.payment_received as any) === true) ? 1 : 0;

      const paymentReceivedAt = paymentReceived === 1 ? new Date().toISOString() : null;
      const paymentReceivedBy = paymentReceived === 1 ? userId : null;
      const paymentStatus = paymentReceived === 1 ? 'paid' : (amountPendingPaise > 0 ? (amountPaidNowPaise > 0 ? 'partial' : 'unpaid') : 'cod_pending');
      const paymentMethod = detectedPaymentMethod;
      const isCOD = paymentStatus === 'cod_pending' || paymentStatus === 'unpaid';
      const finalTotalPaise = totalPaise + deliveryChargePaise;
      const codExpectedPaise = paymentReceived === 1 ? 0 : amountPendingPaise;
      const codCollectedPaise = paymentReceived === 1 ? finalTotalPaise : amountPaidNowPaise;

      // Ticket status initially is always 'pending'
      const initialStatus = 'pending';
      const delivered = 0;
      const deliveredAt = null;
      const deliveredBy = null;

      // 6. Insert Delivery Record
      const stmt = this.db.prepare(`
        INSERT INTO deliveries (
          delivery_number, order_id, invoice_id, customer_id,
          customer_name, customer_phone, delivery_address_snapshot,
          customer_address_id, zone_id, driver_id, delivery_type,
          priority, status, requested_date, time_slot_start,
          time_slot_end, subtotal_paise, delivery_charge_paise,
          discount_paise, total_paise, payment_method, payment_status,
          amount_paid_now_paise, amount_pending_paise,
          cod_expected_paise, cod_collected_paise, cod_variance_paise,
          cod_reconciled, otp_code, otp_verified, special_prep_instructions,
          customer_notes, internal_notes, estimated_minutes, scheduled_at,
          delivered, delivered_at, delivered_by,
          payment_received, payment_received_at, payment_received_by,
          created_by
        ) VALUES (
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?
        )
      `);

      const result = stmt.run(
        deliveryNumber,
        input.invoice_id || null,
        invoiceId || 0,
        customerId,
        customerName,
        customerPhone,
        deliveryAddressSnapshot,
        addressId || null,
        zoneId,
        input.driver_id || null,
        deliveryType,
        priority,
        initialStatus,
        requestedDate,
        input.time_slot_start || null,
        input.time_slot_end || null,
        subtotalPaise,
        deliveryChargePaise,
        0,
        finalTotalPaise,
        paymentMethod,
        paymentStatus,
        amountPaidNowPaise,
        amountPendingPaise,
        codExpectedPaise,
        codCollectedPaise,
        0,
        0,
        otpCode,
        0,
        input.special_prep_instructions || null,
        deliveryAddressSnapshot || input.customer_notes || null,
        input.internal_notes || null,
        zone?.estimated_minutes || 45,
        deliveryType === 'scheduled' ? `${requestedDate} ${input.time_slot_start || '10:00'}:00` : null,
        delivered,
        deliveredAt,
        deliveredBy,
        paymentReceived,
        paymentReceivedAt,
        paymentReceivedBy,
        userId
      );

      const deliveryId = Number(result.lastInsertRowid);

      // 7. Update Invoice with Delivery linkage & surcharge
      if (invoiceId && invoiceId > 0) {
        try {
          this.db.prepare(`
            UPDATE invoices SET
              is_delivery = 1,
              delivery_charge_paise = ?,
              delivery_id = ?
            WHERE id = ?
          `).run(deliveryChargePaise, deliveryId, invoiceId);
        } catch (e) {}
      }

      // 8. Log initial state in delivery_status_history
      try {
        this.db.prepare(`
          INSERT INTO delivery_status_history (
            delivery_id, from_status, to_status, changed_by, reason, notes
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          deliveryId,
          null,
          input.driver_id ? 'assigned' : 'pending',
          userId,
          'Delivery order created',
          `Linked to Invoice #${invoiceNumber || invoiceId}`
        );
      } catch (e) {}

      // 9. Update driver status if assigned
      if (input.driver_id) {
        try {
          this.db.prepare(`
            UPDATE delivery_drivers SET status = 'assigned', updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `).run(input.driver_id);
        } catch (e) {}
      }

      return this.getDeliveryById(deliveryId)!;
    })();
  }

  // ─── 3. Strict State Transition Method ───────────────────────────────────────
  public updateDeliveryStatus(
    deliveryId: number,
    newStatus: DeliveryStatus,
    userId: number = 1,
    userRole: string = 'ADMIN',
    reason?: string,
    notes?: string
  ): DeliveryOrder {
    return this.db.transaction(() => {
      const current = this.getDeliveryById(deliveryId);
      if (!current) {
        throw new Error(`Delivery order #${deliveryId} not found.`);
      }

      const check = this.canTransition(current.status, newStatus, userRole);
      if (!check.allowed) {
        throw new Error(check.message || `Cannot transition from ${current.status} to ${newStatus}`);
      }

      // Timestamps & actual duration calculations
      let dispatchedAt = current.dispatched_at;
      let deliveredAt = current.delivered_at;
      let cancelledAt = current.cancelled_at;
      let actualPrepMinutes = current.actual_prep_minutes;
      let actualDeliveryMinutes = current.actual_delivery_minutes;

      const now = new Date().toISOString();

      if (newStatus === 'picked_up' || newStatus === 'out_for_delivery') {
        if (!dispatchedAt) dispatchedAt = now;
        if (current.created_at) {
          actualPrepMinutes = Math.max(1, Math.round((new Date(now).getTime() - new Date(current.created_at).getTime()) / 60000));
        }
      }

      if (newStatus === 'delivered') {
        deliveredAt = now;
        if (dispatchedAt) {
          actualDeliveryMinutes = Math.max(1, Math.round((new Date(now).getTime() - new Date(dispatchedAt).getTime()) / 60000));
        }
      }

      if (newStatus === 'cancelled') {
        cancelledAt = now;
      }

      // Update Delivery Record
      this.db.prepare(`
        UPDATE deliveries SET
          status = ?,
          dispatched_at = ?,
          delivered_at = ?,
          cancelled_at = ?,
          actual_prep_minutes = ?,
          actual_delivery_minutes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        newStatus,
        dispatchedAt || null,
        deliveredAt || null,
        cancelledAt || null,
        actualPrepMinutes || null,
        actualDeliveryMinutes || null,
        deliveryId
      );

      // Record in history log
      this.db.prepare(`
        INSERT INTO delivery_status_history (
          delivery_id, from_status, to_status, changed_by, reason, notes
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        deliveryId,
        current.status,
        newStatus,
        userId,
        reason || (check.isOverride ? check.message : 'Status changed in workflow'),
        notes || null
      );

      // Audit Log entry
      this.db.prepare(`
        INSERT INTO audit_logs (
          user_id, action, details
        ) VALUES (?, ?, ?)
      `).run(
        userId,
        'UPDATE_DELIVERY_STATUS',
        JSON.stringify({ entity_type: 'delivery', entity_id: deliveryId, from: current.status, to: newStatus, isOverride: check.isOverride, reason: reason || 'Status transition' })
      );

      return this.getDeliveryById(deliveryId)!;
    })();
  }

  // ─── 4. Driver Assignment & Management ───────────────────────────────────────
  public assignDriver(deliveryId: number, driverId: number, userId: number = 1): DeliveryOrder {
    return this.db.transaction(() => {
      const delivery = this.getDeliveryById(deliveryId);
      if (!delivery) throw new Error(`Delivery #${deliveryId} not found.`);

      const driver = this.getDriverById(driverId);
      if (!driver) throw new Error(`Driver #${driverId} not found.`);
      if (!driver.is_active) throw new Error(`Driver ${driver.name} is currently marked inactive.`);

      // Check driver capacity
      const activeCount = this.getActiveDeliveriesForDriver(driverId);
      if (activeCount >= driver.max_concurrent_orders) {
        throw new Error(`Driver ${driver.name} already has ${activeCount} active orders (Max: ${driver.max_concurrent_orders}).`);
      }

      this.db.prepare(`
        UPDATE deliveries SET
          driver_id = ?,
          status = CASE WHEN status IN ('pending', 'order_created', 'preparing', 'ready_for_dispatch') THEN 'assigned' ELSE status END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(driverId, deliveryId);

      this.db.prepare(`
        UPDATE delivery_drivers SET status = 'assigned', updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(driverId);

      this.db.prepare(`
        INSERT INTO delivery_status_history (
          delivery_id, from_status, to_status, changed_by, reason, notes
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        deliveryId,
        delivery.status,
        delivery.status === 'pending' || delivery.status === 'ready_for_dispatch' ? 'assigned' : delivery.status,
        userId,
        'Driver assigned',
        `Assigned to driver: ${driver.name} (${driver.vehicle_number || driver.phone})`
      );

      return this.getDeliveryById(deliveryId)!;
    })();
  }

  // ─── 5. Delivery Attempt Logging ─────────────────────────────────────────────
  public recordDeliveryAttempt(deliveryId: number, attemptInput: Partial<DeliveryAttempt>, userId: number = 1): DeliveryAttempt {
    return this.db.transaction(() => {
      const delivery = this.getDeliveryById(deliveryId);
      if (!delivery) throw new Error(`Delivery #${deliveryId} not found.`);

      const currentAttempts = this.getDeliveryAttempts(deliveryId);
      const attemptNumber = currentAttempts.length + 1;

      const stmt = this.db.prepare(`
        INSERT INTO delivery_attempts (
          delivery_id, attempt_number, driver_id, started_at,
          arrived_at, completed_at, result, failure_reason_code, notes
        ) VALUES (
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?
        )
      `);

      const startedAt = attemptInput.started_at || new Date().toISOString();
      const completedAt = attemptInput.completed_at || new Date().toISOString();
      const result = attemptInput.result || 'failed';

      stmt.run(
        deliveryId,
        attemptNumber,
        attemptInput.driver_id || delivery.driver_id || null,
        startedAt,
        attemptInput.arrived_at || null,
        completedAt,
        result,
        attemptInput.failure_reason_code || null,
        attemptInput.notes || null
      );

      // Auto update delivery status based on attempt result
      if (result === 'success') {
        this.updateDeliveryStatus(deliveryId, 'delivered', userId, 'ADMIN', 'Delivery attempt succeeded');
      } else if (result === 'rescheduled') {
        this.updateDeliveryStatus(deliveryId, 'rescheduled', userId, 'ADMIN', `Attempt #${attemptNumber} rescheduled: ${attemptInput.failure_reason_code || ''}`);
      } else if (result === 'failed' || result === 'customer_unavailable' || result === 'rejected' || result === 'wrong_address') {
        this.updateDeliveryStatus(deliveryId, 'failed', userId, 'ADMIN', `Attempt #${attemptNumber} failed: ${attemptInput.failure_reason_code || result}`);
      }

      return this.getDeliveryAttempts(deliveryId).pop()!;
    })();
  }

  // ─── 6. OTP Delivery Verification ───────────────────────────────────────────
  public verifyDeliveryOTP(deliveryId: number, enteredOTP: string, userId: number = 1): { success: boolean; message: string } {
    const delivery = this.getDeliveryById(deliveryId);
    if (!delivery) throw new Error(`Delivery #${deliveryId} not found.`);

    if (!delivery.otp_code) {
      // If no OTP configured, allow direct confirmation
      this.updateDeliveryStatus(deliveryId, 'delivered', userId);
      return { success: true, message: 'Delivery completed (No OTP required).' };
    }

    if (delivery.otp_code.trim() === enteredOTP.trim()) {
      this.db.prepare('UPDATE deliveries SET otp_verified = 1 WHERE id = ?').run(deliveryId);
      this.updateDeliveryStatus(deliveryId, 'delivered', userId, 'ADMIN', 'OTP verified successfully');
      return { success: true, message: 'OTP verified. Delivery marked as Delivered.' };
    } else {
      return { success: false, message: 'Incorrect 4-digit OTP. Please ask the customer for the verification code.' };
    }
  }

  // ─── 7. COD Tracking & Shift Reconciliation ──────────────────────────────────
  public recordCODCollection(deliveryId: number, collectedPaise: number, userId: number = 1): DeliveryOrder {
    return this.db.transaction(() => {
      const delivery = this.getDeliveryById(deliveryId);
      if (!delivery) throw new Error(`Delivery #${deliveryId} not found.`);

      const expected = delivery.cod_expected_paise || delivery.total_paise;
      const variance = collectedPaise - expected;

      this.db.prepare(`
        UPDATE deliveries SET
          cod_collected_paise = ?,
          cod_variance_paise = ?,
          payment_status = CASE WHEN ? >= ? THEN 'paid' ELSE 'partial' END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(collectedPaise, variance, collectedPaise, expected, deliveryId);

      this.db.prepare(`
        INSERT INTO audit_logs (
          user_id, action, details
        ) VALUES (?, ?, ?)
      `).run(
        userId,
        'RECORD_DELIVERY_COD',
        JSON.stringify({ entity_type: 'delivery', entity_id: deliveryId, expected, collected: collectedPaise, variance, notes: 'COD payment collected by driver' })
      );

      return this.getDeliveryById(deliveryId)!;
    })();
  }

  public reconcileDriverShiftCOD(
    driverId: number,
    shiftId: number | null,
    userId: number = 1,
    notes?: string
  ): DeliveryCODReconciliation {
    return this.db.transaction(() => {
      const driver = this.getDriverById(driverId);
      if (!driver) throw new Error(`Driver #${driverId} not found.`);

      // Query all unreconciled completed COD deliveries for this driver
      const deliveries = this.db.prepare(`
        SELECT * FROM deliveries
        WHERE driver_id = ?
          AND payment_method = 'cod'
          AND status = 'delivered'
          AND cod_reconciled = 0
      `).all(driverId) as DeliveryOrder[];

      const totalDeliveries = deliveries.length;
      let totalExpectedPaise = 0;
      let totalCollectedPaise = 0;
      let totalVariancePaise = 0;

      for (const d of deliveries) {
        const exp = d.cod_expected_paise || d.total_paise;
        const col = d.cod_collected_paise;
        totalExpectedPaise += exp;
        totalCollectedPaise += col;
        totalVariancePaise += (col - exp);
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      const reconSeq = String(Math.floor(1000 + Math.random() * 9000));
      const reconNumber = `RECON-${todayStr.replace(/-/g, '')}-${reconSeq}`;

      const stmt = this.db.prepare(`
        INSERT INTO delivery_cod_reconciliation (
          reconciliation_number, driver_id, shift_id, reconciliation_date,
          total_deliveries, total_expected_paise, total_collected_paise,
          total_variance_paise, status, notes, verified_by
        ) VALUES (
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?
        )
      `);

      const result = stmt.run(
        reconNumber,
        driverId,
        shiftId,
        todayStr,
        totalDeliveries,
        totalExpectedPaise,
        totalCollectedPaise,
        totalVariancePaise,
        totalVariancePaise === 0 ? 'verified' : 'open',
        notes || null,
        userId
      );

      // Mark deliveries as reconciled
      this.db.prepare(`
        UPDATE deliveries SET cod_reconciled = 1, updated_at = CURRENT_TIMESTAMP
        WHERE driver_id = ?
          AND payment_method = 'cod'
          AND status = 'delivered'
          AND cod_reconciled = 0
      `).run(driverId);

      return this.db.prepare(`
        SELECT r.*, d.name as driver_name, u.username as verified_by_name
        FROM delivery_cod_reconciliation r
        JOIN delivery_drivers d ON r.driver_id = d.id
        LEFT JOIN users u ON r.verified_by = u.id
        WHERE r.id = ?
      `).get(Number(result.lastInsertRowid)) as DeliveryCODReconciliation;
    })();
  }

  // ─── 8. Queries & Lookup Helpers ─────────────────────────────────────────────
  public getDeliveryById(id: number): DeliveryOrder | undefined {
    const row = this.db.prepare(`
      SELECT 
        d.*,
        COALESCE(NULLIF(d.customer_name, ''), CASE WHEN c.id > 1 THEN c.name ELSE '' END, '') as customer_name,
        COALESCE(NULLIF(d.customer_phone, ''), CASE WHEN c.id > 1 THEN c.phone ELSE '' END, '') as customer_phone,
        COALESCE(d.delivery_address_snapshot, d.customer_notes, '') as delivery_address_snapshot,
        z.name as zone_name,
        drv.name as driver_name,
        drv.phone as driver_phone,
        drv.vehicle_number as driver_vehicle,
        inv.invoice_number,
        u_del.username as delivered_by_name,
        u_pay.username as payment_received_by_name
      FROM deliveries d
      LEFT JOIN customers c ON d.customer_id = c.id
      LEFT JOIN delivery_zones z ON d.zone_id = z.id
      LEFT JOIN delivery_drivers drv ON d.driver_id = drv.id
      LEFT JOIN invoices inv ON d.invoice_id = inv.id
      LEFT JOIN users u_del ON d.delivered_by = u_del.id
      LEFT JOIN users u_pay ON d.payment_received_by = u_pay.id
      WHERE d.id = ?
    `).get(id) as any;

    if (!row) return undefined;

    const address = row.customer_address_id ? addressService.getAddressById(row.customer_address_id) : null;
    const attempts = this.getDeliveryAttempts(id);
    const history = this.getDeliveryHistory(id);

    return {
      ...row,
      address,
      attempts,
      status_history: history
    };
  }

  public getDeliveryByDeliveryNumber(deliveryNumber: string): DeliveryOrder | undefined {
    const row = this.db.prepare('SELECT id FROM deliveries WHERE delivery_number = ?').get(deliveryNumber) as { id: number } | undefined;
    return row ? this.getDeliveryById(row.id) : undefined;
  }

  public listDeliveries(filters: DeliveryFilterState = {}): DeliveryOrder[] {
    let sql = `
      SELECT 
        d.*,
        COALESCE(NULLIF(d.customer_name, ''), CASE WHEN c.id > 1 THEN c.name ELSE '' END, '') as customer_name,
        COALESCE(NULLIF(d.customer_phone, ''), CASE WHEN c.id > 1 THEN c.phone ELSE '' END, '') as customer_phone,
        COALESCE(d.delivery_address_snapshot, d.customer_notes, '') as delivery_address_snapshot,
        z.name as zone_name,
        drv.name as driver_name,
        drv.phone as driver_phone,
        drv.vehicle_number as driver_vehicle,
        inv.invoice_number,
        u_del.username as delivered_by_name,
        u_pay.username as payment_received_by_name,
        ca.area as address_area,
        ca.latitude,
        ca.longitude,
        ca.door_no,
        ca.building,
        ca.street,
        ca.landmark,
        ca.city,
        ca.pincode,
        ca.label as address_label
      FROM deliveries d
      LEFT JOIN customers c ON d.customer_id = c.id
      LEFT JOIN customer_addresses ca ON d.customer_address_id = ca.id
      LEFT JOIN delivery_zones z ON d.zone_id = z.id
      LEFT JOIN delivery_drivers drv ON d.driver_id = drv.id
      LEFT JOIN invoices inv ON d.invoice_id = inv.id
      LEFT JOIN users u_del ON d.delivered_by = u_del.id
      LEFT JOIN users u_pay ON d.payment_received_by = u_pay.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'delivered' || filters.status === 'completed') {
        sql += " AND (d.delivered = 1 AND (d.payment_received = 1 OR d.payment_status = 'paid'))";
      } else if (filters.status === 'pending') {
        sql += " AND (d.delivered = 0 OR (d.payment_received = 0 AND d.payment_status != 'paid'))";
      } else {
        sql += ' AND d.status = ?';
        params.push(filters.status);
      }
    }
    if (filters.zoneId && filters.zoneId !== 'all') {
      sql += ' AND d.zone_id = ?';
      params.push(Number(filters.zoneId));
    }
    if (filters.driverId && filters.driverId !== 'all') {
      sql += ' AND d.driver_id = ?';
      params.push(Number(filters.driverId));
    }
    if (filters.priority && filters.priority !== 'all') {
      sql += ' AND d.priority = ?';
      params.push(filters.priority);
    }
    if (filters.startDate) {
      sql += ' AND d.requested_date >= ?';
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      sql += ' AND d.requested_date <= ?';
      params.push(filters.endDate);
    }
    if (filters.searchTerm) {
      sql += ' AND (d.delivery_number LIKE ? OR d.customer_name LIKE ? OR c.name LIKE ? OR d.customer_phone LIKE ? OR c.phone LIKE ? OR inv.invoice_number LIKE ? OR d.delivery_address_snapshot LIKE ?)';
      const term = `%${filters.searchTerm}%`;
      params.push(term, term, term, term, term, term, term);
    }

    sql += " ORDER BY (d.priority = 'urgent') DESC, (d.priority = 'high') DESC, d.created_at DESC LIMIT 200";

    const rows = this.db.prepare(sql).all(...params) as any[];

    return rows.map(r => ({
      ...r,
      delivery_address_snapshot: r.delivery_address_snapshot || (r.address_area ? `${r.door_no || ''} ${r.building || ''} ${r.street || ''} ${r.address_area}`.trim() : ''),
      address: r.customer_address_id ? {
        id: r.customer_address_id,
        customer_id: r.customer_id,
        label: r.address_label || 'Home',
        door_no: r.door_no,
        building: r.building,
        street: r.street,
        area: r.address_area || '',
        landmark: r.landmark,
        city: r.city || 'Bengaluru',
        state: 'Karnataka',
        pincode: r.pincode || '',
        latitude: r.latitude,
        longitude: r.longitude,
        is_default: 0,
      } : null
    }));
  }

  public markDelivered(deliveryId: number, isDelivered: boolean = true, userId: number = 1): DeliveryOrder {
    return this.db.transaction(() => {
      const delivery = this.getDeliveryById(deliveryId);
      if (!delivery) throw new Error(`Delivery #${deliveryId} not found.`);

      const delivered = isDelivered ? 1 : 0;
      const deliveredAt = isDelivered ? new Date().toISOString() : null;
      const deliveredBy = isDelivered ? userId : null;

      // Both must be true for ticket to fully close
      const isPaid = Boolean(delivery.payment_received === 1 || delivery.payment_status === 'paid');
      const nextStatus: DeliveryStatus = (delivered === 1 && isPaid) ? 'delivered' : 'pending';

      this.db.prepare(`
        UPDATE deliveries SET
          delivered = ?,
          delivered_at = ?,
          delivered_by = ?,
          status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(delivered, deliveredAt, deliveredBy, nextStatus, deliveryId);

      try {
        this.db.prepare(`
          INSERT INTO delivery_status_history (
            delivery_id, from_status, to_status, changed_by, reason, notes
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          deliveryId,
          delivery.status,
          nextStatus,
          userId,
          isDelivered ? 'Marked delivered' : 'Reverted delivered',
          `Delivered: ${delivered}, Payment: ${isPaid ? 1 : 0}`
        );
      } catch (e) {}

      return this.getDeliveryById(deliveryId)!;
    })();
  }

  public markPaymentReceived(deliveryId: number, isPaid: boolean = true, userId: number = 1): DeliveryOrder {
    return this.db.transaction(() => {
      const delivery = this.getDeliveryById(deliveryId);
      if (!delivery) throw new Error(`Delivery #${deliveryId} not found.`);

      const paymentReceived = isPaid ? 1 : 0;
      const paymentReceivedAt = isPaid ? new Date().toISOString() : null;
      const paymentReceivedBy = isPaid ? userId : null;
      const paymentStatus = isPaid ? 'paid' : ((delivery.amount_pending_paise || 0) > 0 ? ((delivery.amount_paid_now_paise || 0) > 0 ? 'partial' : 'unpaid') : 'cod_pending');
      const collected = isPaid ? (delivery.total_paise || delivery.cod_expected_paise || 0) : 0;

      // Both must be true for ticket to fully close
      const isDelivered = Boolean(delivery.delivered === 1 || delivery.status === 'delivered');
      const nextStatus: DeliveryStatus = (isDelivered && paymentReceived === 1) ? 'delivered' : 'pending';

      const pendingPaise = delivery.amount_pending_paise || 0;
      let newAmountPaidNow = delivery.amount_paid_now_paise || 0;
      let newAmountPending = pendingPaise;

      if (isPaid && pendingPaise > 0) {
        // Settle against customer ledger or invoice payments
        if (delivery.customer_id && delivery.customer_id > 1) {
          try {
            creditService.recordPayment({
              customer_id: delivery.customer_id,
              amount_paise: pendingPaise,
              method: 'cash',
              notes: `Delivery ticket settlement for #${delivery.delivery_number} (Invoice #${delivery.invoice_number || delivery.invoice_id})`
            });
          } catch (e: any) {
            console.error('Failed to record customer credit payment in delivery settlement:', e);
          }
        } else if (delivery.invoice_id) {
          try {
            this.db.prepare(`
              INSERT INTO payments (invoice_id, method, amount_paise, reference_number, received_at)
              VALUES (?, 'cash', ?, ?, CURRENT_TIMESTAMP)
            `).run(delivery.invoice_id, pendingPaise, `Delivery COD collected for #${delivery.delivery_number}`);
          } catch (e: any) {}
        }

        newAmountPaidNow = delivery.total_paise || (newAmountPaidNow + pendingPaise);
        newAmountPending = 0;
      }

      this.db.prepare(`
        UPDATE deliveries SET
          payment_received = ?,
          payment_received_at = ?,
          payment_received_by = ?,
          payment_status = ?,
          amount_paid_now_paise = ?,
          amount_pending_paise = ?,
          cod_collected_paise = ?,
          cod_variance_paise = 0,
          status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        paymentReceived,
        paymentReceivedAt,
        paymentReceivedBy,
        paymentStatus,
        isPaid ? newAmountPaidNow : delivery.amount_paid_now_paise,
        isPaid ? newAmountPending : delivery.amount_pending_paise,
        collected,
        nextStatus,
        deliveryId
      );

      if (delivery.invoice_id && isPaid) {
        try {
          this.db.prepare(`
            UPDATE invoices SET payment_status = 'paid' WHERE id = ?
          `).run(delivery.invoice_id);
        } catch (e) {}
      }

      try {
        this.db.prepare(`
          INSERT INTO delivery_status_history (
            delivery_id, from_status, to_status, changed_by, reason, notes
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          deliveryId,
          delivery.status,
          nextStatus,
          userId,
          isPaid ? 'Payment received' : 'Payment reverted',
          `Delivered: ${isDelivered ? 1 : 0}, Payment: ${paymentReceived}`
        );
      } catch (e) {}

      return this.getDeliveryById(deliveryId)!;
    })();
  }

  public getActiveDeliveriesForMap(): DeliveryOrder[] {
    const sql = `
      SELECT 
        d.*,
        c.name as customer_name,
        c.phone as customer_phone,
        z.name as zone_name,
        drv.name as driver_name,
        drv.phone as driver_phone,
        drv.vehicle_number as driver_vehicle,
        inv.invoice_number,
        ca.area as address_area,
        ca.latitude,
        ca.longitude,
        ca.door_no,
        ca.building,
        ca.street,
        ca.landmark,
        ca.city,
        ca.pincode,
        ca.label as address_label
      FROM deliveries d
      JOIN customers c ON d.customer_id = c.id
      LEFT JOIN customer_addresses ca ON d.customer_address_id = ca.id
      LEFT JOIN delivery_zones z ON d.zone_id = z.id
      LEFT JOIN delivery_drivers drv ON d.driver_id = drv.id
      LEFT JOIN invoices inv ON d.invoice_id = inv.id
      WHERE d.status IN ('pending', 'preparing', 'ready_for_dispatch', 'assigned', 'picked_up', 'out_for_delivery', 'arrived')
      ORDER BY d.created_at DESC
    `;

    const rows = this.db.prepare(sql).all() as any[];
    return rows.map(r => ({
      ...r,
      address: r.customer_address_id ? {
        id: r.customer_address_id,
        customer_id: r.customer_id,
        label: r.address_label || 'Home',
        door_no: r.door_no,
        building: r.building,
        street: r.street,
        area: r.address_area || '',
        landmark: r.landmark,
        city: r.city || 'Bengaluru',
        state: 'Karnataka',
        pincode: r.pincode || '',
        latitude: r.latitude,
        longitude: r.longitude,
        is_default: 0,
      } : null
    }));
  }

  public getDeliveryAttempts(deliveryId: number): DeliveryAttempt[] {
    return this.db.prepare(`
      SELECT a.*, drv.name as driver_name
      FROM delivery_attempts a
      LEFT JOIN delivery_drivers drv ON a.driver_id = drv.id
      WHERE a.delivery_id = ?
      ORDER BY a.attempt_number ASC
    `).all(deliveryId) as DeliveryAttempt[];
  }

  public getDeliveryHistory(deliveryId: number): DeliveryStatusHistory[] {
    return this.db.prepare(`
      SELECT h.*, u.username as changed_by_name
      FROM delivery_status_history h
      LEFT JOIN users u ON h.changed_by = u.id
      WHERE h.delivery_id = ?
      ORDER BY h.created_at ASC
    `).all(deliveryId) as DeliveryStatusHistory[];
  }

  public getActiveDeliveriesForDriver(driverId: number): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) as count FROM deliveries
      WHERE driver_id = ?
        AND status IN ('assigned', 'picked_up', 'out_for_delivery', 'arrived')
    `).get(driverId) as { count: number };
    return row?.count || 0;
  }

  // ─── 9. Driver & Zone CRUD ───────────────────────────────────────────────────
  public getAllDrivers(): DeliveryDriver[] {
    const rows = this.db.prepare(`
      SELECT d.*, 
        (SELECT COUNT(*) FROM deliveries WHERE driver_id = d.id AND status IN ('assigned', 'picked_up', 'out_for_delivery', 'arrived')) as active_deliveries_count
      FROM delivery_drivers d
      ORDER BY d.is_active DESC, d.name ASC
    `).all() as DeliveryDriver[];
    return rows;
  }

  public getDriverById(id: number): DeliveryDriver | undefined {
    return this.db.prepare('SELECT * FROM delivery_drivers WHERE id = ?').get(id) as DeliveryDriver | undefined;
  }

  public createDriver(input: Partial<DeliveryDriver> & { name: string; phone: string }): DeliveryDriver {
    const stmt = this.db.prepare(`
      INSERT INTO delivery_drivers (
        employee_id, name, phone, alternate_phone, vehicle_type,
        vehicle_number, license_number, status, is_active, max_concurrent_orders
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      input.employee_id || null,
      input.name,
      input.phone,
      input.alternate_phone || null,
      input.vehicle_type || 'two_wheeler',
      input.vehicle_number || null,
      input.license_number || null,
      input.status || 'available',
      input.is_active !== undefined ? input.is_active : 1,
      input.max_concurrent_orders || 4
    );

    return this.getDriverById(Number(result.lastInsertRowid))!;
  }

  public updateDriver(id: number, updates: Partial<DeliveryDriver>): DeliveryDriver {
    this.db.prepare(`
      UPDATE delivery_drivers SET
        name = COALESCE(?, name),
        phone = COALESCE(?, phone),
        alternate_phone = COALESCE(?, alternate_phone),
        vehicle_type = COALESCE(?, vehicle_type),
        vehicle_number = COALESCE(?, vehicle_number),
        license_number = COALESCE(?, license_number),
        status = COALESCE(?, status),
        is_active = COALESCE(?, is_active),
        max_concurrent_orders = COALESCE(?, max_concurrent_orders),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      updates.name ?? null,
      updates.phone ?? null,
      updates.alternate_phone ?? null,
      updates.vehicle_type ?? null,
      updates.vehicle_number ?? null,
      updates.license_number ?? null,
      updates.status ?? null,
      updates.is_active ?? null,
      updates.max_concurrent_orders ?? null,
      id
    );

    return this.getDriverById(id)!;
  }

  public getAllZones(): DeliveryZone[] {
    return this.db.prepare('SELECT * FROM delivery_zones ORDER BY is_active DESC, delivery_charge_paise ASC').all() as DeliveryZone[];
  }

  public getZoneById(id: number): DeliveryZone | undefined {
    return this.db.prepare('SELECT * FROM delivery_zones WHERE id = ?').get(id) as DeliveryZone | undefined;
  }

  public getDefaultZone(): DeliveryZone | undefined {
    const zone = this.db.prepare('SELECT * FROM delivery_zones WHERE is_default = 1 AND is_active = 1 LIMIT 1').get() as DeliveryZone | undefined;
    if (zone) return zone;
    return this.db.prepare('SELECT * FROM delivery_zones WHERE is_active = 1 LIMIT 1').get() as DeliveryZone | undefined;
  }

  public createZone(input: Partial<DeliveryZone> & { name: string; code: string }): DeliveryZone {
    const stmt = this.db.prepare(`
      INSERT INTO delivery_zones (
        name, code, description, delivery_charge_paise, min_order_paise,
        free_delivery_above_paise, estimated_minutes, available_from,
        available_to, is_active, is_default
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      input.name,
      input.code,
      input.description || null,
      input.delivery_charge_paise ?? 0,
      input.min_order_paise || 20000,
      input.free_delivery_above_paise || 100000,
      input.estimated_minutes || 45,
      input.available_from || '07:00',
      input.available_to || '21:00',
      input.is_active !== undefined ? input.is_active : 1,
      input.is_default || 0
    );

    return this.getZoneById(Number(result.lastInsertRowid))!;
  }

  public updateZone(id: number, updates: Partial<DeliveryZone>): DeliveryZone {
    this.db.prepare(`
      UPDATE delivery_zones SET
        name = COALESCE(?, name),
        code = COALESCE(?, code),
        description = COALESCE(?, description),
        delivery_charge_paise = COALESCE(?, delivery_charge_paise),
        min_order_paise = COALESCE(?, min_order_paise),
        free_delivery_above_paise = COALESCE(?, free_delivery_above_paise),
        estimated_minutes = COALESCE(?, estimated_minutes),
        available_from = COALESCE(?, available_from),
        available_to = COALESCE(?, available_to),
        is_active = COALESCE(?, is_active),
        is_default = COALESCE(?, is_default)
      WHERE id = ?
    `).run(
      updates.name ?? null,
      updates.code ?? null,
      updates.description ?? null,
      updates.delivery_charge_paise ?? null,
      updates.min_order_paise ?? null,
      updates.free_delivery_above_paise ?? null,
      updates.estimated_minutes ?? null,
      updates.available_from ?? null,
      updates.available_to ?? null,
      updates.is_active ?? null,
      updates.is_default ?? null,
      id
    );

    return this.getZoneById(id)!;
  }

  // ─── 10. Dashboard Metrics & Exceptions Engine ──────────────────────────────
  public getDeliveryStats(startDate?: string, endDate?: string): DeliveryStats {
    const today = new Date().toISOString().slice(0, 10);
    const start = startDate || today;
    const end = endDate || today;

    const row = this.db.prepare(`
      SELECT 
        COUNT(*) as totalDeliveries,
        SUM(CASE WHEN status IN ('pending', 'preparing', 'ready_for_dispatch', 'assigned', 'picked_up', 'out_for_delivery', 'arrived') THEN 1 ELSE 0 END) as activeDeliveries,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as completedDeliveries,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failedDeliveries,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelledDeliveries,
        SUM(CASE WHEN driver_id IS NULL AND status IN ('pending', 'preparing', 'ready_for_dispatch') THEN 1 ELSE 0 END) as unassignedCount,
        SUM(CASE WHEN status = 'delivered' AND (actual_delivery_minutes <= estimated_minutes OR actual_delivery_minutes IS NULL) THEN 1 ELSE 0 END) as onTimeCount,
        AVG(actual_prep_minutes) as avgPrepMinutes,
        AVG(actual_delivery_minutes) as avgDeliveryMinutes,
        SUM(total_paise) as totalDeliveryRevenuePaise,
        SUM(delivery_charge_paise) as totalDeliveryChargesPaise,
        SUM(CASE WHEN payment_method = 'cod' AND status != 'cancelled' AND cod_reconciled = 0 THEN cod_expected_paise ELSE 0 END) as codPendingPaise
      FROM deliveries
      WHERE requested_date BETWEEN ? AND ?
    `).get(start, end) as any;

    const completed = row?.completedDeliveries || 0;
    const onTime = row?.onTimeCount || 0;
    const onTimePercent = completed > 0 ? Math.round((onTime / completed) * 100) : 100;

    return {
      totalDeliveries: row?.totalDeliveries || 0,
      activeDeliveries: row?.activeDeliveries || 0,
      completedDeliveries: completed,
      failedDeliveries: row?.failedDeliveries || 0,
      cancelledDeliveries: row?.cancelledDeliveries || 0,
      onTimePercent,
      avgPrepMinutes: Math.round(row?.avgPrepMinutes || 20),
      avgDeliveryMinutes: Math.round(row?.avgDeliveryMinutes || 35),
      totalDeliveryRevenuePaise: row?.totalDeliveryRevenuePaise || 0,
      totalDeliveryChargesPaise: row?.totalDeliveryChargesPaise || 0,
      codPendingPaise: row?.codPendingPaise || 0,
      unassignedCount: row?.unassignedCount || 0,
    };
  }

  public getDeliveryExceptions(): DeliveryException[] {
    const exceptions: DeliveryException[] = [];

    // 1. Overdue Deliveries (Active orders past estimated minutes)
    const overdueRows = this.db.prepare(`
      SELECT d.*, c.name as customer_name, drv.name as driver_name
      FROM deliveries d
      JOIN customers c ON d.customer_id = c.id
      LEFT JOIN delivery_drivers drv ON d.driver_id = drv.id
      WHERE d.status IN ('assigned', 'picked_up', 'out_for_delivery', 'arrived')
        AND (strftime('%s', 'now') - strftime('%s', d.created_at)) > (COALESCE(d.estimated_minutes, 45) * 60)
      LIMIT 10
    `).all() as any[];

    for (const r of overdueRows) {
      exceptions.push({
        id: r.id,
        delivery_number: r.delivery_number,
        type: 'overdue',
        title: `Overdue Delivery — ${r.delivery_number}`,
        description: `Order for ${r.customer_name} has exceeded estimated ${r.estimated_minutes || 45} mins. Driver: ${r.driver_name || 'Unassigned'}.`,
        severity: 'warning',
        customer_name: r.customer_name,
        driver_name: r.driver_name,
        total_paise: r.total_paise,
        created_at: r.created_at,
      });
    }

    // 2. Failed Deliveries
    const failedRows = this.db.prepare(`
      SELECT d.*, c.name as customer_name, drv.name as driver_name
      FROM deliveries d
      JOIN customers c ON d.customer_id = c.id
      LEFT JOIN delivery_drivers drv ON d.driver_id = drv.id
      WHERE d.status = 'failed'
      ORDER BY d.created_at DESC
      LIMIT 10
    `).all() as any[];

    for (const r of failedRows) {
      exceptions.push({
        id: r.id,
        delivery_number: r.delivery_number,
        type: 'failed',
        title: `Failed Delivery — ${r.delivery_number}`,
        description: `Delivery for ${r.customer_name} failed. Action required: reschedule or cancel.`,
        severity: 'critical',
        customer_name: r.customer_name,
        driver_name: r.driver_name,
        total_paise: r.total_paise,
        created_at: r.created_at,
      });
    }

    // 3. Unassigned Orders Ready for Dispatch
    const unassignedRows = this.db.prepare(`
      SELECT d.*, c.name as customer_name
      FROM deliveries d
      JOIN customers c ON d.customer_id = c.id
      WHERE d.status IN ('pending', 'ready_for_dispatch')
        AND d.driver_id IS NULL
      ORDER BY d.priority = 'urgent' DESC, d.created_at ASC
      LIMIT 10
    `).all() as any[];

    for (const r of unassignedRows) {
      exceptions.push({
        id: r.id,
        delivery_number: r.delivery_number,
        type: 'unassigned',
        title: `Unassigned Order — ${r.delivery_number}`,
        description: `Order for ${r.customer_name} is ${r.status} but no driver is assigned.`,
        severity: 'warning',
        customer_name: r.customer_name,
        total_paise: r.total_paise,
        created_at: r.created_at,
      });
    }

    // 4. COD Mismatches (Variance detected)
    const codMismatchRows = this.db.prepare(`
      SELECT d.*, c.name as customer_name, drv.name as driver_name
      FROM deliveries d
      JOIN customers c ON d.customer_id = c.id
      LEFT JOIN delivery_drivers drv ON d.driver_id = drv.id
      WHERE d.payment_method = 'cod'
        AND d.status = 'delivered'
        AND d.cod_variance_paise != 0
        AND d.cod_reconciled = 0
      LIMIT 10
    `).all() as any[];

    for (const r of codMismatchRows) {
      exceptions.push({
        id: r.id,
        delivery_number: r.delivery_number,
        type: 'cod_mismatch',
        title: `COD Variance — ${r.delivery_number}`,
        description: `Driver ${r.driver_name} collected ₹${(r.cod_collected_paise / 100).toFixed(2)} vs expected ₹${(r.cod_expected_paise / 100).toFixed(2)} (Variance: ₹${(r.cod_variance_paise / 100).toFixed(2)}).`,
        severity: 'critical',
        customer_name: r.customer_name,
        driver_name: r.driver_name,
        total_paise: r.total_paise,
        created_at: r.created_at,
      });
    }

    return exceptions;
  }
}

export const deliveryService = new DeliveryService();
export default deliveryService;

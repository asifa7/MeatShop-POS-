import { ValidationError, ConflictError } from '../../../../core/backend/errors';
import { logger, auditLogger } from '../../../../core/backend/logger';
import { pricingService } from './pricing_service';
import { invoiceNumberingService } from './invoice_numbering_service';
import { creditService } from '../../../customers/backend/service/credit_service';
import { cashBoxService } from '../../../cashbox/backend/service/cashbox_service';
import { fifoService } from '../../../inventory/backend/service/fifo_service';
import { db } from '../../../../core/backend/db';
import {
  CreateInvoiceSchema,
  VoidInvoiceSchema,
  ToggleGstSchema,
  AddInvoiceItemSchema,
  RecordPaymentSchema
} from '../../../../core/validation/billing_schemas';

import {
  IInvoiceRepository,
  IProductRepository,
  IInventoryRepository,
  ISettingsRepository,
  ICashRepository,
  Invoice,
  InvoiceDetail
} from '../../../../core/database/repositories/repository_interfaces';

import { authService } from '../../../auth/backend/service/auth_service';
import { inventoryLedgerService } from '../../../inventory/backend/service/inventory_ledger_service';
import { configService } from '../../../../core/config/config_service';

const DEFAULT_GST_RATE_BPS = 500;

export class InvoiceService {
  constructor(
    private invoiceRepo: IInvoiceRepository,
    private productRepo: IProductRepository,
    private inventoryRepo: IInventoryRepository,
    private settingsRepo: ISettingsRepository,
    private cashRepo: ICashRepository
  ) {}

  private getCurrentUserId(): number {
    return authService.getCurrentUserId();
  }

  public createDraft(input: {
    is_gst_invoice?: boolean;
    gst_number_snapshot?: string | null;
    customer_id?: number | null;
  }) {
    const parsed = CreateInvoiceSchema.safeParse({
      created_by: this.getCurrentUserId(),
      ...input,
    });
    if (!parsed.success) {
      throw new ValidationError('Invalid invoice creation input', parsed.error.flatten());
    }
    const invoice = this.invoiceRepo.create({
      created_by: parsed.data.created_by,
      is_gst_invoice: parsed.data.is_gst_invoice ? 1 : 0,
      gst_number_snapshot: parsed.data.gst_number_snapshot ?? null,
      customer_id: parsed.data.customer_id ?? null,
    });
    logger.info('Draft invoice created', { invoiceId: invoice.id });
    return invoice;
  }

  public getTodayBills(): any[] {
    const invoices = (this.invoiceRepo as any).getTodayBills();
    return invoices.map((inv: any) => this.getInvoice(inv.id));
  }

  public getInvoice(invoiceId: number): InvoiceDetail {
    return this.invoiceRepo.findById(invoiceId);
  }

  public getActiveDraft(): InvoiceDetail {
    const draft = this.invoiceRepo.findLatestDraft();
    if (draft) {
      return draft;
    }
    const newInvoice = this.createDraft({});
    return this.getInvoice(newInvoice.id);
  }

  public getLastCompletedInvoice(): InvoiceDetail | null {
    return this.invoiceRepo.findLatestCompleted();
  }

  public addItem(input: {
    invoice_id: number;
    product_variant_id: number;
    quantity_grams: number | null;
    quantity_units: number | null;
    override_rate_paise?: number | null;
    override_reason?: string | null;
    overridden_by?: number | null;
    stock_source?: 'processed_chicken' | 'mutton_regular' | 'refrigerator' | 'none';
    refrigerator_stock_id?: number | null;
  }) {
    const { invoice } = this.invoiceRepo.findById(input.invoice_id);
    if (invoice.status !== 'draft' && invoice.status !== 'held') {
      throw new ConflictError('Items can only be added to draft or held invoices');
    }

    const variant = this.productRepo.findVariantById(input.product_variant_id);
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(variant.product_id) as any;

    let stockSource = input.stock_source;
    if (!stockSource) {
      if (product?.category?.toLowerCase().includes('chicken') || product?.name?.toLowerCase().includes('chicken')) {
        stockSource = 'processed_chicken';
      } else if (product?.category?.toLowerCase().includes('mutton') || product?.name?.toLowerCase().includes('mutton')) {
        stockSource = 'mutton_regular';
      } else {
        stockSource = 'none';
      }
    }

    const hasOverride = input.override_rate_paise !== null && 
      input.override_rate_paise !== undefined && 
      input.override_rate_paise !== variant.current_rate_paise_per_unit;
    const ratePaiseSnapshot = (input.override_rate_paise !== null && input.override_rate_paise !== undefined) 
      ? input.override_rate_paise! 
      : variant.current_rate_paise_per_unit;

    const unitType = variant.unit_type;
    const lineSubtotalPaise = pricingService.calculateLineSubtotal(
      unitType, input.quantity_grams, input.quantity_units, ratePaiseSnapshot
    );

    const gstRateSnapshot = invoice.is_gst_invoice === 1 ? DEFAULT_GST_RATE_BPS : null;
    const { lineTaxPaise } = pricingService.calculateLineTax(lineSubtotalPaise, gstRateSnapshot);
    const lineTotalPaise = lineSubtotalPaise + lineTaxPaise;

    const validationInput = {
      invoice_id: input.invoice_id,
      product_variant_id: input.product_variant_id,
      quantity_grams: input.quantity_grams ?? null,
      quantity_units: input.quantity_units ?? null,
      rate_paise_snapshot: ratePaiseSnapshot,
      gst_rate_percent_snapshot: gstRateSnapshot,
      override_applied: hasOverride,
      override_reason: hasOverride ? (input.override_reason ?? 'Manual price override') : null,
      overridden_by: hasOverride ? (input.overridden_by ?? this.getCurrentUserId() ?? 1) : null,
      unit_type: unitType,
    };

    const parsed = AddInvoiceItemSchema.safeParse(validationInput);
    if (!parsed.success) {
      throw new ValidationError('Invalid invoice item input', parsed.error.flatten());
    }

    const item = this.invoiceRepo.addItem({
      invoice_id: input.invoice_id,
      product_variant_id: input.product_variant_id,
      quantity_grams: input.quantity_grams,
      quantity_units: input.quantity_units,
      rate_paise_snapshot: ratePaiseSnapshot,
      line_subtotal_paise: lineSubtotalPaise,
      gst_rate_percent_snapshot: gstRateSnapshot,
      line_total_paise: lineTotalPaise,
      override_applied: hasOverride ? 1 : 0,
      override_reason: hasOverride ? (input.override_reason ?? null) : null,
      overridden_by: hasOverride ? (input.overridden_by ?? null) : null,
      stock_source: stockSource,
      refrigerator_stock_id: input.refrigerator_stock_id ?? null,
    });

    logger.info('Item added to invoice', { invoiceId: input.invoice_id, itemId: item.id, stockSource });
    return this.getInvoice(input.invoice_id);
  }

  public updateItemQuantity(itemId: number, quantityGrams: number | null, quantityUnits: number | null) {
    const dbItem = this.invoiceRepo.findItemById(itemId);
    const { invoice } = this.invoiceRepo.findById(dbItem.invoice_id);
    if (invoice.status !== 'draft' && invoice.status !== 'held') {
      throw new ConflictError('Items can only be modified on draft or held invoices');
    }

    const variant = this.productRepo.findVariantById(dbItem.product_variant_id);
    const unitType = variant.unit_type;

    const lineSubtotalPaise = pricingService.calculateLineSubtotal(
      unitType, quantityGrams, quantityUnits, dbItem.rate_paise_snapshot
    );

    const gstRateSnapshot = invoice.is_gst_invoice === 1 ? dbItem.gst_rate_percent_snapshot : null;
    const { lineTaxPaise } = pricingService.calculateLineTax(lineSubtotalPaise, gstRateSnapshot);
    const lineTotalPaise = lineSubtotalPaise + lineTaxPaise;

    this.invoiceRepo.updateItemQty(
      itemId, quantityGrams, quantityUnits, lineSubtotalPaise, lineTotalPaise
    );

    return this.getInvoice(dbItem.invoice_id);
  }

  public removeItem(itemId: number) {
    const item = this.invoiceRepo.findItemById(itemId);
    const { invoice } = this.invoiceRepo.findById(item.invoice_id);
    if (invoice.status !== 'draft' && invoice.status !== 'held') {
      throw new ConflictError('Items can only be removed from draft or held invoices');
    }

    this.invoiceRepo.removeItem(itemId);
    logger.info('Item removed from invoice', { invoiceId: item.invoice_id, itemId });
    return this.getInvoice(item.invoice_id);
  }

  public holdInvoice(invoiceId: number) {
    const { invoice } = this.invoiceRepo.findById(invoiceId);
    if (invoice.status !== 'draft') {
      throw new ConflictError('Only draft invoices can be held');
    }
    // We can define updateStatus in invoiceRepo or implement it in completeInvoice
    // Let's add setStatus to invoice repo interface.
    this.invoiceRepo.setStatus(invoiceId, 'held');
    logger.info('Invoice held', { invoiceId });
    return this.invoiceRepo.findById(invoiceId);
  }

  public resumeInvoice(invoiceId: number) {
    const { invoice } = this.invoiceRepo.findById(invoiceId);
    if (invoice.status !== 'held') {
      throw new ConflictError('Only held invoices can be resumed');
    }
    this.invoiceRepo.setStatus(invoiceId, 'draft');
    logger.info('Invoice resumed from held', { invoiceId });
    return this.getInvoice(invoiceId);
  }

  public verifyActionPassword(password: string): boolean {
    return configService.verifyBillActionPassword(password);
  }

  public reopenCompletedInvoice(invoiceId: number, password?: string, reason?: string) {
    if (password) {
      if (!configService.verifyBillActionPassword(password)) {
        throw new ConflictError('Invalid authorization password. Reopen denied.');
      }
    }

    const databaseProvider = (this.invoiceRepo as any).dbProvider;
    return databaseProvider.transaction(() => {
      const { invoice, items, payments } = this.invoiceRepo.findById(invoiceId);
      if (invoice.status !== 'completed' && invoice.status !== 'held') {
        throw new ConflictError('Only completed invoices can be reopened for editing');
      }

      // Snapshot completed bill state before changing to draft
      const oldSnapshot = {
        invoice: { ...invoice },
        items: items.map(it => ({ ...it })),
        payments: (payments || []).map(p => ({ ...p }))
      };

      this.invoiceRepo.setStatus(invoiceId, 'draft');

      try {
        db.prepare(`
          UPDATE invoices 
          SET edit_snapshot_json = ?,
              edit_reason = ?
          WHERE id = ?
        `).run(JSON.stringify(oldSnapshot), reason || 'Reopened for bill edit', invoiceId);
      } catch (err: any) {
        logger.warn('Failed to record edit snapshot on invoice reopen', { error: String(err) });
      }

      // Atomically restore stock in ledger & batches so subsequent completion re-deducts cleanly
      for (const item of items) {

        let targetVariantId = item.product_variant_id;
        let revGrams = item.quantity_grams;
        let revUnits = item.quantity_units;



        try {
          inventoryLedgerService.recordMovement({
            product_variant_id: targetVariantId,
            branch_id: 1,
            action_type: 'STOCK_ADJUSTMENT',
            quantity_grams: revGrams,
            quantity_units: revUnits,
            reference_type: 'invoice_reopen',
            reference_id: invoiceId,
            reference_number: invoice.invoice_number || `INV-${invoiceId}`,
            notes: `Stock restored for edit/reopen of invoice #${invoice.invoice_number || invoiceId}`,
          });
        } catch (e: any) {
          logger.warn(`Notice on stock restoration for variant #${targetVariantId}: ${e.message}`);
        }
      }

      logger.info('Completed invoice reopened for editing', { invoiceId });
      return this.getInvoice(invoiceId);
    });
  }

  public deleteInvoice(input: { invoice_id: number; reason: string; password?: string }) {
    if (input.password) {
      if (!configService.verifyBillActionPassword(input.password)) {
        throw new ConflictError('Invalid authorization password. Delete denied.');
      }
    }

    const databaseProvider = (this.invoiceRepo as any).dbProvider;
    return databaseProvider.transaction(() => {
      const { invoice, items } = this.invoiceRepo.findById(input.invoice_id);
      
      // 1. Restore stock if invoice was completed
      if (invoice.status === 'completed') {
        for (const item of items) {

          let targetVariantId = item.product_variant_id;
          let revGrams = item.quantity_grams;
          let revUnits = item.quantity_units;



          try {
            inventoryLedgerService.recordMovement({
              product_variant_id: targetVariantId,
              branch_id: 1,
              action_type: 'STOCK_ADJUSTMENT',
              quantity_grams: revGrams,
              quantity_units: revUnits,
              reference_type: 'invoice_delete',
              reference_id: input.invoice_id,
              reference_number: invoice.invoice_number || `INV-${input.invoice_id}`,
              notes: `Stock restored from deleted invoice #${invoice.invoice_number || input.invoice_id}: ${input.reason}`,
            });
          } catch (e: any) {
            logger.warn(`Failed to restore stock on bill delete for variant #${targetVariantId}: ${e.message}`);
          }
        }
      }

      // 2. Reverse customer credit sale if customer paid on credit
      if (invoice.customer_id) {
        try {
          const creditSaleRow = db.prepare("SELECT debit_paise FROM customer_ledger WHERE customer_id = ? AND ref_type = 'invoice' AND ref_id = ?").get(invoice.customer_id, input.invoice_id) as { debit_paise: number } | undefined;
          if (creditSaleRow && creditSaleRow.debit_paise > 0) {
            creditService.createCreditNote(invoice.customer_id, input.invoice_id, creditSaleRow.debit_paise, `Reversal of deleted invoice #${invoice.invoice_number || input.invoice_id}: ${input.reason}`);
          }
        } catch (e: any) {
          logger.warn(`Customer ledger reversal notice on invoice delete: ${e.message}`);
        }
      }

      // 3. Mark invoice void/deleted with reason and audit trail
      db.prepare(`
        UPDATE invoices SET
          status = 'void',
          payment_status = 'unpaid',
          void_reason = ?,
          voided_at = CURRENT_TIMESTAMP,
          narration = ?
        WHERE id = ?
      `).run(input.reason, `DELETED: ${input.reason}`, input.invoice_id);

      // 4. Cancel linked delivery order if any
      try {
        db.prepare("UPDATE deliveries SET status = 'cancelled' WHERE invoice_id = ?").run(input.invoice_id);
      } catch (e) {}

      // 5. Audit Logging
      try {
        auditLogger.log(authService.getCurrentUserId() || 1, 'INVOICE_DELETED', {
          invoice_id: input.invoice_id,
          invoice_number: invoice.invoice_number,
          total_paise: invoice.total_paise,
          reason: input.reason,
        });
      } catch (e) {}

      logger.info('Invoice deleted successfully', { invoiceId: input.invoice_id, reason: input.reason });
      return { success: true, invoice_id: input.invoice_id };
    });
  }

  public toggleGst(input: { invoice_id: number; is_gst_invoice: boolean; gst_number_snapshot?: string | null }) {
    const parsed = ToggleGstSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError('Invalid GST toggle input', parsed.error.flatten());
    }

    const { invoice, items } = this.invoiceRepo.findById(parsed.data.invoice_id);
    if (invoice.status !== 'draft' && invoice.status !== 'held') {
      throw new ConflictError('GST can only be toggled on draft or held invoices');
    }

    this.invoiceRepo.toggleGst(
      parsed.data.invoice_id,
      parsed.data.is_gst_invoice ? 1 : 0,
      parsed.data.gst_number_snapshot ?? null
    );

    const gstRateSnapshot = parsed.data.is_gst_invoice ? DEFAULT_GST_RATE_BPS : null;
    for (const item of items) {
      const { lineTaxPaise } = pricingService.calculateLineTax(item.line_subtotal_paise, gstRateSnapshot);
      const lineTotalPaise = item.line_subtotal_paise + lineTaxPaise;
      this.invoiceRepo.updateItemGst(item.id, gstRateSnapshot, lineTotalPaise);
    }

    logger.info('GST toggled on invoice', { invoiceId: parsed.data.invoice_id, isGst: parsed.data.is_gst_invoice });
    return this.getInvoice(parsed.data.invoice_id);
  }

  public recordPayment(input: {
    invoice_id: number;
    method: 'cash' | 'upi' | 'card' | 'split';
    amount_paise: number;
    reference_number?: string | null;
  }) {
    const parsed = RecordPaymentSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError('Invalid payment input', parsed.error.flatten());
    }

    // Clear previous payments for draft/held invoice to prevent duplicate payments on retry
    const invoiceDetail = this.invoiceRepo.findById(parsed.data.invoice_id);
    if (invoiceDetail && (invoiceDetail.invoice.status === 'draft' || invoiceDetail.invoice.status === 'held')) {
      db.prepare('DELETE FROM payments WHERE invoice_id = ?').run(parsed.data.invoice_id);
    }

    this.invoiceRepo.addPayment({
      invoice_id: parsed.data.invoice_id,
      method: parsed.data.method,
      amount_paise: parsed.data.amount_paise,
      reference_number: parsed.data.reference_number ?? null,
    });
    logger.info('Payment recorded', { invoiceId: parsed.data.invoice_id, method: parsed.data.method, amountPaise: parsed.data.amount_paise });
    return this.getInvoice(parsed.data.invoice_id);
  }

  public completeInvoice(input: {
    invoiceId?: number;
    invoice_id?: number;
    payments?: Array<{ method: string; amount_paise: number; reference_number?: string | null }>;
    allow_negative_stock_override?: boolean;
    manager_pin?: string;
    override_reason?: string;
    discount_percent?: number;
    flat_deduction_paise?: number;
    dressing_charge_paise?: number;
    round_off_paise?: number;
    narration?: string | null;
    print_delivery_token?: boolean;
    is_delivery?: boolean | number;
    delivery_charge_paise?: number;
  }) {
    const invoiceId = (input.invoiceId ?? input.invoice_id)!;
    // Run the checkout transaction sequence safely
    const databaseProvider = (this.invoiceRepo as any).dbProvider; // Fetch provider reference from repo
    return databaseProvider.transaction(() => {
      if (input.payments && Array.isArray(input.payments)) {
        for (const p of input.payments) {
          this.invoiceRepo.addPayment({
            invoice_id: invoiceId,
            method: p.method as any,
            amount_paise: p.amount_paise,
            reference_number: p.reference_number ?? null,
          });
        }
      }

      const { invoice, items, payments } = this.invoiceRepo.findById(invoiceId);
      if (invoice.status !== 'draft' && invoice.status !== 'held') {
        throw new ConflictError('Only draft or held invoices can be completed');
      }

      if (items.length === 0) {
        throw new ValidationError('Cannot complete an invoice with no items');
      }

      let subtotalPaise = 0;
      let cgstPaiseTotal = 0;
      let sgstPaiseTotal = 0;
      let taxPaiseTotal = 0;

      for (const item of items) {
        if (item.override_applied === 1) {
          if (!item.override_reason) item.override_reason = 'Manual price override';
          if (!item.overridden_by) item.overridden_by = 1;
        }

        subtotalPaise += item.line_subtotal_paise;

        const { lineTaxPaise, cgstPaise, sgstPaise } = pricingService.calculateLineTax(
          item.line_subtotal_paise, item.gst_rate_percent_snapshot
        );

        cgstPaiseTotal += cgstPaise;
        sgstPaiseTotal += sgstPaise;
        taxPaiseTotal += lineTaxPaise;
      }

      const discountPercent = input.discount_percent ?? (invoice.discount_percent || 0);
      const discountPaise = discountPercent > 0 ? Math.round(subtotalPaise * (discountPercent / 100)) : (invoice.discount_paise || 0);
      const flatDeductionPaise = input.flat_deduction_paise ?? (invoice.flat_deduction_paise || 0);
      const dressingChargePaise = input.dressing_charge_paise ?? (invoice.dressing_charge_paise || 0);

      const exactTotalPaise = Math.max(0, subtotalPaise - discountPaise - flatDeductionPaise + taxPaiseTotal + dressingChargePaise);
      const exactRupees = exactTotalPaise / 100;
      const roundedRupees = Math.round(exactRupees);
      const finalNetTotalPaise = roundedRupees * 100;
      const roundOffPaise = finalNetTotalPaise - exactTotalPaise;

      const { invoiceNumber, financialYear } = invoiceNumberingService.generateNextNumber();

      let paidAmount = payments.reduce((acc, p) => acc + p.amount_paise, 0);
      let creditAmount = finalNetTotalPaise - paidAmount;

      // 1. Auto-apply customer advance balance if customer is selected and has advance
      if (invoice.customer_id && creditAmount > 0) {
        const customer = db.prepare('SELECT id, name, advance_balance_paise FROM customers WHERE id = ?').get(invoice.customer_id) as { id: number; name: string; advance_balance_paise: number } | undefined;
        if (customer && customer.advance_balance_paise > 0) {
          const applyAdvance = Math.min(customer.advance_balance_paise, creditAmount);
          creditService.applyAdvanceToInvoice(invoice.customer_id, invoiceId, applyAdvance);
          creditAmount -= applyAdvance;
          paidAmount += applyAdvance;
          // Record adjustment payment log so that invoice-level receipts reflect it
          db.prepare(`
            INSERT INTO payments (invoice_id, method, amount_paise, reference_number)
            VALUES (?, 'split', ?, 'ADV-AUTO-APPLIED')
          `).run(invoiceId, applyAdvance);
        }
      }

      // 2. Process credit sale remainder
      if (creditAmount > 0) {
        if (!invoice.customer_id) {
          throw new ConflictError('Cannot checkout on credit without selecting a customer');
        }

        // Validate credit terms
        const valRes = creditService.validateCreditSale(invoice.customer_id, creditAmount, this.getCurrentUserId());
        if (!valRes.allowed) {
          throw new ConflictError(`Credit sale rejected: ${valRes.message}`);
        }

        if (valRes.requiresOverride) {
          const user = db.prepare('SELECT role FROM users WHERE id = ?').get(this.getCurrentUserId()) as { role: string } | undefined;
          if (!user || (user.role !== 'ADMIN' && user.role !== 'MANAGER')) {
            throw new ConflictError(`Credit limit warning: ${valRes.message}. Requires Manager override permission.`);
          }
        }

        // Place on credit and record in ledger
        creditService.createCreditSale(invoiceId, invoice.customer_id, creditAmount, invoiceNumber);
      }

      let paymentStatus: 'unpaid' | 'partial' | 'paid' = 'unpaid';
      if (paidAmount >= finalNetTotalPaise) {
        paymentStatus = 'paid';
      } else if (paidAmount > 0) {
        paymentStatus = 'partial';
      }

      const shopInfo = this.settingsRepo.getShopInfo();

      this.invoiceRepo.completeInvoice(invoiceId, {
        invoice_number: invoiceNumber,
        financial_year: financialYear,
        subtotal_paise: subtotalPaise,
        cgst_paise: cgstPaiseTotal,
        sgst_paise: sgstPaiseTotal,
        tax_paise: taxPaiseTotal,
        total_paise: finalNetTotalPaise,
        payment_status: paymentStatus,
        discount_paise: discountPaise,
        discount_reason: invoice.discount_reason,
        discount_applied_by: invoice.discount_applied_by,
        discount_percent: discountPercent,
        flat_deduction_paise: flatDeductionPaise,
        dressing_charge_paise: dressingChargePaise,
        round_off_paise: roundOffPaise,
        narration: input.narration ?? invoice.narration ?? null,
        print_delivery_token: input.print_delivery_token ? 1 : (invoice.print_delivery_token || 0),
        is_delivery: input.is_delivery !== undefined ? (input.is_delivery ? 1 : 0) : ((invoice as any).is_delivery || 0),
        delivery_charge_paise: input.delivery_charge_paise ?? ((invoice as any).delivery_charge_paise || 0),
        shop_name_snapshot: shopInfo.name,
        shop_address_snapshot: shopInfo.address,
      });

      // Cash is derived solely from recorded cash payment rows. This runs in the
      // same database transaction as invoice completion, inventory and receipt data.
      const cashPaidPaise = payments.filter(payment => payment.method === 'cash')
        .reduce((total, payment) => total + payment.amount_paise, 0);
      cashBoxService.recordCashSale(invoiceId, invoiceNumber, cashPaidPaise, this.getCurrentUserId());

      for (const item of items) {
        const ledger = this.inventoryRepo.findLedgerByVariantId(item.product_variant_id);
        const variant = this.productRepo.findVariantById(item.product_variant_id);
        const isWeight = variant.unit_type === 'weight' || variant.unit_type === 'live_dual';
        const available = ledger ? (isWeight ? (ledger.quantity_grams ?? 0) : (ledger.quantity_units ?? 0)) : 0;
        const requested = isWeight ? (item.quantity_grams ?? 0) : (item.quantity_units ?? 0);
        
        let deductGrams = item.quantity_grams;
        let deductUnits = item.quantity_units;

        if (requested > available) {
          const managerId = this.getCurrentUserId() || 1;
          const reason = input.override_reason || 'Stock shortage auto-approved';

          // Cap the stock deduction at the available amount (so stock stops exactly at 0)
          deductGrams = isWeight ? Math.max(0, available) : null;
          deductUnits = !isWeight ? Math.max(0, available) : null;

          const shortfall = Math.max(0, requested - Math.max(0, available));
          if (shortfall > 0) {
            this.inventoryRepo.logOversold({
              invoice_id: invoiceId,
              invoice_item_id: item.id,
              product_variant_id: item.product_variant_id,
              shortfall_grams: isWeight ? shortfall : null,
              shortfall_units: !isWeight ? shortfall : null,
              manager_id: managerId,
              override_reason: reason
            });
          }
        }

        const manualAllocations = (item as any).manual_batch_allocations;
        let isManualSelected = 0;
        let totalItemCogsPaise = 0;
        let realCogsPaise = 0;
        let estimatedCogsPaise = 0;
        let isEstimatedCogs = 0;

        let targetVariantId = item.product_variant_id;
        let drawGrams = deductGrams;
        let drawUnits = deductUnits;
        let yieldRatioUsed = 1;

        if (manualAllocations && Array.isArray(manualAllocations) && manualAllocations.length > 0 && targetVariantId === item.product_variant_id) {
          isManualSelected = 1;
          for (const alloc of manualAllocations) {
            const batch = db.prepare('SELECT * FROM product_stock_batches WHERE id = ?').get(alloc.batch_id) as any;
            if (!batch) continue;

            const allocDrawGrams = isWeight ? Math.abs(alloc.quantity_grams ?? 0) : null;
            const allocDrawUnits = !isWeight ? Math.abs(alloc.quantity_units ?? 0) : null;

            const newGrams = isWeight ? Math.max(0, (batch.current_quantity_grams ?? 0) - (allocDrawGrams ?? 0)) : null;
            const newUnits = !isWeight ? Math.max(0, (batch.current_quantity_units ?? 0) - (allocDrawUnits ?? 0)) : null;

            const isExhausted = (isWeight && newGrams! <= 0) || (!isWeight && newUnits! <= 0);

            db.prepare(`
              UPDATE product_stock_batches
              SET current_quantity_grams = ?, current_quantity_units = ?, status = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(newGrams, newUnits, isExhausted ? 'exhausted' : 'active', batch.id);

            const batchCogs = isWeight ? Math.round(((allocDrawGrams ?? 0) / 1000) * batch.unit_cost_paise) : ((allocDrawUnits ?? 0) * batch.unit_cost_paise);
            realCogsPaise += batchCogs;

            try {
              db.prepare(`
                INSERT INTO invoice_item_batch_allocations (
                  invoice_item_id, batch_id, quantity_grams, quantity_units, unit_cost_paise
                ) VALUES (?, ?, ?, ?, ?)
              `).run(item.id, batch.id, allocDrawGrams, allocDrawUnits, batch.unit_cost_paise);
            } catch (e) {
              // Ignore if table check
            }
          }

          totalItemCogsPaise = realCogsPaise;
          fifoService.syncLedgerBalance(item.product_variant_id);
        } else {
          // Execute FIFO Drawdown across active batches
          const fifoRes = fifoService.drawdownFifo(targetVariantId, isWeight ? drawGrams : null, !isWeight ? drawUnits : null);
          // Scale down COGS to match the sold item's weight if yield was used, wait! 
          // If 1kg Boneless uses 1.54kg Whole Chicken, the COGS of that Boneless sale is the cost of 1.54kg Whole Chicken.
          // The FIFO function returns the COGS for 1.54kg Whole Chicken! So we just use it directly!
          totalItemCogsPaise = fifoRes.total_cogs_paise;
          realCogsPaise = fifoRes.real_cogs_paise;
          estimatedCogsPaise = fifoRes.estimated_cogs_paise;
          isEstimatedCogs = fifoRes.is_estimated_cogs;
        }

        // Update fifo_cogs_paise, real_cogs_paise, estimated_cogs_paise, is_estimated_cogs, and is_manual_batch_selected on invoice_item
        try {
          db.prepare(`
            UPDATE invoice_items
            SET fifo_cogs_paise = ?,
                real_cogs_paise = ?,
                estimated_cogs_paise = ?,
                is_estimated_cogs = ?,
                is_manual_batch_selected = ?
            WHERE id = ?
          `).run(totalItemCogsPaise, realCogsPaise, estimatedCogsPaise, isEstimatedCogs, isManualSelected, item.id);
        } catch (e) {
          db.prepare(`
            UPDATE invoice_items
            SET fifo_cogs_paise = ?, is_manual_batch_selected = ?
            WHERE id = ?
          `).run(totalItemCogsPaise, isManualSelected, item.id);
        }

        const deltaGrams = isWeight ? -(Math.abs(deductGrams ?? 0)) : null;
        const deltaUnits = !isWeight ? -(Math.abs(deductUnits ?? 0)) : null;

        // Track transaction log
        this.inventoryRepo.createTransaction({
          product_variant_id: item.product_variant_id,
          transaction_type: 'sale_deduction',
          quantity_grams: deltaGrams,
          quantity_units: deltaUnits,
          reference_id: invoiceId
        });

        // Record unified inventory_ledger entry
        const { inventoryLedgerService } = require('../../../inventory/backend/service/inventory_ledger_service');
        inventoryLedgerService.recordEntry({
          product_variant_id: item.product_variant_id,
          branch_id: 1,
          action_type: 'sale',
          quantity_grams: deltaGrams,
          quantity_units: deltaUnits,
          unit_cost_paise: item.rate_paise_snapshot,
          reference_type: 'invoice',
          reference_id: invoiceId,
          reference_number: invoiceNumber,
          notes: `POS Sale Bill #${invoiceNumber}`,
          created_by: this.getCurrentUserId(),
        });
      }

      auditLogger.log(
        this.getCurrentUserId(),
        'INVOICE_COMPLETED',
        { invoiceNumber, totalPaise: finalNetTotalPaise, itemCount: items.length }
      );

      logger.info('Invoice completed', { invoiceId, invoiceNumber, totalPaise: finalNetTotalPaise });

      const completedResult = this.getInvoice(invoiceId);

      // If invoice was reopened and edited, record audit log diff
      try {
        const invRow = db.prepare('SELECT edit_snapshot_json, edit_reason FROM invoices WHERE id = ?').get(invoiceId) as any;
        if (invRow?.edit_snapshot_json) {
          const newSnapshot = {
            invoice: { ...completedResult.invoice },
            items: (completedResult.items || []).map((it: any) => ({ ...it })),
            payments: (completedResult.payments || []).map((p: any) => ({ ...p }))
          };

          db.prepare(`
            INSERT INTO sale_edit_audit_logs (
              invoice_id, edited_by, edit_reason, old_values_json, new_values_json
            ) VALUES (?, ?, ?, ?, ?)
          `).run(
            invoiceId,
            this.getCurrentUserId() || 1,
            invRow.edit_reason || 'Reopened and edited completed invoice',
            invRow.edit_snapshot_json,
            JSON.stringify(newSnapshot)
          );

          db.prepare('UPDATE invoices SET edit_snapshot_json = NULL, edit_reason = NULL WHERE id = ?').run(invoiceId);
          logger.info('Recorded sales invoice edit audit log', { invoiceId });
        }
      } catch (auditErr: any) {
        logger.error('Failed to write sale edit audit log', auditErr);
      }

      // Trigger Customer Intelligence calculation event
      if (invoice.customer_id) {
        try {
          const { customerIntelligenceService } = require('../../../customers/backend/service/customer_intelligence_service');
          customerIntelligenceService.handleCustomerTransactionEvent(invoice.customer_id);
        } catch (e) {
          logger.warn('Failed to trigger customer intelligence calculation on invoice complete', { customerId: invoice.customer_id });
        }
      }

      return completedResult;
    });
  }

  public voidInvoice(input: { invoice_id: number; voided_by?: number; void_reason: string }) {
    authService.requireRole(['ADMIN', 'MANAGER', 'CASHIER']);
    const parsed = VoidInvoiceSchema.safeParse({
      invoice_id: input.invoice_id,
      voided_by: input.voided_by ?? this.getCurrentUserId(),
      void_reason: input.void_reason,
    });
    if (!parsed.success) {
      throw new ValidationError('Invalid void input', parsed.error.flatten());
    }

    const databaseProvider = (this.invoiceRepo as any).dbProvider;
    return databaseProvider.transaction(() => {
      const { invoice, items } = this.invoiceRepo.findById(parsed.data.invoice_id);
      if (invoice.status !== 'completed') {
        throw new ConflictError('Only completed invoices can be voided');
      }

      this.invoiceRepo.voidInvoice(parsed.data.invoice_id, parsed.data.voided_by, parsed.data.void_reason);

      for (const item of items) {
        let targetVariantId = item.product_variant_id;
        let revGrams = item.quantity_grams;
        let revUnits = item.quantity_units;



        // Atomic stock reversal on invoice void
        const { inventoryLedgerService } = require('../../../inventory/backend/service/inventory_ledger_service');
        inventoryLedgerService.recordMovement({
          product_variant_id: targetVariantId,
          branch_id: 1,
          action_type: 'STOCK_ADJUSTMENT',
          quantity_grams: revGrams,
          quantity_units: revUnits,
          reference_type: 'invoice',
          reference_id: parsed.data.invoice_id,
          reference_number: invoice.invoice_number,
          reason_code: 'unrecorded_sale',
          notes: `Reversal of voided invoice #${invoice.invoice_number}: ${parsed.data.void_reason}`,
          created_by: parsed.data.voided_by,
        });

        // Restore batch stock if allocations existed
        try {
          const allocs = db.prepare('SELECT * FROM invoice_item_batch_allocations WHERE invoice_item_id = ?').all(item.id) as any[];
          for (const al of allocs) {
            db.prepare(`
              UPDATE product_stock_batches SET
                current_quantity_grams = CASE WHEN current_quantity_grams IS NOT NULL THEN current_quantity_grams + ? ELSE NULL END,
                current_quantity_units = CASE WHEN current_quantity_units IS NOT NULL THEN current_quantity_units + ? ELSE NULL END,
                status = 'active',
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(al.quantity_grams || 0, al.quantity_units || 0, al.batch_id);
          }
        } catch (e) {}
      }

      auditLogger.log(
        parsed.data.voided_by,
        'INVOICE_VOIDED',
        { invoice_id: parsed.data.invoice_id, reason: parsed.data.void_reason }
      );

      // Reverse customer credit sale if customer paid on credit
      if (invoice.customer_id) {
        const creditSaleRow = db.prepare("SELECT debit_paise FROM customer_ledger WHERE customer_id = ? AND ref_type = 'invoice' AND ref_id = ?").get(invoice.customer_id, parsed.data.invoice_id) as { debit_paise: number } | undefined;
        if (creditSaleRow && creditSaleRow.debit_paise > 0) {
          creditService.createCreditNote(invoice.customer_id, parsed.data.invoice_id, creditSaleRow.debit_paise, `Reversal of voided invoice #${invoice.invoice_number}`);
        }
      }

      logger.info('Invoice voided', { invoiceId: parsed.data.invoice_id, reason: parsed.data.void_reason });
      return this.invoiceRepo.findById(parsed.data.invoice_id);
    });
  }

  public returnInvoice(input: {
    date?: string;
    invoice_id?: number | null;
    reference?: string;
    reason: string;
    stock_resolution: 'discarded' | 'restored';
    refund_given: boolean;
    refund_method?: 'cash' | 'credit_balance' | 'credit_note' | 'none';
    items?: Array<{
      invoice_item_id?: number | null;
      product_variant_id: number;
      quantity_grams: number | null;
      quantity_units: number | null;
      unit_rate_paise: number;
      refund_total_paise: number;
    }>;
  }) {
    // 1. Authorize role: allow cashier, admin, or manager
    authService.requireRole(['ADMIN', 'MANAGER', 'CASHIER']);

    const databaseProvider = (this.invoiceRepo as any).dbProvider;
    return databaseProvider.transaction(() => {
      let targetInvoiceId = input.invoice_id;
      let originalInvoiceNumber = input.reference || null;
      let customerId = null;

      // Calculate total refund amount from payload
      let totalRefundPaise = 0;
      const returnItems = input.items || [];
      returnItems.forEach(i => {
        totalRefundPaise += i.refund_total_paise;
      });

      if (targetInvoiceId) {
        const originalInvoice = this.invoiceRepo.findById(targetInvoiceId);
        if (originalInvoice.invoice.status !== 'completed') {
          throw new ConflictError('Only completed invoices can be returned');
        }
        originalInvoiceNumber = originalInvoice.invoice.invoice_number ?? String(targetInvoiceId);
        customerId = originalInvoice.invoice.customer_id;
        // set status to returned
        this.invoiceRepo.setStatus(targetInvoiceId, 'returned');
      } else {
        // standalone return. Create a dummy negative invoice to account for it
        const created = this.invoiceRepo.create({
          created_by: authService.getCurrentUserId(),
          is_gst_invoice: 0,
        });
        targetInvoiceId = created.id;
        
        for (const item of returnItems) {
           this.invoiceRepo.addItem({
             invoice_id: targetInvoiceId,
             product_variant_id: item.product_variant_id,
             quantity_grams: item.quantity_grams ? -item.quantity_grams : null,
             quantity_units: item.quantity_units ? -item.quantity_units : null,
             rate_paise_snapshot: item.unit_rate_paise,
             line_subtotal_paise: -item.refund_total_paise,
             gst_rate_percent_snapshot: null,
             line_total_paise: -item.refund_total_paise,
             override_applied: 0,
             override_reason: null,
             overridden_by: null,
           });
        }
        const refStr = input.reference ? `Ref: ${input.reference}` : 'Direct Return';
        
        (this.invoiceRepo as any).completeInvoiceStmt = (this.invoiceRepo as any).db.prepare(`
          UPDATE invoices SET
            invoice_number = @invoice_number,
            financial_year = @financial_year,
            status = 'returned',
            subtotal_paise = @subtotal_paise,
            cgst_paise = 0,
            sgst_paise = 0,
            tax_paise = 0,
            total_paise = @total_paise,
            payment_status = 'paid',
            discount_paise = 0,
            discount_percent = 0,
            flat_deduction_paise = 0,
            dressing_charge_paise = 0,
            round_off_paise = 0,
            print_delivery_token = 0,
            narration = @narration,
            shop_name_snapshot = 'Return',
            shop_address_snapshot = '',
            completed_at = CURRENT_TIMESTAMP
          WHERE id = @id
        `);
        (this.invoiceRepo as any).completeInvoiceStmt.run({
           id: targetInvoiceId,
           invoice_number: `RET-${targetInvoiceId}`,
           financial_year: '23-24',
           subtotal_paise: -totalRefundPaise,
           total_paise: -totalRefundPaise,
           narration: refStr
        });
      }

      let managerId = authService.getCurrentUserId();

      // 2. Handle stock
      if (input.stock_resolution === 'restored') {
        for (const item of returnItems) {
          const isWeight = item.quantity_grams !== null;
          let deltaGrams = isWeight ? Math.abs(item.quantity_grams ?? 0) : null;
          let deltaUnits = !isWeight ? Math.abs(item.quantity_units ?? 0) : null;
          let targetVariantId = item.product_variant_id;



          const { inventoryLedgerService } = require('../../../inventory/backend/service/inventory_ledger_service');
          inventoryLedgerService.recordMovement({
            product_variant_id: targetVariantId,
            branch_id: 1,
            action_type: 'SALE_RETURN',
            quantity_grams: deltaGrams,
            quantity_units: deltaUnits,
            unit_cost_paise: item.unit_rate_paise,
            reference_type: 'invoice',
            reference_id: targetInvoiceId,
            reference_number: originalInvoiceNumber,
            reason_code: 'other',
            notes: `Sales return restored (${originalInvoiceNumber}) - ${input.reason || 'Restocked'}`,
            created_by: managerId,
          });

          // Also activate a batch in product_stock_batches for FIFO availability
          try {
            const cleanDate = new Date().toISOString().slice(0, 10).replace(/[^0-9]/g, '');
            const retBatchNo = `BAT-RET-${cleanDate}-${targetInvoiceId}-${targetVariantId}-${Math.floor(Math.random()*1000)}`;
            db.prepare(`
              INSERT INTO product_stock_batches (
                batch_number, product_variant_id, received_date, original_batch_date,
                initial_quantity_grams, initial_quantity_units,
                current_quantity_grams, current_quantity_units,
                unit_cost_paise, source_type, source_ref_id, status, location_id
              ) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, 'adjustment', ?, 'active', 1)
            `).run(
              retBatchNo,
              targetVariantId,
              deltaGrams,
              deltaUnits,
              deltaGrams,
              deltaUnits,
              item.unit_rate_paise,
              targetInvoiceId
            );
          } catch (e) {}
        }
      } else {
        // Discarded / Spoilage return: log audit movement to ledger without adding back to saleable stock
        for (const item of returnItems) {
          const { inventoryLedgerService } = require('../../../inventory/backend/service/inventory_ledger_service');
          inventoryLedgerService.recordMovement({
            product_variant_id: item.product_variant_id,
            branch_id: 1,
            action_type: 'WASTAGE',
            quantity_grams: 0,
            quantity_units: 0,
            unit_cost_paise: item.unit_rate_paise,
            reference_type: 'invoice',
            reference_id: targetInvoiceId,
            reference_number: originalInvoiceNumber,
            reason_code: 'spoilage',
            notes: `Sales return discarded/spoilage (${originalInvoiceNumber}) - ${input.reason || 'Spoilage'}`,
            created_by: managerId,
          });
        }
      }

      // 3. Log Audit Trail
      auditLogger.log(
        managerId,
        'INVOICE_RETURNED',
        { 
          invoice_id: targetInvoiceId, 
          reason: input.reason, 
          resolution: input.stock_resolution, 
          refundGiven: input.refund_given, 
          refundMethod: input.refund_method, 
          totalRefundPaise, 
          authorizedBy: managerId 
        }
      );

      // 4. Record Cash Box Outflow / CRM Credit
      if (input.refund_given) {
        if (input.refund_method === 'cash' && totalRefundPaise > 0) {
          cashBoxService.recordCashRefund(targetInvoiceId, originalInvoiceNumber ?? String(targetInvoiceId), totalRefundPaise, input.reason, managerId);
        } else if (input.refund_method === 'credit_balance' && customerId) {
          creditService.depositAdvance({
            customer_id: customerId,
            amount_paise: totalRefundPaise,
            payment_method: 'credit_note',
            reference_number: `Return Refund ${originalInvoiceNumber}`,
            collected_by: managerId,
          });
        }
      }

      logger.info('Invoice returned successfully', { invoiceId: targetInvoiceId, resolutionType: input.stock_resolution, refundMethod: input.refund_method, totalRefundPaise });
      return this.invoiceRepo.findById(targetInvoiceId);
    });
  }

  public listHeld() {
    return this.invoiceRepo.listHeld();
  }

  public applyDiscount(input: { invoice_id: number; discount_paise: number; discount_reason: string; discount_applied_by: number }) {
    const { invoice } = this.invoiceRepo.findById(input.invoice_id);
    if (invoice.status !== 'draft' && invoice.status !== 'held') {
      throw new ConflictError('Discount can only be applied to draft or held invoices');
    }
    if (input.discount_paise < 0) {
      throw new ValidationError('Discount cannot be negative');
    }
    if (input.discount_paise > 0 && (!input.discount_reason?.trim() || !input.discount_applied_by)) {
      throw new ValidationError('Reason and applied_by are mandatory for non-zero discount');
    }
    this.invoiceRepo.applyDiscount(
      input.invoice_id,
      input.discount_paise,
      input.discount_reason || null,
      input.discount_applied_by || null
    );
    return this.getInvoice(input.invoice_id);
  }

  public deleteDraft(invoiceId: number) {
    const { invoice } = this.invoiceRepo.findById(invoiceId);
    if (invoice.status !== 'draft' && invoice.status !== 'held') {
      throw new ConflictError('Only draft or held invoices can be deleted');
    }
    // Delete payments and items first in invoice repo or cascade delete (foreign key matches)
    this.invoiceRepo.deleteInvoice(invoiceId);
    logger.info('Draft invoice deleted', { invoiceId });
  }

  public linkCustomer(invoiceId: number, customerId: number | null) {
    db.prepare('UPDATE invoices SET customer_id = ? WHERE id = ?').run(customerId, invoiceId);
    return this.getInvoice(invoiceId);
  }
}

import { container } from '../../../../core/di/container';
export const invoiceService = container.invoiceService;
export default invoiceService;

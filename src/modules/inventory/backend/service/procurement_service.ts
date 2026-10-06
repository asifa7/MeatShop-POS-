import { container } from '../../../../core/di/container';
export interface PassbookLedgerEntry {
  id: string;
  entry_date: string;
  type: 'IN' | 'OUT';
  ref_type: string;
  ref_id: number;
  purchase_ref_number?: string;
  supplier_bill_number?: string;
  supplier_id: number;
  supplier_name: string;
  description: string;
  items_summary?: string;
  amount_paise: number;
  payment_method?: string;
  status: 'pending_approval' | 'approved' | 'rejected';
  file_path?: string;
  running_balance_paise: number;
}

export interface SupplierSnapshot {
  supplier_id: number;
  company_name: string;
  outstanding_balance_paise: number;
  last_purchase_date?: string;
  last_purchase_amount_paise?: number;
  last_payment_date?: string;
  last_payment_amount_paise?: number;
}

export interface PurchasesMonthSummary {
  total_purchased_paise: number;
  total_paid_paise: number;
  total_outstanding_paise: number;
  pending_approval_count: number;
}
import { db } from '../../../../core/backend/db';
import { productVariantsRepository } from '../../../billing/backend/repository/product_variants_repository';
import { ValidationError, NotFoundError } from '../../../../core/backend/errors';
import { inventoryLedgerService } from './inventory_ledger_service';
import {
  CreatePurchaseOrderSchema,
  GoodsReceiptSchema,
  PurchaseInvoiceSchema,
  PurchaseReturnSchema,
  QuickPurchaseSchema
} from '../validation/supplier_procurement.schema';
import {
  PurchaseOrderRow,
  PurchaseOrderItemRow,
  GoodsReceiptRow,
  GoodsReceiptItemRow,
  PurchaseInvoiceRow,
  PurchaseInvoiceItemRow,
  CreatePurchaseOrderRepoInput,
  CreateGoodsReceiptRepoInput,
  CreatePurchaseInvoiceRepoInput
} from '../../../../core/database/repositories/repository_interfaces';

export interface PurchaseReturnRow {
  id: number;
  return_number: string;
  purchase_invoice_id: number | null;
  supplier_id: number;
  return_date: string;
  reason: string | null;
  total_refund_amount_paise: number;
  resolved_via: 'refund' | 'replacement' | 'debit_note';
  created_by: number;
  created_at: string;
}

export class ProcurementService {
  private get purchaseOrderRepo() {
    return container.purchaseOrderRepository;
  }

  private get goodsReceiptRepo() {
    return container.goodsReceiptRepository;
  }

  private get purchaseInvoiceRepo() {
    return container.purchaseInvoiceRepository;
  }

  private get inventoryRepo() {
    return container.inventoryRepository;
  }

  public get purchaseOrderRepository() {
    return container.purchaseOrderRepository;
  }

  public get purchaseInvoiceRepository() {
    return container.purchaseInvoiceRepository;
  }

  private get supplierLedgerRepo() {
    return container.supplierLedgerRepository;
  }

  public createPurchaseOrder(raw: unknown, userId: number): PurchaseOrderRow {
    const parsed = CreatePurchaseOrderSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError('Invalid purchase order input', parsed.error.flatten());
    }

    const cleanDate = parsed.data.order_date.replace(/[^0-9]/g, '').slice(0, 8);
    const countRow = db.prepare("SELECT COUNT(*) as cnt FROM purchase_orders WHERE order_date = ?").get(parsed.data.order_date) as { cnt: number };
    const seq = String(countRow.cnt + 1).padStart(4, '0');
    const poNumber = `PO-${cleanDate}-${seq}`;

    const repoInput: CreatePurchaseOrderRepoInput = {
      po_number: poNumber,
      supplier_id: parsed.data.supplier_id,
      order_date: parsed.data.order_date,
      expected_delivery_date: parsed.data.expected_delivery_date,
      status: 'draft',
      notes: parsed.data.notes,
      created_by: userId,
      items: parsed.data.items.map(item => ({
        product_variant_id: item.product_variant_id,
        quantity_ordered: item.quantity_ordered,
        unit_type: item.unit_type,
        unit_price_paise: item.unit_price_paise,
        subtotal_paise: item.quantity_ordered * item.unit_price_paise,
      })),
    };

    return this.purchaseOrderRepo.create(repoInput);
  }

  public submitPurchaseOrder(id: number): void {
    const po = this.purchaseOrderRepo.findById(id);
    if (!po) {
      throw new NotFoundError(`Purchase order with id ${id} not found`);
    }
    if (po.status !== 'draft') {
      throw new ValidationError(`Purchase order cannot be submitted from status: ${po.status}`);
    }
    this.purchaseOrderRepo.updateStatus(id, 'submitted');
  }

  public approvePurchaseOrder(id: number, approvedBy: number): void {
    const po = this.purchaseOrderRepo.findById(id);
    if (!po) {
      throw new NotFoundError(`Purchase order with id ${id} not found`);
    }
    if (po.status !== 'submitted') {
      throw new ValidationError(`Purchase order cannot be approved from status: ${po.status}`);
    }
    this.purchaseOrderRepo.updateStatus(id, 'approved', approvedBy);
  }

  public cancelPurchaseOrder(id: number): void {
    const po = this.purchaseOrderRepo.findById(id);
    if (!po) {
      throw new NotFoundError(`Purchase order with id ${id} not found`);
    }
    if (po.status !== 'draft' && po.status !== 'submitted') {
      throw new ValidationError(`Purchase order cannot be cancelled from status: ${po.status}`);
    }
    this.purchaseOrderRepo.updateStatus(id, 'cancelled');
  }

  public createGoodsReceipt(raw: unknown, userId: number): GoodsReceiptRow {
    const parsed = GoodsReceiptSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError('Invalid goods receipt input', parsed.error.flatten());
    }

    return container.databaseProvider.transaction(() => {
      const cleanDate = parsed.data.received_date.replace(/[^0-9]/g, '').slice(0, 8);
      const countRow = db.prepare("SELECT COUNT(*) as cnt FROM goods_receipts WHERE received_date = ?").get(parsed.data.received_date) as { cnt: number };
      const seq = String(countRow.cnt + 1).padStart(4, '0');
      const grnNumber = `GRN-${cleanDate}-${seq}`;

      const repoInput: CreateGoodsReceiptRepoInput = {
        grn_number: grnNumber,
        purchase_order_id: parsed.data.purchase_order_id,
        supplier_id: parsed.data.supplier_id,
        delivery_note_number: parsed.data.delivery_note_number,
        received_date: parsed.data.received_date,
        received_by: userId,
        notes: parsed.data.notes,
        items: parsed.data.items.map(item => ({
          purchase_order_item_id: item.purchase_order_item_id ?? null,
          product_variant_id: item.product_variant_id,
          quantity_accepted: item.quantity_accepted,
          quantity_rejected: item.quantity_rejected ?? 0,
          rejection_reason: item.rejection_reason ?? null,
          batch_number: item.batch_number ?? null,
          expiry_date: item.expiry_date ?? null,
        })),
      };

      // 1. Save GRN and GRN items via goodsReceiptRepository (updates po item received quantities too)
      const grn = this.goodsReceiptRepo.create(repoInput);

      // 2. If linked to PO, check if all items received and update PO status to received/closed
      if (parsed.data.purchase_order_id) {
        const poItems = this.purchaseOrderRepo.findItemsByPoId(parsed.data.purchase_order_id);
        const allReceived = poItems.every(item => item.quantity_received >= item.quantity_ordered);
        if (allReceived) {
          this.purchaseOrderRepo.updateStatus(parsed.data.purchase_order_id, 'received');
        }
      }

      // 3. For each accepted item, update stock ledger or live chicken batches
      for (const item of parsed.data.items) {
        const variant = container.productRepository.findVariantById(item.product_variant_id);
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(variant?.product_id) as any;
        const isLiveDual = variant?.unit_type === 'live_dual';
        const isWeight = variant?.unit_type === 'weight' || isLiveDual;
        const isLiveChicken = (isLiveDual || product?.stock_classification === 'live_yield') &&
          (product?.category?.toLowerCase().includes('chicken') || product?.name?.toLowerCase().includes('chicken'));

        const deltaGrams = isWeight ? item.quantity_accepted : null;
        const deltaUnits = isWeight ? null : item.quantity_accepted;

        // 1. Every purchase without exception increments regular inventory in stock_ledger
        this.inventoryRepo.updateLedgerStock(item.product_variant_id, deltaGrams, deltaUnits);
        this.inventoryRepo.createTransaction({
          product_variant_id: item.product_variant_id,
          transaction_type: 'manual_adjustment',
          quantity_grams: deltaGrams,
          quantity_units: deltaUnits,
          reference_id: grn.id,
        });

        // 2. If it is live chicken, also record in live_chicken_batches for yield/mortality tracking
        if (isLiveChicken) {
          const liveWeightGrams = deltaGrams ?? 0;
          const poItem = item.purchase_order_item_id ? db.prepare('SELECT * FROM purchase_order_items WHERE id = ?').get(item.purchase_order_item_id) as any : null;
          const countVal = poItem?.count || Math.max(1, Math.round((liveWeightGrams || 1600) / 1600));

          const cleanBatchDate = parsed.data.received_date.replace(/[^0-9]/g, '').slice(0, 8);
          const countRow = db.prepare('SELECT COUNT(*) as cnt FROM live_chicken_batches').get() as { cnt: number };
          const seq = String(countRow.cnt + 1).padStart(4, '0');
          const batchNum = `BAT-LIVE-${cleanBatchDate}-${seq}`;

          db.prepare(`
            INSERT INTO live_chicken_batches (
              batch_number, supplier_id, purchase_date,
              cost_per_kg_paise, initial_weight_grams, initial_count,
              remaining_weight_grams, remaining_count, status, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
          `).run(
            batchNum,
            parsed.data.supplier_id,
            parsed.data.received_date,
            poItem?.unit_price_paise || variant?.current_rate_paise_per_unit || 0,
            liveWeightGrams,
            countVal,
            liveWeightGrams,
            countVal,
            `GRN Receipt #${grnNumber}`
          );
        }
      }

      return grn;
    });
  }

  public createPurchaseInvoice(raw: unknown, userId: number): PurchaseInvoiceRow {
    const parsed = PurchaseInvoiceSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError('Invalid purchase invoice input', parsed.error.flatten());
    }

    return container.databaseProvider.transaction(() => {
      const cleanDate = parsed.data.invoice_date.replace(/[^0-9]/g, '').slice(0, 8);
      const countRow = db.prepare("SELECT COUNT(*) as cnt FROM purchase_invoices WHERE invoice_date = ?").get(parsed.data.invoice_date) as { cnt: number };
      const seq = String(countRow.cnt + 1).padStart(4, '0');
      const invoiceNumber = `PI-${cleanDate}-${seq}`;

      const repoInput: CreatePurchaseInvoiceRepoInput = {
        invoice_number: invoiceNumber,
        supplier_invoice_number: parsed.data.supplier_invoice_number,
        purchase_order_id: parsed.data.purchase_order_id,
        goods_receipt_id: parsed.data.goods_receipt_id,
        supplier_id: parsed.data.supplier_id,
        invoice_date: parsed.data.invoice_date,
        subtotal_paise: parsed.data.subtotal_paise,
        gst_paise: parsed.data.gst_paise ?? 0,
        cgst_paise: parsed.data.cgst_paise ?? 0,
        sgst_paise: parsed.data.sgst_paise ?? 0,
        igst_paise: parsed.data.igst_paise ?? 0,
        freight_charges_paise: parsed.data.freight_charges_paise ?? 0,
        loading_charges_paise: parsed.data.loading_charges_paise ?? 0,
        packing_charges_paise: parsed.data.packing_charges_paise ?? 0,
        other_charges_paise: parsed.data.other_charges_paise ?? 0,
        discount_paise: parsed.data.discount_paise ?? 0,
        round_off_paise: parsed.data.round_off_paise ?? 0,
        total_amount_paise: parsed.data.total_amount_paise,
        outstanding_amount_paise: parsed.data.total_amount_paise,
        payment_status: 'unpaid',
        status: 'approved',
        created_by: userId,
        items: parsed.data.items.map(item => ({
          product_variant_id: item.product_variant_id,
          quantity: item.quantity,
          unit_price_paise: item.unit_price_paise,
          gst_rate_bps: item.gst_rate_bps ?? 0,
          gst_amount_paise: item.gst_amount_paise ?? 0,
          total_amount_paise: item.total_amount_paise,
        })),
      };

      // 1. Create invoice & invoice items (handles price history & suppliers outstanding balance)
      const invoice = this.purchaseInvoiceRepo.create(repoInput);

      // 2. Insert supplier ledger entry of type purchase_invoice
      this.supplierLedgerRepo.create({
        supplier_id: parsed.data.supplier_id,
        entry_date: parsed.data.invoice_date,
        ref_type: 'purchase_invoice',
        ref_id: invoice.id,
        description: `Purchase Invoice: ${parsed.data.supplier_invoice_number} (Ref: ${invoice.invoice_number})`,
        credit_paise: parsed.data.total_amount_paise,
        debit_paise: 0,
        status: 'approved',
      });

      // 3. Update stock ledger & inventory_ledger for each purchased item
      parsed.data.items.forEach((item, idx) => {
        const variant = container.productRepository.findVariantById(item.product_variant_id);
        const isWeight = variant?.unit_type === 'weight' || variant?.unit_type === 'live_dual';
        const deltaGrams = isWeight ? Math.round(item.quantity * 1000) : null;
        const deltaUnits = !isWeight ? item.quantity : null;

        this.inventoryRepo.updateLedgerStock(item.product_variant_id, deltaGrams, deltaUnits);

        // Create distinct Stock Batch for FIFO tracking
        try {
          db.prepare(`
            INSERT INTO product_stock_batches (
              batch_number, product_variant_id, received_date,
              initial_quantity_grams, initial_quantity_units, initial_count,
              current_quantity_grams, current_quantity_units, current_count,
              unit_cost_paise, source_type, source_ref_id, status
            ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?, 'purchase', ?, 'active')
          `).run(
            `BAT-PI-${cleanDate}-${invoice.id}-${idx + 1}`,
            item.product_variant_id,
            parsed.data.invoice_date,
            deltaGrams,
            deltaUnits,
            deltaGrams,
            deltaUnits,
            item.unit_price_paise,
            invoice.id
          );
        } catch (e) {}

        productVariantsRepository.syncVariantCostCache(item.product_variant_id);

        inventoryLedgerService.recordEntry({
          product_variant_id: item.product_variant_id,
          action_type: 'purchase',
          quantity_grams: deltaGrams,
          quantity_units: deltaUnits,
          unit_cost_paise: item.unit_price_paise,
          reference_type: 'purchase_invoice',
          reference_id: invoice.id,
          reference_number: invoice.supplier_invoice_number || invoice.invoice_number,
          notes: 'Standard Purchase Invoice',
          created_by: userId,
        });
      });

      return invoice;
    });
  }

  public createPurchaseReturn(raw: unknown, userId: number): PurchaseReturnRow {
    const parsed = PurchaseReturnSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError('Invalid purchase return input', parsed.error.flatten());
    }

    return container.databaseProvider.transaction(() => {
      const cleanDate = parsed.data.return_date.replace(/[^0-9]/g, '').slice(0, 8);
      const countRow = db.prepare("SELECT COUNT(*) as cnt FROM purchase_returns").get() as { cnt: number };
      const seq = String(countRow.cnt + 1).padStart(4, '0');
      const returnNumber = `PR-${cleanDate}-${seq}`;

      // 1. Create the purchase return record
      const res = db.prepare(`
        INSERT INTO purchase_returns (
          return_number, purchase_invoice_id, supplier_id, return_date, reason,
          total_refund_amount_paise, resolved_via, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        returnNumber,
        parsed.data.purchase_invoice_id ?? null,
        parsed.data.supplier_id,
        parsed.data.return_date,
        parsed.data.reason ?? null,
        parsed.data.total_refund_amount_paise,
        parsed.data.resolved_via,
        userId
      );
      const returnId = res.lastInsertRowid as number;

      // 2. Process return items (insert details, update stock, log stock transaction)
      for (const item of parsed.data.items) {
        db.prepare(`
          INSERT INTO purchase_return_items (
            purchase_return_id, product_variant_id, quantity, unit_price_paise, gst_amount_paise, total_amount_paise
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          returnId,
          item.product_variant_id,
          item.quantity,
          item.unit_price_paise,
          item.gst_amount_paise ?? 0,
          item.total_amount_paise
        );

        const variant = container.productRepository.findVariantById(item.product_variant_id);
        const isWeight = variant.unit_type === 'weight';
        const deltaGrams = isWeight ? item.quantity : null;
        const deltaUnits = isWeight ? null : item.quantity;

        // Deduct stock levels (negative delta)
        this.inventoryRepo.updateLedgerStock(
          item.product_variant_id,
          deltaGrams !== null ? -deltaGrams : null,
          deltaUnits !== null ? -deltaUnits : null
        );

        // Record stock transaction (negative delta)
        this.inventoryRepo.createTransaction({
          product_variant_id: item.product_variant_id,
          transaction_type: 'manual_adjustment',
          quantity_grams: deltaGrams !== null ? -deltaGrams : null,
          quantity_units: deltaUnits !== null ? -deltaUnits : null,
          reference_id: returnId,
        });
      }

      // 3. Create debit note if resolved via debit note, otherwise ledger entry is purchase_return
      let refId = returnId;
      let refType: 'purchase_return' | 'debit_note' = 'purchase_return';
      let entryDesc = `Purchase Return: ${returnNumber}`;

      if (parsed.data.resolved_via === 'debit_note') {
        const countDn = db.prepare("SELECT COUNT(*) as cnt FROM supplier_debit_notes").get() as { cnt: number };
        const dnSeq = String(countDn.cnt + 1).padStart(4, '0');
        const dnNumber = `DN-${cleanDate}-${dnSeq}`;

        const dnRes = db.prepare(`
          INSERT INTO supplier_debit_notes (debit_note_number, supplier_id, amount_paise, reason, created_by)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          dnNumber,
          parsed.data.supplier_id,
          parsed.data.total_refund_amount_paise,
          parsed.data.reason ?? `For return ${returnNumber}`,
          userId
        );
        refId = dnRes.lastInsertRowid as number;
        refType = 'debit_note';
        entryDesc = `Debit Note: ${dnNumber} (For PR ${returnNumber})`;
      }

      // 4. Insert supplier ledger entry (Debits reduce outstanding balance)
      this.supplierLedgerRepo.create({
        supplier_id: parsed.data.supplier_id,
        entry_date: parsed.data.return_date,
        ref_type: refType,
        ref_id: refId,
        description: entryDesc,
        debit_paise: parsed.data.total_refund_amount_paise,
        credit_paise: 0,
        status: 'approved',
      });

      // 5. Update supplier outstanding balance directly
      container.supplierProfileRepository.updateOutstandingBalance(parsed.data.supplier_id, -parsed.data.total_refund_amount_paise);

      return db.prepare('SELECT * FROM purchase_returns WHERE id = ?').get(returnId) as PurchaseReturnRow;
    });
  }

  public getPurchaseOrder(id: number): any {
    const po = this.purchaseOrderRepo.findById(id);
    if (!po) throw new NotFoundError(`Purchase order with id ${id} not found`);
    const items = this.purchaseOrderRepo.findItemsByPoId(id);
    return { ...po, items };
  }

  public listPurchaseOrders(): any[] {
    return this.purchaseOrderRepo.findAll();
  }

  public getGoodsReceipt(id: number): any {
    const grn = this.goodsReceiptRepo.findById(id);
    if (!grn) throw new NotFoundError(`Goods receipt with id ${id} not found`);
    const items = this.goodsReceiptRepo.findItemsByGrnId(id);
    return { ...grn, items };
  }

  public listGoodsReceipts(): any[] {
    return this.goodsReceiptRepo.findAll();
  }

  public getPurchaseInvoice(id: number): any {
    const invoice = this.purchaseInvoiceRepo.findById(id);
    if (!invoice) throw new NotFoundError(`Purchase invoice with id ${id} not found`);
    const items = this.purchaseInvoiceRepo.findItemsByInvoiceId(id);
    const itemsWithNames = items.map(item => {
      const variant = db.prepare(`
        SELECT pv.variant_name, p.name as product_name 
        FROM product_variants pv 
        JOIN products p ON p.id = pv.product_id 
        WHERE pv.id = ?
      `).get(item.product_variant_id) as any;
      return {
        ...item,
        product_name: variant?.product_name || `Product #${item.product_variant_id}`,
        variant_name: variant?.variant_name || 'Standard'
      };
    });
    return { ...invoice, items: itemsWithNames };
  }

  public listPurchaseInvoices(): any[] {
    return this.purchaseInvoiceRepo.findAll();
  }

  public getPurchaseReturn(id: number): any {
    const ret = db.prepare('SELECT * FROM purchase_returns WHERE id = ?').get(id) as any;
    if (!ret) throw new NotFoundError(`Purchase return with id ${id} not found`);
    const items = db.prepare('SELECT * FROM purchase_return_items WHERE purchase_return_id = ?').all(id);
    return { ...ret, items };
  }

  public listPurchaseReturns(): any[] {
    return db.prepare('SELECT * FROM purchase_returns ORDER BY return_date DESC').all();
  }

  public recordQuickPurchase(raw: unknown, userId: number): { invoice: PurchaseInvoiceRow } {
    const parsed = QuickPurchaseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError('Invalid quick purchase input', parsed.error.flatten());
    }

    return container.databaseProvider.transaction(() => {
      const user = container.userRepository.findById(userId);
      const approvalStatus = 'approved';
      const cleanDate = parsed.data.received_date.replace(/[^0-9]/g, '').slice(0, 8);

      // 1. Create PO
      const poRepoInput: CreatePurchaseOrderRepoInput = {
        po_number: `PO-${cleanDate}-${Date.now().toString().slice(-4)}`,
        supplier_id: parsed.data.supplier_id,
        order_date: parsed.data.received_date,
        expected_delivery_date: parsed.data.received_date,
        status: 'approved',
        notes: parsed.data.notes || 'Quick Purchase',
        created_by: userId,
        items: parsed.data.items.map(item => ({
          product_variant_id: item.product_variant_id,
          unit_type: item.unit_type,
          quantity_ordered: item.quantity,
          unit_price_paise: item.unit_price_paise,
          subtotal_paise: item.subtotal_paise,
        })),
      };
      const po = this.purchaseOrderRepo.create(poRepoInput);

      // 2. Create GRN
      const grnRepoInput: CreateGoodsReceiptRepoInput = {
        grn_number: `GRN-${Date.now()}`,
        purchase_order_id: po.id,
        supplier_id: parsed.data.supplier_id,
        received_date: parsed.data.received_date,
        delivery_note_number: null,
        received_by: userId,
        notes: 'Quick Purchase Receipt',
        items: parsed.data.items.map(item => ({
          purchase_order_item_id: null,
          product_variant_id: item.product_variant_id,
          quantity_accepted: item.quantity,
          quantity_rejected: 0,
          rejection_reason: null,
          batch_number: null,
          expiry_date: null,
        })),
      };
      const grn = this.goodsReceiptRepo.create(grnRepoInput);

      // Update PO status to received
      this.purchaseOrderRepo.updateStatus(po.id, 'received');

      // Update Stock Ledger, Create Batch & Transaction (or Live Chicken Batch)
      parsed.data.items.forEach((item, idx) => {
        const variant = container.productRepository.findVariantById(item.product_variant_id);
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(variant?.product_id) as any;

        const isLiveDual = item.unit_type === 'live_dual' || variant?.unit_type === 'live_dual';
        const isWeight = item.unit_type === 'weight' || isLiveDual;
        const isLiveChicken = (isLiveDual || product?.stock_classification === 'live_yield') &&
          (product?.category?.toLowerCase().includes('chicken') || product?.name?.toLowerCase().includes('chicken'));

        const deltaGrams = isWeight ? Math.round(item.quantity * 1000) : null;
        const deltaUnits = !isWeight ? item.quantity : null;
        const countValue = isLiveDual && item.count !== undefined ? item.count : (isLiveChicken ? Math.max(1, Math.round((deltaGrams || 1600) / 1600)) : null);

        // 1. Every purchase without exception increments regular inventory in stock_ledger
        this.inventoryRepo.updateLedgerStock(item.product_variant_id, deltaGrams, deltaUnits);

        this.inventoryRepo.createTransaction({
          product_variant_id: item.product_variant_id,
          transaction_type: 'manual_adjustment',
          reference_id: po.id,
          quantity_grams: deltaGrams,
          quantity_units: deltaUnits,
        });

        // 2. If it is live chicken, also record in live_chicken_batches for yield/mortality tracking
        if (isLiveChicken) {
          const liveWeightGrams = deltaGrams ?? 0;
          const birdCount = countValue ?? 1;
          const costPerKgPaise = item.unit_price_paise || 0;

          const batchNum = `BAT-LIVE-${cleanDate}-${po.id}-${idx + 1}`;
          db.prepare(`
            INSERT INTO live_chicken_batches (
              batch_number, supplier_id, purchase_date,
              cost_per_kg_paise, initial_weight_grams, initial_count,
              remaining_weight_grams, remaining_count, status, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
          `).run(
            batchNum,
            parsed.data.supplier_id,
            parsed.data.received_date,
            costPerKgPaise,
            liveWeightGrams,
            birdCount,
            liveWeightGrams,
            birdCount,
            `Quick Purchase PO #${po.po_number}`
          );
        }

          // Create distinct Stock Batch for FIFO tracking
          try {
            db.prepare(`
              INSERT INTO product_stock_batches (
                batch_number, product_variant_id, received_date,
                initial_quantity_grams, initial_quantity_units, initial_count,
                current_quantity_grams, current_quantity_units, current_count,
                unit_cost_paise, source_type, source_ref_id, status
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'purchase', ?, 'active')
            `).run(
              `BAT-PUR-${cleanDate}-${po.id}-${idx + 1}`,
              item.product_variant_id,
              parsed.data.received_date,
              deltaGrams,
              deltaUnits,
              countValue,
              deltaGrams,
              deltaUnits,
              countValue,
              item.unit_price_paise,
              po.id
            );
          } catch (e) {
            // If table not created yet or duplicate, log non-fatal
          }

        // Sync variant cost & stock cache
        productVariantsRepository.syncVariantCostCache(item.product_variant_id);
      });

      // 3. Create Purchase Invoice
      const invoiceNumber = `PI-${cleanDate}-${Date.now().toString().slice(-4)}`;
      const purchaseRefNumber = this.getNextPurchaseRefNumber(parsed.data.received_date);

      let supplierBillNumber = parsed.data.bill_number ? parsed.data.bill_number.trim() : '';
      if (!supplierBillNumber) {
        supplierBillNumber = this.generateAutoBillNumber(parsed.data.received_date);
      }

      const invoiceRepoInput: CreatePurchaseInvoiceRepoInput = {
        invoice_number: invoiceNumber,
        supplier_invoice_number: supplierBillNumber,
        purchase_ref_number: purchaseRefNumber,
        purchase_order_id: po.id,
        goods_receipt_id: grn.id,
        supplier_id: parsed.data.supplier_id,
        invoice_date: parsed.data.received_date,
        subtotal_paise: parsed.data.bill_amount_paise,
        total_amount_paise: parsed.data.bill_amount_paise,
        outstanding_amount_paise: parsed.data.payment_method === 'cash' ? 0 : parsed.data.bill_amount_paise,
        payment_status: parsed.data.payment_method === 'cash' ? 'paid' : 'unpaid',
        status: approvalStatus,
        file_path: parsed.data.bill_photo_path,
        created_by: userId,
        items: parsed.data.items.map(item => ({
          product_variant_id: item.product_variant_id,
          quantity: item.quantity,
          unit_price_paise: item.unit_price_paise,
          gst_rate_bps: 0,
          gst_amount_paise: 0,
          total_amount_paise: item.subtotal_paise,
        })),
      };
      const invoice = this.purchaseInvoiceRepo.create(invoiceRepoInput);

      // 4. Create Supplier Ledger
      this.supplierLedgerRepo.create({
        supplier_id: parsed.data.supplier_id,
        entry_date: parsed.data.received_date,
        ref_type: 'purchase_invoice',
        ref_id: invoice.id,
        description: `Quick Purchase: ${invoiceRepoInput.supplier_invoice_number}`,
        credit_paise: parsed.data.bill_amount_paise,
        status: approvalStatus,
      });

      // 4b. Log to inventory_ledger for unified stock tracking
      parsed.data.items.forEach(item => {
        const variant = container.productRepository.findVariantById(item.product_variant_id);
        const isWeight = item.unit_type === 'weight' || item.unit_type === 'live_dual' || variant?.unit_type === 'weight';
        const deltaGrams = isWeight ? Math.round(item.quantity * 1000) : null;
        const deltaUnits = !isWeight ? item.quantity : null;

        inventoryLedgerService.recordEntry({
          product_variant_id: item.product_variant_id,
          action_type: 'purchase',
          quantity_grams: deltaGrams,
          quantity_units: deltaUnits,
          unit_cost_paise: item.unit_price_paise,
          reference_type: 'purchase_invoice',
          reference_id: invoice.id,
          reference_number: invoice.supplier_invoice_number || invoice.invoice_number,
          notes: 'Quick Purchase',
          created_by: userId,
        });
      });

      // 5. Cash Payment handling
      if (parsed.data.payment_method === 'cash') {
        const payment = container.supplierPaymentRepository.create({
          supplier_id: parsed.data.supplier_id,
          amount_paise: parsed.data.bill_amount_paise,
          payment_method: 'cash',
          reference_number: `CASH-${invoice.invoice_number}`,
          payment_date: parsed.data.received_date,
          notes: `Cash payment for invoice ${invoice.supplier_invoice_number}`,
          is_advance: 0,
          unallocated_amount_paise: 0,
          created_by: userId,
        });

        this.supplierLedgerRepo.create({
          supplier_id: parsed.data.supplier_id,
          entry_date: parsed.data.received_date,
          ref_type: 'payment',
          ref_id: payment.id,
          description: `Cash Payment for Invoice: ${invoice.supplier_invoice_number}`,
          debit_paise: parsed.data.bill_amount_paise,
          credit_paise: 0,
          status: approvalStatus,
        });

        db.prepare(`
          INSERT INTO supplier_payment_allocations (supplier_payment_id, purchase_invoice_id, allocated_amount_paise)
          VALUES (?, ?, ?)
        `).run(payment.id, invoice.id, parsed.data.bill_amount_paise);
      }

      return { invoice };
    });
  }

  private generateAutoBillNumber(receivedDate: string): string {
    const rawConn = container.databaseProvider.getRawConnection();
    const d = receivedDate ? new Date(receivedDate) : new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const datePattern = `${dd}${mm}${yyyy}`;

    const countRow = rawConn.prepare(`
      SELECT COUNT(*) as cnt FROM purchase_invoices 
      WHERE supplier_invoice_number LIKE ?
    `).get(`${datePattern}-%`) as { cnt: number } | undefined;

    const seq = (countRow?.cnt || 0) + 1;
    return `${datePattern}-${seq}`;
  }

  public getNextPurchaseRefNumber(receivedDate?: string): string {
    const db = container.databaseProvider.getRawConnection();
    let dateStr = '';
    if (receivedDate) {
      dateStr = receivedDate.replace(/[^0-9]/g, '').slice(0, 8); // YYYYMMDD
    }
    if (!dateStr || dateStr.length < 8) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      dateStr = `${yyyy}${mm}${dd}`;
    }

    const row = db.prepare('SELECT last_number FROM daily_purchase_sequences WHERE sequence_date = ?').get(dateStr) as { last_number: number } | undefined;
    const nextSeq = (row?.last_number || 0) + 1;

    db.prepare(`
      INSERT INTO daily_purchase_sequences (sequence_date, last_number) 
      VALUES (?, ?) 
      ON CONFLICT(sequence_date) DO UPDATE SET last_number = ?
    `).run(dateStr, nextSeq, nextSeq);

    return `PUR-${dateStr}-${String(nextSeq).padStart(3, '0')}`;
  }

  public getSupplierSnapshot(supplierId: number): SupplierSnapshot | null {
    if (!supplierId) return null;
    const db = container.databaseProvider.getRawConnection();
    const supplier = container.supplierProfileRepository.findById(supplierId);
    if (!supplier) return null;

    const lastPurchase = db.prepare(`
      SELECT invoice_date, total_amount_paise 
      FROM purchase_invoices 
      WHERE supplier_id = ? AND status != 'rejected'
      ORDER BY invoice_date DESC, id DESC LIMIT 1
    `).get(supplierId) as { invoice_date: string; total_amount_paise: number } | undefined;

    const lastPayment = db.prepare(`
      SELECT payment_date, amount_paise 
      FROM supplier_payments 
      WHERE supplier_id = ? 
      ORDER BY payment_date DESC, id DESC LIMIT 1
    `).get(supplierId) as { payment_date: string; amount_paise: number } | undefined;

    return {
      supplier_id: supplier.id,
      company_name: supplier.company_name,
      outstanding_balance_paise: supplier.outstanding_balance_paise,
      last_purchase_date: lastPurchase?.invoice_date,
      last_purchase_amount_paise: lastPurchase?.total_amount_paise,
      last_payment_date: lastPayment?.payment_date,
      last_payment_amount_paise: lastPayment?.amount_paise,
    };
  }

  public getPassbookLedger(params: { supplierId?: number; startDate?: string; endDate?: string; status?: string }): {
    entries: PassbookLedgerEntry[];
    summary: PurchasesMonthSummary;
  } {
    const db = container.databaseProvider.getRawConnection();
    let whereClauses: string[] = [];
    let queryParams: any[] = [];

    if (params.supplierId) {
      whereClauses.push('l.supplier_id = ?');
      queryParams.push(params.supplierId);
    }
    if (params.startDate) {
      whereClauses.push('l.entry_date >= ?');
      queryParams.push(params.startDate);
    }
    if (params.endDate) {
      whereClauses.push('l.entry_date <= ?');
      queryParams.push(params.endDate);
    }
    if (params.status && params.status !== 'all') {
      whereClauses.push('l.status = ?');
      queryParams.push(params.status);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const sql = `
      SELECT 
        l.id as ledger_id,
        l.supplier_id,
        s.company_name as supplier_name,
        l.entry_date,
        l.ref_type,
        l.ref_id,
        l.description,
        l.debit_paise,
        l.credit_paise,
        l.running_balance_paise,
        l.status,
        inv.purchase_ref_number,
        inv.supplier_invoice_number,
        inv.file_path,
        pay.payment_method
      FROM supplier_ledger l
      JOIN suppliers s ON s.id = l.supplier_id
      LEFT JOIN purchase_invoices inv ON l.ref_type = 'purchase_invoice' AND l.ref_id = inv.id
      LEFT JOIN supplier_payments pay ON l.ref_type = 'payment' AND l.ref_id = pay.id
      ${whereSql}
      ORDER BY l.entry_date DESC, l.id DESC
    `;

    const rawRows = db.prepare(sql).all(...queryParams) as any[];

    const entries: PassbookLedgerEntry[] = rawRows.map(row => {
      const isPurchase = row.ref_type === 'purchase_invoice';
      const isPayment = row.ref_type === 'payment';
      const type: 'IN' | 'OUT' = isPurchase ? 'IN' : 'OUT';
      const amountPaise = isPurchase ? row.credit_paise : row.debit_paise;

      let itemsSummary = '';
      if (isPurchase && row.ref_id) {
        const itemRows = db.prepare(`
          SELECT pi.quantity, pv.variant_name, p.name as product_name, pi.unit_price_paise
          FROM purchase_invoice_items pi
          JOIN product_variants pv ON pv.id = pi.product_variant_id
          JOIN products p ON p.id = pv.product_id
          WHERE pi.purchase_invoice_id = ?
        `).all(row.ref_id) as any[];
        itemsSummary = itemRows.map(i => `${i.product_name} (${i.quantity}x)`).join(', ');
      }

      return {
        id: `L-${row.ledger_id}`,
        entry_date: row.entry_date,
        type,
        ref_type: row.ref_type,
        ref_id: row.ref_id,
        purchase_ref_number: row.purchase_ref_number || (isPurchase ? `PUR-${row.ref_id}` : undefined),
        supplier_bill_number: row.supplier_invoice_number || undefined,
        supplier_id: row.supplier_id,
        supplier_name: row.supplier_name,
        description: row.description,
        items_summary: itemsSummary || undefined,
        amount_paise: amountPaise,
        payment_method: row.payment_method || undefined,
        status: row.status || 'approved',
        file_path: row.file_path || undefined,
        running_balance_paise: row.running_balance_paise,
      };
    });

    // Compute month summary metrics
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    let summarySql = `
      SELECT 
        SUM(CASE WHEN ref_type = 'purchase_invoice' AND status != 'rejected' THEN credit_paise ELSE 0 END) as total_purchased,
        SUM(CASE WHEN ref_type = 'payment' THEN debit_paise ELSE 0 END) as total_paid,
        SUM(CASE WHEN status = 'pending_approval' THEN 1 ELSE 0 END) as pending_count
      FROM supplier_ledger
      WHERE entry_date LIKE ?
    `;
    const summaryParams: any[] = [`${currentMonth}%`];
    if (params.supplierId) {
      summarySql += ` AND supplier_id = ?`;
      summaryParams.push(params.supplierId);
    }
    const sumRow = db.prepare(summarySql).get(...summaryParams) as any;

    let outstandingSql = `SELECT SUM(outstanding_balance_paise) as total_out FROM suppliers`;
    if (params.supplierId) {
      outstandingSql += ` WHERE id = ${params.supplierId}`;
    }
    const outRow = db.prepare(outstandingSql).get() as any;

    const summary: PurchasesMonthSummary = {
      total_purchased_paise: sumRow?.total_purchased || 0,
      total_paid_paise: sumRow?.total_paid || 0,
      total_outstanding_paise: outRow?.total_out || 0,
      pending_approval_count: sumRow?.pending_count || 0,
    };

    return { entries, summary };
  }

  public editPurchaseRecord(invoiceId: number, updateData: any, userId: number, reason: string): void {
    const parsed = QuickPurchaseSchema.safeParse(updateData);
    if (!parsed.success) {
      throw new ValidationError('Invalid quick purchase input for edit', parsed.error.flatten());
    }

    const db = container.databaseProvider.getRawConnection();
    const user = container.userRepository.findById(userId);
    if (!user || (user.role !== 'ADMIN' && user.role !== 'MANAGER')) {
      throw new ValidationError('Only Admin or Manager can edit purchase records');
    }

    // Lazy guarantee of is_edited column in purchase_invoices
    try {
      db.prepare('ALTER TABLE purchase_invoices ADD COLUMN is_edited INTEGER DEFAULT 0').run();
    } catch (_) {}

    const invoice = this.purchaseInvoiceRepo.findById(invoiceId);
    if (!invoice) throw new ValidationError('Invoice not found');

    container.databaseProvider.transaction(() => {
      // 1. REVERSE old inventory stock updates
      const oldItems = db.prepare('SELECT * FROM purchase_invoice_items WHERE purchase_invoice_id = ?').all(invoiceId) as any[];
      oldItems.forEach(item => {
        const variant = container.productRepository.findVariantById(item.product_variant_id);
        const isWeight = variant?.unit_type === 'weight' || variant?.unit_type === 'live_dual';
        const deltaGrams = isWeight ? Math.round(item.quantity * 1000) : null;
        const deltaUnits = variant?.unit_type === 'piece' ? item.quantity : null;
        
        // Subtract stock (reverse addition)
        const revGrams = deltaGrams !== null ? -deltaGrams : null;
        const revUnits = deltaUnits !== null ? -deltaUnits : null;
        this.inventoryRepo.updateLedgerStock(item.product_variant_id, revGrams, revUnits);
      });

      // Delete old stock batches, transactions
      db.prepare('DELETE FROM product_stock_batches WHERE source_type = "purchase" AND source_ref_id = ?').run(invoice.purchase_order_id);
      db.prepare('DELETE FROM stock_transactions WHERE transaction_type = "manual_adjustment" AND reference_id = ?').run(invoice.purchase_order_id);

      // 2. REVERSE supplier outstanding balance and ledger
      db.prepare('UPDATE suppliers SET outstanding_balance_paise = outstanding_balance_paise - ? WHERE id = ?')
        .run(invoice.total_amount_paise, invoice.supplier_id);
      
      db.prepare('DELETE FROM supplier_ledger WHERE ref_type = "purchase_invoice" AND ref_id = ?').run(invoiceId);

      // Check if there was cash payment and reverse it
      const cashPayment = db.prepare('SELECT id, amount_paise FROM supplier_payments WHERE reference_number = ?')
        .get(`CASH-${invoice.invoice_number}`) as { id: number; amount_paise: number } | undefined;
      if (cashPayment) {
        db.prepare('UPDATE suppliers SET outstanding_balance_paise = outstanding_balance_paise + ? WHERE id = ?')
          .run(cashPayment.amount_paise, invoice.supplier_id);
        db.prepare('DELETE FROM supplier_ledger WHERE ref_type = "payment" AND ref_id = ?').run(cashPayment.id);
        db.prepare('DELETE FROM supplier_payment_allocations WHERE supplier_payment_id = ?').run(cashPayment.id);
        db.prepare('DELETE FROM supplier_payments WHERE id = ?').run(cashPayment.id);
      }

      // 3. DELETE old sub-records
      db.prepare('DELETE FROM purchase_invoice_items WHERE purchase_invoice_id = ?').run(invoiceId);
      db.prepare('DELETE FROM supplier_price_history WHERE purchase_invoice_id = ?').run(invoiceId);
      db.prepare('DELETE FROM goods_receipt_items WHERE goods_receipt_id = ?').run(invoice.goods_receipt_id);
      db.prepare('DELETE FROM goods_receipts WHERE id = ?').run(invoice.goods_receipt_id);
      db.prepare('DELETE FROM purchase_order_items WHERE purchase_order_id = ?').run(invoice.purchase_order_id);
      db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(invoice.purchase_order_id);

      // 4. WRITE audit log
      db.prepare(`
        INSERT INTO purchase_edit_audit_logs (purchase_invoice_id, edited_by, edit_reason, old_values_json, new_values_json)
        VALUES (?, ?, ?, ?, ?)
      `).run(invoiceId, userId, reason, JSON.stringify(invoice), JSON.stringify(parsed.data));

      // 5. RE-APPLY new details
      const cleanDate = parsed.data.received_date.replace(/[^0-9]/g, '').slice(0, 8);
      const approvalStatus = 'approved';

      // Re-create PO
      const poRepoInput: CreatePurchaseOrderRepoInput = {
        po_number: `PO-${cleanDate}-${Date.now().toString().slice(-4)}`,
        supplier_id: parsed.data.supplier_id,
        order_date: parsed.data.received_date,
        expected_delivery_date: parsed.data.received_date,
        status: 'approved',
        notes: parsed.data.notes || 'Quick Purchase (Edited)',
        created_by: userId,
        items: parsed.data.items.map(item => ({
          product_variant_id: item.product_variant_id,
          unit_type: item.unit_type,
          quantity_ordered: item.quantity,
          unit_price_paise: item.unit_price_paise,
          subtotal_paise: item.subtotal_paise,
        })),
      };
      const po = this.purchaseOrderRepo.create(poRepoInput);

      // Re-create GRN
      const grnRepoInput = {
        grn_number: `GRN-${Date.now()}`,
        purchase_order_id: po.id,
        supplier_id: parsed.data.supplier_id,
        received_date: parsed.data.received_date,
        delivery_note_number: null,
        received_by: userId,
        notes: 'Quick Purchase Receipt (Edited)',
        items: parsed.data.items.map(item => ({
          purchase_order_item_id: null,
          product_variant_id: item.product_variant_id,
          quantity_accepted: item.quantity,
          quantity_rejected: 0,
          rejection_reason: null,
          batch_number: null,
          expiry_date: null,
        })),
      };
      const grn = this.goodsReceiptRepo.create(grnRepoInput);
      this.purchaseOrderRepo.updateStatus(po.id, 'received');

      // Update Stock Ledger, Create Batch & Transaction for NEW items
      parsed.data.items.forEach((item, idx) => {
        const variant = container.productRepository.findVariantById(item.product_variant_id);
        const isLiveDual = item.unit_type === 'live_dual' || variant?.unit_type === 'live_dual';
        const isWeight = item.unit_type === 'weight' || isLiveDual;
        const deltaGrams = isWeight ? Math.round(item.quantity * 1000) : null;
        const deltaUnits = item.unit_type === 'piece' ? item.quantity : null;
        const countValue = isLiveDual && item.count !== undefined ? item.count : null;

        this.inventoryRepo.updateLedgerStock(item.product_variant_id, deltaGrams, deltaUnits);

        this.inventoryRepo.createTransaction({
          product_variant_id: item.product_variant_id,
          transaction_type: 'manual_adjustment',
          reference_id: po.id,
          quantity_grams: deltaGrams,
          quantity_units: deltaUnits,
        });

        db.prepare(`
          INSERT INTO product_stock_batches (
            batch_number, product_variant_id, received_date,
            initial_quantity_grams, initial_quantity_units, initial_count,
            current_quantity_grams, current_quantity_units, current_count,
            unit_cost_paise, source_type, source_ref_id, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'purchase', ?, 'active')
        `).run(
          `BAT-PUR-${cleanDate}-${po.id}-${idx + 1}`,
          item.product_variant_id,
          parsed.data.received_date,
          deltaGrams,
          deltaUnits,
          countValue,
          deltaGrams,
          deltaUnits,
          countValue,
          item.unit_price_paise,
          po.id
        );

        productVariantsRepository.syncVariantCostCache(item.product_variant_id);
      });

      // 6. UPDATE purchase_invoices row
      const isEdited = 1;
      const outstandingAmount = parsed.data.payment_method === 'cash' ? 0 : parsed.data.bill_amount_paise;
      const paymentStatus = parsed.data.payment_method === 'cash' ? 'paid' : 'unpaid';

      db.prepare(`
        UPDATE purchase_invoices
        SET supplier_id = ?,
            invoice_date = ?,
            subtotal_paise = ?,
            total_amount_paise = ?,
            outstanding_amount_paise = ?,
            payment_status = ?,
            purchase_order_id = ?,
            goods_receipt_id = ?,
            is_edited = ?,
            notes = ?
        WHERE id = ?
      `).run(
        parsed.data.supplier_id,
        parsed.data.received_date,
        parsed.data.bill_amount_paise,
        parsed.data.bill_amount_paise,
        outstandingAmount,
        paymentStatus,
        po.id,
        grn.id,
        isEdited,
        parsed.data.notes || 'Quick Purchase (Edited)',
        invoiceId
      );

      // Re-create invoice items
      const itemStmt = db.prepare(`
        INSERT INTO purchase_invoice_items (
          purchase_invoice_id, product_variant_id, quantity, unit_price_paise, gst_rate_bps, gst_amount_paise, total_amount_paise
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      parsed.data.items.forEach(item => {
        itemStmt.run(
          invoiceId,
          item.product_variant_id,
          item.quantity,
          item.unit_price_paise,
          0,
          0,
          item.subtotal_paise
        );

        db.prepare(`
          INSERT INTO supplier_price_history (supplier_id, product_variant_id, unit_price_paise, effective_date, purchase_invoice_id)
          VALUES (?, ?, ?, ?, ?)
        `).run(parsed.data.supplier_id, item.product_variant_id, item.unit_price_paise, parsed.data.received_date, invoiceId);
      });

      // Re-apply supplier balance addition
      db.prepare(`
        UPDATE suppliers 
        SET outstanding_balance_paise = outstanding_balance_paise + ?
        WHERE id = ?
      `).run(parsed.data.bill_amount_paise, parsed.data.supplier_id);

      // Re-create invoice ledger row
      this.supplierLedgerRepo.create({
        supplier_id: parsed.data.supplier_id,
        entry_date: parsed.data.received_date,
        ref_type: 'purchase_invoice',
        ref_id: invoiceId,
        description: `Quick Purchase: ${invoice.supplier_invoice_number} (Edited)`,
        credit_paise: parsed.data.bill_amount_paise,
        status: approvalStatus,
      });

      // If new payment_method is cash:
      if (parsed.data.payment_method === 'cash') {
        const payment = container.supplierPaymentRepository.create({
          supplier_id: parsed.data.supplier_id,
          amount_paise: parsed.data.bill_amount_paise,
          payment_method: 'cash',
          reference_number: `CASH-${invoice.invoice_number}`,
          payment_date: parsed.data.received_date,
          notes: `Cash payment for invoice ${invoice.supplier_invoice_number} (Edited)`,
          is_advance: 0,
          unallocated_amount_paise: 0,
          created_by: userId,
        });

        this.supplierLedgerRepo.create({
          supplier_id: parsed.data.supplier_id,
          entry_date: parsed.data.received_date,
          ref_type: 'payment',
          ref_id: payment.id,
          description: `Cash Payment for Invoice: ${invoice.supplier_invoice_number} (Edited)`,
          debit_paise: parsed.data.bill_amount_paise,
          credit_paise: 0,
          status: approvalStatus,
        });

        db.prepare(`
          INSERT INTO supplier_payment_allocations (supplier_payment_id, purchase_invoice_id, allocated_amount_paise)
          VALUES (?, ?, ?)
        `).run(payment.id, invoiceId, parsed.data.bill_amount_paise);
      }
    });
  }

  public async updateInvoiceStatus(invoiceId: number, status: 'approved' | 'rejected'): Promise<void> {
    return container.databaseProvider.transaction(() => {
      this.purchaseInvoiceRepo.updateStatus(invoiceId, status);
      
      const db = container.databaseProvider.getRawConnection();
      db.prepare(`
        UPDATE supplier_ledger 
        SET status = ? 
        WHERE ref_type = 'purchase_invoice' AND ref_id = ?
      `).run(status, invoiceId);
    });
  }
}

export const procurementService = new ProcurementService();
export default procurementService;

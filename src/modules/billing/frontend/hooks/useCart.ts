import { create } from 'zustand';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';
import type { InvoiceDetail, InvoiceItem, Invoice } from '../types/billing.types';

interface CartState {
  activeInvoiceId: number | null;
  activeInvoice: Invoice | null;
  items: InvoiceItem[];
  isGstInvoice: boolean;
  isLoading: boolean;

  initActiveDraft: () => Promise<void>;
  createDraft: (isGst?: boolean) => Promise<void>;
  loadInvoice: (invoiceId: number) => Promise<void>;
  addItem: (args: {
    product_variant_id: number;
    quantity_grams: number | null;
    quantity_units: number | null;
    override_rate_paise?: number | null;
    override_reason?: string | null;
    overridden_by?: number | null;
    stock_source?: 'processed_chicken' | 'mutton_regular' | 'refrigerator' | 'none';
    refrigerator_stock_id?: number | null;
  }) => Promise<void>;
  updateItemQuantity: (itemId: number, quantityGrams: number | null, quantityUnits: number | null) => Promise<void>;
  updateItemManualAllocations: (itemId: number, allocations: any[]) => void;
  removeItem: (itemId: number) => Promise<void>;
  holdInvoice: () => Promise<void>;
  resumeInvoice: (invoiceId: number) => Promise<void>;
  completeInvoice: (opts?: {
    allow_negative_stock_override?: boolean;
    manager_pin?: string;
    override_reason?: string;
    discount_percent?: number;
    flat_deduction_paise?: number;
    dressing_charge_paise?: number;
    narration?: string | null;
    print_delivery_token?: boolean;
    is_delivery?: boolean;
    delivery_charge_paise?: number;
  }) => Promise<InvoiceDetail | null>;
  toggleGst: (isGst: boolean, gstNumber?: string | null) => Promise<void>;
  recordPayment: (method: 'cash' | 'upi' | 'card' | 'split', amountPaise: number, referenceNumber?: string | null) => Promise<void>;
  clearCart: () => void;
  refreshInvoice: () => Promise<void>;
  linkCustomer: (customerId: number | null) => Promise<void>;
}

async function invokeIPC(channel: string, args?: Record<string, unknown>): Promise<InvoiceDetail> {
  const res = await window.api.invoke(channel, args);
  if (!res.success) throw new Error(res.error?.message || 'IPC call failed');
  return res.data as InvoiceDetail;
}

function applyInvoiceData(set: (fn: (state: CartState) => Partial<CartState>) => void, data: InvoiceDetail) {
  set(() => ({
    activeInvoiceId: data.invoice.id,
    activeInvoice: data.invoice,
    items: data.items,
    isGstInvoice: data.invoice.is_gst_invoice === 1,
    isLoading: false,
  }));
}

export const useCart = create<CartState>((set, get) => ({
  activeInvoiceId: null,
  activeInvoice: null,
  items: [],
  isGstInvoice: false,
  isLoading: false,

  initActiveDraft: async () => {
    try {
      set(() => ({ isLoading: true }));
      const res = await window.api.invoke(IPC_CHANNELS.BILLING.GET_ACTIVE_DRAFT);
      if (res.success && res.data) {
        applyInvoiceData(set, res.data);
      } else {
        set(() => ({ isLoading: false }));
      }
    } catch (e) {
      console.error('Failed to init active draft:', e);
      set(() => ({ isLoading: false }));
    }
  },

  createDraft: async (isGst = false) => {
    set(() => ({ isLoading: true }));
    const res = await window.api.invoke(IPC_CHANNELS.BILLING.CREATE_INVOICE, { is_gst_invoice: isGst });
    if (!res.success) { set(() => ({ isLoading: false })); throw new Error(res.error?.message); }
    const invoice = res.data as Invoice;
    set(() => ({
      activeInvoiceId: invoice.id,
      activeInvoice: invoice,
      items: [],
      isGstInvoice: isGst,
      isLoading: false,
    }));
  },

  loadInvoice: async (invoiceId: number) => {
    set(() => ({ isLoading: true }));
    const data = await invokeIPC(IPC_CHANNELS.BILLING.GET_INVOICE, { invoice_id: invoiceId });
    applyInvoiceData(set, data);
  },

  addItem: async (args) => {
    let { activeInvoiceId } = get();
    if (!activeInvoiceId) {
      await get().initActiveDraft();
      activeInvoiceId = get().activeInvoiceId;
    }
    if (!activeInvoiceId) {
      await get().createDraft();
      activeInvoiceId = get().activeInvoiceId;
    }
    if (!activeInvoiceId) return;
    set(() => ({ isLoading: true }));
    const data = await invokeIPC(IPC_CHANNELS.BILLING.ADD_ITEM, { invoice_id: activeInvoiceId, ...args });
    applyInvoiceData(set, data);
  },

  updateItemQuantity: async (itemId, quantityGrams, quantityUnits) => {
    set(() => ({ isLoading: true }));
    const data = await invokeIPC(IPC_CHANNELS.BILLING.UPDATE_ITEM_QTY, { item_id: itemId, quantity_grams: quantityGrams, quantity_units: quantityUnits });
    applyInvoiceData(set, data);
  },

  updateItemManualAllocations: (itemId, allocations) => {
    set(state => ({
      items: state.items.map(item =>
        item.id === itemId
          ? { ...item, manual_batch_allocations: allocations, is_manual_batch_selected: allocations.length > 0 ? 1 : 0 }
          : item
      )
    }));
  },

  removeItem: async (itemId) => {
    const { activeInvoiceId } = get();
    if (!activeInvoiceId) return;
    set(() => ({ isLoading: true }));
    const data = await invokeIPC(IPC_CHANNELS.BILLING.REMOVE_ITEM, { item_id: itemId });
    applyInvoiceData(set, data);
  },

  holdInvoice: async () => {
    const { activeInvoiceId } = get();
    if (!activeInvoiceId) return;
    await window.api.invoke(IPC_CHANNELS.BILLING.HOLD_INVOICE, { invoice_id: activeInvoiceId });
    set(() => ({ activeInvoiceId: null, activeInvoice: null, items: [], isGstInvoice: false, isLoading: false }));
  },

  resumeInvoice: async (invoiceId: number) => {
    set(() => ({ isLoading: true }));
    const data = await invokeIPC(IPC_CHANNELS.BILLING.RESUME_INVOICE, { invoice_id: invoiceId });
    applyInvoiceData(set, data);
  },

  completeInvoice: async (opts) => {
    const { activeInvoiceId, items } = get();
    if (!activeInvoiceId) return null;
    set(() => ({ isLoading: true }));
    try {
      // Map manual batch allocations per item
      const itemsWithManual = items.map(i => ({
        id: i.id,
        product_variant_id: i.product_variant_id,
        quantity_grams: i.quantity_grams,
        quantity_units: i.quantity_units,
        manual_batch_allocations: i.manual_batch_allocations || undefined,
      }));

      const payload: any = { invoiceId: activeInvoiceId, items: itemsWithManual, ...opts };
      const data = await invokeIPC(IPC_CHANNELS.BILLING.COMPLETE_INVOICE, payload);

      set(() => ({ activeInvoiceId: null, activeInvoice: null, items: [], isGstInvoice: false, isLoading: false }));
      return data;
    } catch (err) {
      set(() => ({ isLoading: false }));
      throw err;
    }
  },

  toggleGst: async (isGst, gstNumber) => {
    const { activeInvoiceId } = get();
    if (!activeInvoiceId) return;
    set(() => ({ isLoading: true }));
    const data = await invokeIPC(IPC_CHANNELS.BILLING.TOGGLE_GST, { invoice_id: activeInvoiceId, is_gst_invoice: isGst, gst_number_snapshot: gstNumber ?? null });
    applyInvoiceData(set, data);
  },

  recordPayment: async (method, amountPaise, referenceNumber) => {
    const { activeInvoiceId } = get();
    if (!activeInvoiceId) return;
    set(() => ({ isLoading: true }));
    const data = await invokeIPC(IPC_CHANNELS.BILLING.RECORD_PAYMENT, { invoice_id: activeInvoiceId, method, amount_paise: amountPaise, reference_number: referenceNumber ?? null });
    applyInvoiceData(set, data);
  },

  clearCart: () => {
    set(() => ({ activeInvoiceId: null, activeInvoice: null, items: [], isGstInvoice: false, isLoading: false }));
  },

  refreshInvoice: async () => {
    const { activeInvoiceId } = get();
    if (!activeInvoiceId) return;
    set(() => ({ isLoading: true }));
    const data = await invokeIPC(IPC_CHANNELS.BILLING.GET_INVOICE, { invoice_id: activeInvoiceId });
    applyInvoiceData(set, data);
  },

  linkCustomer: async (customerId) => {
    const { activeInvoiceId } = get();
    if (!activeInvoiceId) return;
    set(() => ({ isLoading: true }));
    const data = await invokeIPC(IPC_CHANNELS.BILLING.LINK_CUSTOMER, { invoice_id: activeInvoiceId, customer_id: customerId });
    applyInvoiceData(set, data);
  },
}));

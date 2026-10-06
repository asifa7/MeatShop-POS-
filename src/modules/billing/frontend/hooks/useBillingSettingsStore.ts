import { create } from 'zustand';
import type { InvoiceDetail } from '../types/billing.types';

interface BillingSettingsStore {
  skipPaymentConfirmation: boolean;
  setSkipPaymentConfirmation: (val: boolean) => void;
  lastCompletedInvoice: InvoiceDetail | null;
  setLastCompletedInvoice: (inv: InvoiceDetail | null) => void;
  isPaymentSelectionFocused: boolean;
  setIsPaymentSelectionFocused: (val: boolean) => void;
  isLastBillPanelExpanded: boolean;
  setIsLastBillPanelExpanded: (val: boolean) => void;
}

const getStoredSkipConfirmation = (): boolean => {
  try {
    const val = localStorage.getItem('pos_print_without_confirming');
    if (val !== null) return val === 'true';
  } catch {}
  return true; // Default to fast no-confirm print
};

const getStoredLastInvoice = (): InvoiceDetail | null => {
  try {
    localStorage.removeItem('pos_last_completed_invoice');
  } catch {}
  return null;
};

export const useBillingSettingsStore = create<BillingSettingsStore>((set) => ({
  skipPaymentConfirmation: getStoredSkipConfirmation(),
  setSkipPaymentConfirmation: (val: boolean) => {
    try {
      localStorage.setItem('pos_print_without_confirming', String(val));
    } catch {}
    set({ skipPaymentConfirmation: val });
  },

  lastCompletedInvoice: null,
  setLastCompletedInvoice: (inv: InvoiceDetail | null) => {
    set({ lastCompletedInvoice: inv });
  },

  isPaymentSelectionFocused: false,
  setIsPaymentSelectionFocused: (val: boolean) => set({ isPaymentSelectionFocused: val }),

  isLastBillPanelExpanded: false,
  setIsLastBillPanelExpanded: (val: boolean) => set({ isLastBillPanelExpanded: val }),
}));

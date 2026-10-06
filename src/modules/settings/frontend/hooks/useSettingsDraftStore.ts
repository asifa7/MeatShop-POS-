import { create } from 'zustand';
import { AppConfig } from '../../../../core/shared/types';
import { AppearanceConfig } from '../../../../core/theme/AppearanceContext';
import { POSShortcuts, DEFAULT_POS_SHORTCUTS } from '../../../billing/frontend/hooks/usePOSShortcutsStore';

export type SettingsCategoryId =
  | 'business'
  | 'billing'
  | 'tax'
  | 'payments'
  | 'cashbox'
  | 'inventory'
  | 'returns'
  | 'yield_ratios'
  | 'users_permissions'
  | 'hardware'
  | 'appearance'
  | 'shortcuts'
  | 'system_data'
  | 'whatsapp';

export interface YieldRatiosDraft {
  chickenWholeRatio: number;
  chickenBonelessRatio: number;
  goatLiveToDressedPercent: number;
}

function getStoredReceiptTemplate(): any {
  try {
    const raw = localStorage.getItem('pos_printer_receipt_template');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

function persistReceiptTemplate(tmpl?: any) {
  if (!tmpl) return;
  try {
    localStorage.setItem('pos_printer_receipt_template', JSON.stringify(tmpl));
  } catch (e) {}
}

export const DEFAULT_APP_CONFIG_DRAFT: AppConfig = {
  env: 'development',
  dbPath: 'dev.db',
  shopInfo: {
    name: 'My Premium Meat Shop',
    address: '123 Market Square, Bangalore',
    phone: '+91 98765 43210',
    gstin: '29AAAAA0000A1Z5',
    currencySymbol: '₹',
  },
  business: {
    logoPath: '',
    email: 'contact@meatshop.com',
    pan: 'ABCDE1234F',
    financialYear: '2026-2027',
  },
  invoice: {
    numberingMode: 'continuous',
    prefix: 'INV-',
    startingNumber: 1,
    termsAndConditions: 'Goods once sold cannot be returned without receipt.',
    copiesCount: 1,
  },
  tax: {
    gstEnabled: true,
    pricingMode: 'exclusive',
    defaultGstPercent: 5,
    taxRounding: 'nearest',
    rates: [0, 5, 12, 18, 28],
  },
  payments: {
    enabledMethods: ['cash', 'upi', 'card', 'split'],
    defaultPaymentMethod: 'cash',
    allowSplit: true,
    allowCredit: true,
  },
  cashbox: {
    enableShifts: true,
    requireOpeningCash: true,
    requireClosingCashCount: true,
    denominationsEnabled: [500, 200, 100, 50, 20, 10, 5, 2, 1],
    allowWithdrawal: true,
    allowDeposit: true,
    allowAdjustment: true,
    managerApprovalRequired: false,
    discrepancyThresholdPaise: 50000,
  },
  inventory: {
    trackingEnabled: true,
    allowNegativeStock: true,
    defaultLowStockThreshold: 5,
    alertLowStock: true,
    alertOutOfStock: true,
    valuationMethod: 'FIFO',
    batchTracking: true,
    expiryTracking: true,
    defaultUnit: 'kg',
  },
  returns: {
    returnsEnabled: true,
    returnPeriodDays: 7,
    allowPartialReturn: true,
    allowExchange: true,
    refundToOriginal: true,
    cashRefund: true,
    storeCredit: true,
    requireReturnReason: true,
    managerApproval: false,
    autoRestock: true,
  },
  theme: 'dark',
  hardware: {
    printerName: '',
    scalePort: '',
    scaleBaudRate: 9600,
    barcodeScannerEnabled: true,
    cashDrawerEnabled: true,
  },
  receiptTemplate: {
    paperWidth: '80mm',
    headerMessage: 'Fresh Quality Meats Daily',
    footerMessage: 'Thank you for your business! Visit again.',
    showGstBreakdown: true,
    autoPrintOnComplete: true,
    showLogo: true,
    showHsn: true,
    showDiscount: true,
    showCashier: true,
    showCustomer: true,
    leftMarginMm: 0,
    topMarginMm: 0,
    rightMarginMm: 8,
    fontFamily: 'Consolas',
    fontSize: 'medium',
    headerAlignment: 'left',
    itemWidthPercent: 40,
    qtyWidthPercent: 20,
    rateWidthPercent: 20,
    amountWidthPercent: 20,
    billPrintClosingBalance: true,
    cardBillDouble: false,
    subBillPrint: false,
    cashDrawerOpen: false,
    tamilFont: false,
    splitAmount: false,
    cashTender: false,
    customerCredit: false,
    crmPoints: false,
    dosPrinter: false,
    discountEveryLine: false,
    noOfBillPrint: 1,
    secondBillDelayMs: 100,
    duplicateCopyLabel: 'Duplicate Copy',
    topSlogan: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    pinCode: '',
    footerCondition1: '',
    footerCondition2: '',
    footerCondition3: '',
    footerMsg1: '',
    footerMsg2: '',
    softwareMobileNo: '',
    whatsAppSendMode: 'direct',
    whatsAppMetaApiKey: '',
    whatsAppMetaPhoneId: '',
  },
  billingSettings: {
    skipPaymentConfirmation: false,
    enableCalculatorWidget: true,
    defaultPaymentMethod: 'cash',
  },
  backup: {
    backupDir: '',
    autoBackupOnClose: true,
    maxBackupsToKeep: 7,
  },
  whatsAppConfig: {
    maxRetries: 3,
    retryBackoffSeconds: 30,
    billCaptionTemplate:
      "🧾 *{shopName}*\nDear *{customerName}*, greetings from {shopName}! 🙏\n\n📄 *Bill No:* {billNo}\n💰 *Bill Total:* ₹{netAmount}\n📅 *Date:* {date}\n\nAttached is your digital bill receipt. Thank you for choosing us! ✨",
    deliveryMessageTemplate:
      "🛵 *Order Confirmed - Will deliver shortly!*\nDear *{customerName}*, your order (#{billNo}) is freshly prepared and out for delivery shortly. Thank you! 🙏",
  },
};

export const DEFAULT_APPEARANCE_DRAFT: AppearanceConfig = {
  layoutType: 'touch',
  tileSize: 'medium',
  cartDisplay: 'detailed',
  mode: 'light',
  accentColor: 'teal',
  skipPaymentConfirmation: false,
  showCalculatorWidget: true,
  defaultPaymentMethod: 'cash',
};

export const DEFAULT_YIELD_RATIOS_DRAFT: YieldRatiosDraft = {
  chickenWholeRatio: 1.60,
  chickenBonelessRatio: 1.90,
  goatLiveToDressedPercent: 58.0,
};

interface SettingsDraftState {
  activeCategory: SettingsCategoryId;
  searchQuery: string;
  isDirty: boolean;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  errorMessage: string | null;

  // Baseline Server / Initial Configs
  originalConfig: AppConfig;
  originalAppearance: AppearanceConfig;
  originalShortcuts: POSShortcuts;
  originalYieldRatios: YieldRatiosDraft;

  // Working Draft Configs
  draftConfig: AppConfig;
  draftAppearance: AppearanceConfig;
  draftShortcuts: POSShortcuts;
  draftYieldRatios: YieldRatiosDraft;

  // Actions
  setActiveCategory: (cat: SettingsCategoryId) => void;
  setSearchQuery: (query: string) => void;
  initBaselines: (
    config: AppConfig,
    appearance: AppearanceConfig,
    shortcuts: POSShortcuts,
    yieldRatios: YieldRatiosDraft
  ) => void;
  updateDraftConfig: (updater: (prev: AppConfig) => AppConfig) => void;
  updateDraftAppearance: (updater: (prev: AppearanceConfig) => AppearanceConfig) => void;
  updateDraftShortcuts: (updater: (prev: POSShortcuts) => POSShortcuts) => void;
  updateDraftYieldRatios: (updater: (prev: YieldRatiosDraft) => YieldRatiosDraft) => void;
  resetCategoryToDefaults: (cat: SettingsCategoryId) => void;
  discardChanges: () => void;
  setSaveStatus: (status: 'idle' | 'saving' | 'saved' | 'error', err?: string | null) => void;
}

export const useSettingsDraftStore = create<SettingsDraftState>((set) => ({
  activeCategory: 'business',
  searchQuery: '',
  isDirty: false,
  saveStatus: 'idle',
  errorMessage: null,

  originalConfig: DEFAULT_APP_CONFIG_DRAFT,
  originalAppearance: DEFAULT_APPEARANCE_DRAFT,
  originalShortcuts: DEFAULT_POS_SHORTCUTS,
  originalYieldRatios: DEFAULT_YIELD_RATIOS_DRAFT,

  draftConfig: DEFAULT_APP_CONFIG_DRAFT,
  draftAppearance: DEFAULT_APPEARANCE_DRAFT,
  draftShortcuts: DEFAULT_POS_SHORTCUTS,
  draftYieldRatios: DEFAULT_YIELD_RATIOS_DRAFT,

  setActiveCategory: (activeCategory) => set({ activeCategory }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  initBaselines: (config, appearance, shortcuts, yieldRatios) => {
    set((state) => {
      const storedTmpl = getStoredReceiptTemplate();
      const mergedConfig = JSON.parse(JSON.stringify(config));
      mergedConfig.receiptTemplate = {
        ...DEFAULT_APP_CONFIG_DRAFT.receiptTemplate,
        ...storedTmpl,
        ...(mergedConfig.receiptTemplate || {}),
      };

      // If user has unsaved changes in the draft, preserve their changes across tab switches
      if (state.isDirty) {
        return {
          originalConfig: mergedConfig,
          originalAppearance: appearance,
          originalShortcuts: shortcuts,
          originalYieldRatios: yieldRatios,
        };
      }
      return {
        originalConfig: mergedConfig,
        originalAppearance: appearance,
        originalShortcuts: shortcuts,
        originalYieldRatios: yieldRatios,
        draftConfig: mergedConfig,
        draftAppearance: JSON.parse(JSON.stringify(appearance)),
        draftShortcuts: JSON.parse(JSON.stringify(shortcuts)),
        draftYieldRatios: JSON.parse(JSON.stringify(yieldRatios)),
        isDirty: false,
        saveStatus: 'idle',
        errorMessage: null,
      };
    });
  },

  updateDraftConfig: (updater) => {
    set((state) => {
      const next = updater(state.draftConfig);
      if (next.receiptTemplate) {
        persistReceiptTemplate(next.receiptTemplate);
      }
      return {
        draftConfig: next,
        isDirty: true,
        saveStatus: 'idle',
      };
    });
  },

  updateDraftAppearance: (updater) => {
    set((state) => {
      const next = updater(state.draftAppearance);
      return {
        draftAppearance: next,
        isDirty: true,
        saveStatus: 'idle',
      };
    });
  },

  updateDraftShortcuts: (updater) => {
    set((state) => {
      const next = updater(state.draftShortcuts);
      return {
        draftShortcuts: next,
        isDirty: true,
        saveStatus: 'idle',
      };
    });
  },

  updateDraftYieldRatios: (updater) => {
    set((state) => {
      const next = updater(state.draftYieldRatios);
      return {
        draftYieldRatios: next,
        isDirty: true,
        saveStatus: 'idle',
      };
    });
  },

  resetCategoryToDefaults: (cat) => {
    set((state) => {
      const draftConfig = { ...state.draftConfig };
      let draftAppearance = { ...state.draftAppearance };
      let draftShortcuts = { ...state.draftShortcuts };
      let draftYieldRatios = { ...state.draftYieldRatios };

      switch (cat) {
        case 'business':
          draftConfig.shopInfo = { ...DEFAULT_APP_CONFIG_DRAFT.shopInfo };
          draftConfig.business = { ...DEFAULT_APP_CONFIG_DRAFT.business! };
          break;
        case 'billing':
          draftConfig.invoice = { ...DEFAULT_APP_CONFIG_DRAFT.invoice! };
          draftConfig.receiptTemplate = { ...DEFAULT_APP_CONFIG_DRAFT.receiptTemplate! };
          draftConfig.billingSettings = { ...DEFAULT_APP_CONFIG_DRAFT.billingSettings! };
          break;
        case 'tax':
          draftConfig.tax = { ...DEFAULT_APP_CONFIG_DRAFT.tax! };
          break;
        case 'payments':
          draftConfig.payments = { ...DEFAULT_APP_CONFIG_DRAFT.payments! };
          break;
        case 'cashbox':
          draftConfig.cashbox = { ...DEFAULT_APP_CONFIG_DRAFT.cashbox! };
          break;
        case 'inventory':
          draftConfig.inventory = { ...DEFAULT_APP_CONFIG_DRAFT.inventory! };
          break;
        case 'returns':
          draftConfig.returns = { ...DEFAULT_APP_CONFIG_DRAFT.returns! };
          break;
        case 'yield_ratios':
          draftYieldRatios = { ...DEFAULT_YIELD_RATIOS_DRAFT };
          break;
        case 'hardware':
          draftConfig.hardware = { ...DEFAULT_APP_CONFIG_DRAFT.hardware };
          draftConfig.receiptTemplate = { ...DEFAULT_APP_CONFIG_DRAFT.receiptTemplate! };
          break;
        case 'appearance':
          draftAppearance = { ...DEFAULT_APPEARANCE_DRAFT };
          break;
        case 'shortcuts':
          draftShortcuts = { ...DEFAULT_POS_SHORTCUTS };
          break;
      }

      return {
        draftConfig,
        draftAppearance,
        draftShortcuts,
        draftYieldRatios,
        isDirty: true,
        saveStatus: 'idle',
      };
    });
  },

  discardChanges: () => {
    set((state) => ({
      draftConfig: JSON.parse(JSON.stringify(state.originalConfig)),
      draftAppearance: JSON.parse(JSON.stringify(state.originalAppearance)),
      draftShortcuts: JSON.parse(JSON.stringify(state.originalShortcuts)),
      draftYieldRatios: JSON.parse(JSON.stringify(state.originalYieldRatios)),
      isDirty: false,
      saveStatus: 'idle',
      errorMessage: null,
    }));
  },

  setSaveStatus: (saveStatus, errorMessage: string | null = null) => {
    set({ saveStatus, errorMessage });
    if (saveStatus === 'saved') {
      set((state) => ({
        originalConfig: JSON.parse(JSON.stringify(state.draftConfig)),
        originalAppearance: JSON.parse(JSON.stringify(state.draftAppearance)),
        originalShortcuts: JSON.parse(JSON.stringify(state.draftShortcuts)),
        originalYieldRatios: JSON.parse(JSON.stringify(state.draftYieldRatios)),
        isDirty: false,
      }));
    }
  },
}));

export interface ShopInfo {
  name: string;
  address: string;
  phone: string;
  gstin: string;
  currencySymbol: string;
}

export interface BusinessConfig {
  logoPath?: string;
  email?: string;
  pan?: string;
  financialYear?: string;
}

export interface InvoiceConfig {
  numberingMode?: 'continuous' | 'reset_annual' | 'custom';
  prefix?: string;
  startingNumber?: number;
  termsAndConditions?: string;
  copiesCount?: number;
  editDeletePassword?: string;
  editDeletePasswordHash?: string;
}

export interface TaxConfig {
  gstEnabled?: boolean;
  pricingMode?: 'inclusive' | 'exclusive';
  defaultGstPercent?: number;
  taxRounding?: 'none' | 'nearest' | 'up' | 'down';
  rates?: number[];
}

export interface PaymentsConfig {
  enabledMethods?: Array<'cash' | 'card' | 'upi' | 'bank_transfer' | 'credit' | 'split'>;
  defaultPaymentMethod?: 'cash' | 'card' | 'upi' | 'credit' | 'split';
  allowSplit?: boolean;
  allowCredit?: boolean;
}

export interface CashboxConfig {
  enableShifts?: boolean;
  requireOpeningCash?: boolean;
  requireClosingCashCount?: boolean;
  denominationsEnabled?: number[];
  allowWithdrawal?: boolean;
  allowDeposit?: boolean;
  allowAdjustment?: boolean;
  managerApprovalRequired?: boolean;
  discrepancyThresholdPaise?: number;
}

export interface InventoryConfig {
  trackingEnabled?: boolean;
  allowNegativeStock?: boolean;
  defaultLowStockThreshold?: number;
  alertLowStock?: boolean;
  alertOutOfStock?: boolean;
  valuationMethod?: 'FIFO' | 'Weighted_Average';
  batchTracking?: boolean;
  expiryTracking?: boolean;
  defaultUnit?: 'kg' | 'g' | 'piece' | 'pack';
}

export interface ReturnsConfig {
  returnsEnabled?: boolean;
  returnPeriodDays?: number;
  allowPartialReturn?: boolean;
  allowExchange?: boolean;
  refundToOriginal?: boolean;
  cashRefund?: boolean;
  storeCredit?: boolean;
  requireReturnReason?: boolean;
  managerApproval?: boolean;
  autoRestock?: boolean;
}

export interface HardwareConfig {
  printerName?: string;
  scalePort?: string;
  scaleBaudRate?: number;
  barcodeScannerEnabled?: boolean;
  cashDrawerEnabled?: boolean;
}

export interface ReceiptTemplateConfig {
  paperWidth?: '58mm' | '80mm' | 'A4';
  headerMessage?: string;
  footerMessage?: string;
  showGstBreakdown?: boolean;
  autoPrintOnComplete?: boolean;
  showLogo?: boolean;
  showHsn?: boolean;
  showDiscount?: boolean;
  showCashier?: boolean;
  showCustomer?: boolean;
  leftMarginMm?: number;
  rightMarginMm?: number;
  rightSafeMarginMm?: number;
  safePrintWidthMm?: number;
  topMarginMm?: number;
  fontFamily?: 'Consolas' | 'Arial' | 'Calibri' | 'Segoe UI' | 'Courier New';
  fontSize?: 'small' | 'medium' | 'large';
  headerAlignment?: 'left' | 'center' | 'right';
  // Column proportions from Image 2
  itemWidthPercent?: number;
  qtyWidthPercent?: number;
  rateWidthPercent?: number;
  amountWidthPercent?: number;
  // Toggles from Images 1, 2, 3
  billPrintClosingBalance?: boolean;
  cardBillDouble?: boolean;
  subBillPrint?: boolean;
  cashDrawerOpen?: boolean;
  tamilFont?: boolean;
  splitAmount?: boolean;
  cashTender?: boolean;
  customerCredit?: boolean;
  crmPoints?: boolean;
  dosPrinter?: boolean;
  discountEveryLine?: boolean;
  noOfBillPrint?: number;
  secondBillDelayMs?: number;
  duplicateCopyLabel?: string;
  // Header & Footer configuration from Image 3
  topSlogan?: string;
  shopName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  pinCode?: string;
  phone?: string;
  gstin?: string;
  email?: string;
  condition1?: string;
  condition2?: string;
  condition3?: string;
  footerCondition1?: string;
  footerCondition2?: string;
  footerCondition3?: string;
  footerMsg1?: string;
  footerMsg2?: string;
  // Manual Ruler, Dead Zone & Position Nudge
  unprintableRightZoneMm?: number;
  itemColLabel?: string;
  qtyColLabel?: string;
  rateColLabel?: string;
  amtColLabel?: string;
  elementOffsets?: Record<string, number>;
  // WhatsApp Meta settings
  softwareMobileNo?: string;
  whatsAppSendMode?: 'direct' | 'cloud_api';
  whatsAppMetaApiKey?: string;
  whatsAppMetaPhoneId?: string;
  whatsAppWabaId?: string;
  whatsAppDefaultMessage?: string;
  whatsAppAutoFestivalWishes?: boolean;
  festivalGreetings?: Array<{
    id: string;
    name: string;
    date: string;
    greeting: string;
    enabled: boolean;
  }>;
}

export interface BillingSettingsConfig {
  skipPaymentConfirmation?: boolean;
  enableCalculatorWidget?: boolean;
  defaultPaymentMethod?: 'cash' | 'upi' | 'card' | 'split' | 'credit';
}

export interface BackupConfig {
  backupDir?: string;
  autoBackupOnClose?: boolean;
  maxBackupsToKeep?: number;
}

export interface WhatsAppConfig {
  maxRetries?: number;
  retryBackoffSeconds?: number;
  billCaptionTemplate?: string;
  deliveryMessageTemplate?: string;
}

export interface WhatsAppQueueItem {
  id: number;
  invoice_id: number | null;
  phone: string;
  message_type: 'bill_image' | 'delivery_notice' | 'custom_text';
  payload_json: string;
  status: 'pending' | 'processing' | 'sent' | 'failed_transient' | 'failed_final' | 'hold_not_logged_in';
  retry_count: number;
  max_retries: number;
  next_retry_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppConfig {
  env: 'development' | 'testing' | 'production';
  dbPath: string;
  shopInfo: ShopInfo;
  business?: BusinessConfig;
  invoice?: InvoiceConfig;
  tax?: TaxConfig;
  payments?: PaymentsConfig;
  cashbox?: CashboxConfig;
  inventory?: InventoryConfig;
  returns?: ReturnsConfig;
  theme: 'light' | 'dark';
  hardware: HardwareConfig;
  receiptTemplate?: ReceiptTemplateConfig;
  billingSettings?: BillingSettingsConfig;
  backup?: BackupConfig;
  whatsAppConfig?: WhatsAppConfig;
}


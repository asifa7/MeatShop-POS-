import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { z } from 'zod';
import { logger } from '../backend/logger';

// Feature Flags Schema
export const FeatureFlagsSchema = z.object({
  enableLoyalty: z.boolean().default(false),
  enableCRM: z.boolean().default(false),
  enableCloudSync: z.boolean().default(false),
  enableRestaurantMode: z.boolean().default(false),
  enableMeatMode: z.boolean().default(true),
  enableManufacturing: z.boolean().default(false),
  enablePharmacy: z.boolean().default(false),
});

// Shop Info Schema
export const ShopInfoSchema = z.object({
  name: z.string().default('Meat Shop POS'),
  address: z.string().default('123 Main Street'),
  phone: z.string().default('+91 9999999999'),
  gstin: z.string().default(''),
  currencySymbol: z.string().default('₹'),
});

// Business Identity Schema
export const BusinessSchema = z.object({
  logoPath: z.string().default(''),
  email: z.string().default(''),
  pan: z.string().default(''),
  financialYear: z.string().default('2026-2027'),
});

// Invoice & Billing Numbering Schema
export const InvoiceSchema = z.object({
  numberingMode: z.enum(['continuous', 'reset_annual', 'custom']).default('continuous'),
  prefix: z.string().default('INV-'),
  startingNumber: z.number().int().min(1).default(1),
  termsAndConditions: z.string().default('Goods once sold cannot be returned without receipt.'),
  copiesCount: z.number().int().min(1).max(5).default(1),
  editDeletePassword: z.string().optional(),
  editDeletePasswordHash: z.string().default(''),
});

// Tax / GST Schema
export const TaxSchema = z.object({
  gstEnabled: z.boolean().default(true),
  pricingMode: z.enum(['inclusive', 'exclusive']).default('exclusive'),
  defaultGstPercent: z.number().default(5),
  taxRounding: z.enum(['none', 'nearest', 'up', 'down']).default('nearest'),
  rates: z.array(z.number()).default([0, 5, 12, 18, 28]),
});

// Payment Methods Schema
export const PaymentsSchema = z.object({
  enabledMethods: z.array(z.enum(['cash', 'card', 'upi', 'bank_transfer', 'credit', 'split'])).default(['cash', 'upi', 'card', 'split']),
  defaultPaymentMethod: z.enum(['cash', 'card', 'upi', 'credit', 'split']).default('cash'),
  allowSplit: z.boolean().default(true),
  allowCredit: z.boolean().default(true),
  upiId: z.string().default(''),
  upiPayeeName: z.string().default(''),
  printUpiQrOnDelivery: z.boolean().default(true),
});


// Cash Box & Shift Rules Schema
export const CashboxSchema = z.object({
  enableShifts: z.boolean().default(true),
  requireOpeningCash: z.boolean().default(true),
  requireClosingCashCount: z.boolean().default(true),
  denominationsEnabled: z.array(z.number()).default([500, 200, 100, 50, 20, 10, 5, 2, 1]),
  allowWithdrawal: z.boolean().default(true),
  allowDeposit: z.boolean().default(true),
  allowAdjustment: z.boolean().default(true),
  managerApprovalRequired: z.boolean().default(false),
  discrepancyThresholdPaise: z.number().default(50000), // ₹500
});

// Inventory Rules Schema
export const InventorySchema = z.object({
  trackingEnabled: z.boolean().default(true),
  allowNegativeStock: z.boolean().default(true),
  defaultLowStockThreshold: z.number().default(5),
  alertLowStock: z.boolean().default(true),
  alertOutOfStock: z.boolean().default(true),
  valuationMethod: z.enum(['FIFO', 'Weighted_Average']).default('FIFO'),
  batchTracking: z.boolean().default(true),
  expiryTracking: z.boolean().default(true),
  defaultUnit: z.enum(['kg', 'g', 'piece', 'pack']).default('kg'),
});

// Returns & Refunds Schema
export const ReturnsSchema = z.object({
  returnsEnabled: z.boolean().default(true),
  returnPeriodDays: z.number().default(7),
  allowPartialReturn: z.boolean().default(true),
  allowExchange: z.boolean().default(true),
  refundToOriginal: z.boolean().default(true),
  cashRefund: z.boolean().default(true),
  storeCredit: z.boolean().default(true),
  requireReturnReason: z.boolean().default(true),
  managerApproval: z.boolean().default(false),
  autoRestock: z.boolean().default(true),
});

// Hardware & Peripheral Schema
export const HardwareSchema = z.object({
  printerName: z.string().default(''),
  scalePort: z.string().default(''),
  scaleBaudRate: z.number().default(9600),
  barcodeScannerEnabled: z.boolean().default(true),
  cashDrawerEnabled: z.boolean().default(true),
});

// Receipt Template Schema
export const ReceiptTemplateSchema = z.object({
  paperWidth: z.enum(['58mm', '80mm', 'A4']).default('80mm'),
  headerMessage: z.string().default('Fresh Quality Meats Daily'),
  footerMessage: z.string().default('Thank you for your business! Visit again.'),
  showGstBreakdown: z.boolean().default(true),
  autoPrintOnComplete: z.boolean().default(true),
  showLogo: z.boolean().default(true),
  showHsn: z.boolean().default(true),
  showDiscount: z.boolean().default(true),
  showCashier: z.boolean().default(true),
  showCustomer: z.boolean().default(true),
  leftMarginMm: z.number().default(0),
  rightMarginMm: z.number().default(4),
  rightSafeMarginMm: z.number().default(5),
  safePrintWidthMm: z.number().min(35).max(80).default(60),
  topMarginMm: z.number().default(0),
  fontFamily: z.enum(['Consolas', 'Arial', 'Calibri', 'Segoe UI', 'Courier New']).default('Consolas'),
  fontSize: z.enum(['small', 'medium', 'large']).default('medium'),
  headerAlignment: z.enum(['left', 'center', 'right']).default('left'),
  // Column proportions from Image 2
  itemWidthPercent: z.number().default(40),
  qtyWidthPercent: z.number().default(20),
  rateWidthPercent: z.number().default(20),
  amountWidthPercent: z.number().default(20),
  // Toggles from Images 1, 2, 3
  billPrintClosingBalance: z.boolean().default(true),
  cardBillDouble: z.boolean().default(false),
  subBillPrint: z.boolean().default(false),
  cashDrawerOpen: z.boolean().default(false),
  tamilFont: z.boolean().default(false),
  splitAmount: z.boolean().default(false),
  cashTender: z.boolean().default(false),
  customerCredit: z.boolean().default(false),
  crmPoints: z.boolean().default(false),
  dosPrinter: z.boolean().default(false),
  discountEveryLine: z.boolean().default(false),
  noOfBillPrint: z.number().default(1),
  secondBillDelayMs: z.number().default(100),
  duplicateCopyLabel: z.string().default('Duplicate Copy'),
  // Header & Footer configuration from Image 3
  topSlogan: z.string().default(''),
  shopName: z.string().default(''),
  addressLine1: z.string().default(''),
  addressLine2: z.string().default(''),
  city: z.string().default(''),
  pinCode: z.string().default(''),
  phone: z.string().default(''),
  gstin: z.string().default(''),
  email: z.string().default(''),
  condition1: z.string().default(''),
  condition2: z.string().default(''),
  condition3: z.string().default(''),
  footerCondition1: z.string().default(''),
  footerCondition2: z.string().default(''),
  footerCondition3: z.string().default(''),
  footerMsg1: z.string().default(''),
  footerMsg2: z.string().default(''),
  // Manual Ruler, Dead Zone & Position Nudge
  unprintableRightZoneMm: z.number().default(20),
  itemColLabel: z.string().default('ITEM'),
  qtyColLabel: z.string().default('Qty'),
  rateColLabel: z.string().default('Rate'),
  amtColLabel: z.string().default('Amount'),
  elementOffsets: z.record(z.string(), z.number()).default({}),
  // Dynamic UPI QR on Delivery Bills
  upiId: z.string().default(''),
  upiPayeeName: z.string().default(''),
  printUpiQrOnDelivery: z.boolean().default(true),
  // WhatsApp Meta & Greetings settings
  softwareMobileNo: z.string().default(''),
  whatsAppSendMode: z.enum(['direct', 'cloud_api']).default('direct'),
  whatsAppMetaApiKey: z.string().default(''),
  whatsAppMetaPhoneId: z.string().default(''),
  whatsAppWabaId: z.string().default(''),
  whatsAppDefaultMessage: z.string().default('Thank you for shopping with us! Visit again. Quality is our promise.'),
  whatsAppAutoFestivalWishes: z.boolean().default(true),
  festivalGreetings: z.array(z.object({
    id: z.string(),
    name: z.string(),
    date: z.string(), // MM-DD or YYYY-MM-DD
    greeting: z.string(),
    enabled: z.boolean().default(true),
  })).default([
    { id: 'pongal', name: 'Pongal / Makar Sankranti', date: '01-14', greeting: '🌾 Wishing you and your family a very Happy & Prosperous Pongal! 🌞', enabled: true },
    { id: 'republic_day', name: 'Republic Day', date: '01-26', greeting: '🇮🇳 Happy Republic Day! Let us celebrate the glory of our Nation.', enabled: true },
    { id: 'ramadan_eid', name: 'Eid-ul-Fitr / Ramzan', date: '03-31', greeting: '🌙 Eid Mubarak! Wishing you peace, joy and prosperity.', enabled: true },
    { id: 'tamil_new_year', name: 'Tamil New Year / Puthandu', date: '04-14', greeting: '✨ Iniya Tamizh Puthandu Nalvazhthukkal! Have a blissful year.', enabled: true },
    { id: 'bakrid', name: 'Bakrid / Eid-ul-Adha', date: '06-07', greeting: '🌙 Bakrid Mubarak! May this day bring peace and happiness.', enabled: true },
    { id: 'independence_day', name: 'Independence Day', date: '08-15', greeting: '🇮🇳 Happy Independence Day! Proud to serve you.', enabled: true },
    { id: 'ganesh_chaturthi', name: 'Ganesh Chaturthi', date: '08-27', greeting: '🌺 Happy Ganesh Chaturthi! May Lord Ganesha shower you with blessings.', enabled: true },
    { id: 'onam', name: 'Onam', date: '09-05', greeting: '🌸 Happy Onam! Wishing you joy, good health and prosperity.', enabled: true },
    { id: 'ayudha_poojai', name: 'Ayudha Poojai / Saraswathi Poojai', date: '10-19', greeting: '✨ Happy Ayudha Poojai & Saraswathi Poojai! Best wishes for success and growth.', enabled: true },
    { id: 'vijayadashami', name: 'Vijayadashami / Dussehra', date: '10-20', greeting: '🏹 Happy Vijayadashami! May victory and goodness prevail.', enabled: true },
    { id: 'deepavali', name: 'Diwali / Deepavali', date: '11-08', greeting: '🪔 Wishing you and your family a glittering and Happy Deepavali! 🎆', enabled: true },
    { id: 'christmas', name: 'Christmas', date: '12-25', greeting: '🎄 Merry Christmas! Wishing you joy, warmth and festive cheer.', enabled: true },
    { id: 'new_year', name: 'New Year', date: '01-01', greeting: '🎉 Happy New Year! Wishing you a healthy and prosperous year ahead.', enabled: true }
  ]),
});

// Billing Settings Schema (single source of truth for payment/print flags)
export const BillingSettingsSchema = z.object({
  skipPaymentConfirmation: z.boolean().default(false),
  enableCalculatorWidget: z.boolean().default(true),
  defaultPaymentMethod: z.enum(['cash', 'upi', 'card', 'split', 'credit']).default('cash'),
});

// Meat Yield Calculation Schema
export const MeatYieldSchema = z.object({
  defaultChickenYieldRatio: z.number().min(0.1).default(1.60),
});

// WhatsApp Configuration Schema
export const WhatsAppConfigSchema = z.object({
  maxRetries: z.number().min(1).max(10).default(3),
  retryBackoffSeconds: z.number().min(5).max(300).default(30),
  billCaptionTemplate: z.string().default(
    "🧾 *{shopName}*\nDear *{customerName}*, greetings from {shopName}! 🙏\n\n📄 *Bill No:* {billNo}\n💰 *Bill Total:* ₹{netAmount}\n📅 *Date:* {date}\n\nAttached is your digital bill receipt. Thank you for choosing us! ✨"
  ),
  deliveryMessageTemplate: z.string().default(
    "🛵 *Order Confirmed - Will deliver shortly!*\nDear *{customerName}*, your order (#{billNo}) is freshly prepared and out for delivery shortly. Thank you! 🙏"
  ),
});

// Full App Config Schema
export const AppConfigSchema = z.object({
  env: z.enum(['development', 'testing', 'production']).default('development'),
  dbPath: z.string(),
  shopInfo: ShopInfoSchema.default({}),
  business: BusinessSchema.default({}),
  invoice: InvoiceSchema.default({}),
  tax: TaxSchema.default({}),
  payments: PaymentsSchema.default({}),
  cashbox: CashboxSchema.default({}),
  inventory: InventorySchema.default({}),
  returns: ReturnsSchema.default({}),
  theme: z.enum(['light', 'dark']).default('dark'),
  hardware: HardwareSchema.default({}),
  receiptTemplate: ReceiptTemplateSchema.default({}),
  billingSettings: BillingSettingsSchema.default({}),
  meatYield: MeatYieldSchema.default({}),
  backup: z.object({
    backupDir: z.string().default(''),
    autoBackupOnClose: z.boolean().default(true),
    maxBackupsToKeep: z.number().default(7),
  }).default({}),
  logging: z.object({
    level: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']).default('INFO'),
    enableFileLogging: z.boolean().default(true),
  }).default({}),
  featureFlags: FeatureFlagsSchema.default({}),
  whatsAppConfig: WhatsAppConfigSchema.default({}),
});

export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;

export interface IConfigService {
  get(): AppConfig;
  update(newConfig: Partial<AppConfig>): AppConfig;
  getFlags(): FeatureFlags;
  toggleFlag(flag: keyof FeatureFlags, enabled: boolean): FeatureFlags;
}

export class ConfigService implements IConfigService {
  private configFilePath: string;
  private currentConfig!: AppConfig;

  constructor() {
    const isDev = process.env.NODE_ENV === 'development' || !app?.isPackaged;
    const env = isDev ? 'development' : 'production';
    
    let userDataPath: string;
    try {
      userDataPath = app.getPath('userData');
    } catch {
      userDataPath = process.cwd();
    }

    this.configFilePath = path.join(userDataPath, 'config.json');
    this.load(env, userDataPath);
  }

  private load(env: 'development' | 'testing' | 'production', userDataPath: string) {
    const defaultDbPath = env === 'production' 
      ? path.join(userDataPath, 'data.db') 
      : path.join(process.cwd(), 'dev.db');

    const defaultBackupDir = path.join(userDataPath, 'backups');

    const defaults: AppConfig = {
      env,
      dbPath: defaultDbPath,
      shopInfo: {
        name: 'My Premium Meat Shop',
        address: '123 Market Square, Bangalore',
        phone: '+91 98765 43210',
        gstin: '29AAAAA0000A1Z5',
        currencySymbol: '₹',
      },
      business: {
        logoPath: '',
        email: '',
        pan: '',
        financialYear: '2026-2027',
      },
      invoice: {
        numberingMode: 'continuous',
        prefix: 'INV-',
        startingNumber: 1,
        termsAndConditions: 'Goods once sold cannot be returned without receipt.',
        copiesCount: 1,
        editDeletePasswordHash: '',
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
        upiId: '',
        upiPayeeName: '',
        printUpiQrOnDelivery: false,
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
        upiId: '',
        upiPayeeName: '',
        printUpiQrOnDelivery: false,
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
        rightMarginMm: 4,
        rightSafeMarginMm: 5,
        safePrintWidthMm: 60,
        topMarginMm: 0,
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
        shopName: '',
        addressLine1: '',
        addressLine2: '',
        city: '',
        pinCode: '',
        phone: '',
        gstin: '',
        email: '',
        condition1: '',
        condition2: '',
        condition3: '',
        footerCondition1: '',
        footerCondition2: '',
        footerCondition3: '',
        footerMsg1: '',
        footerMsg2: '',
        softwareMobileNo: '',
        whatsAppSendMode: 'direct',
        whatsAppMetaApiKey: '',
        whatsAppMetaPhoneId: '',
        whatsAppWabaId: '',
        whatsAppDefaultMessage: 'Thank you for shopping with us! Visit again. Quality is our promise.',
        whatsAppAutoFestivalWishes: true,
        unprintableRightZoneMm: 20,
        itemColLabel: 'ITEM',
        qtyColLabel: 'Qty',
        rateColLabel: 'Rate',
        amtColLabel: 'Amount',
        elementOffsets: {},
        festivalGreetings: [
          { id: 'pongal', name: 'Pongal / Makar Sankranti', date: '01-14', greeting: '🌾 Wishing you and your family a very Happy & Prosperous Pongal! 🌞', enabled: true },
          { id: 'republic_day', name: 'Republic Day', date: '01-26', greeting: '🇮🇳 Happy Republic Day! Let us celebrate the glory of our Nation.', enabled: true },
          { id: 'ramadan_eid', name: 'Eid-ul-Fitr / Ramzan', date: '03-31', greeting: '🌙 Eid Mubarak! Wishing you peace, joy and prosperity.', enabled: true },
          { id: 'tamil_new_year', name: 'Tamil New Year / Puthandu', date: '04-14', greeting: '✨ Iniya Tamizh Puthandu Nalvazhthukkal! Have a blissful year.', enabled: true },
          { id: 'bakrid', name: 'Bakrid / Eid-ul-Adha', date: '06-07', greeting: '🌙 Bakrid Mubarak! May this day bring peace and happiness.', enabled: true },
          { id: 'independence_day', name: 'Independence Day', date: '08-15', greeting: '🇮🇳 Happy Independence Day! Proud to serve you.', enabled: true },
          { id: 'ganesh_chaturthi', name: 'Ganesh Chaturthi', date: '08-27', greeting: '🌺 Happy Ganesh Chaturthi! May Lord Ganesha shower you with blessings.', enabled: true },
          { id: 'onam', name: 'Onam', date: '09-05', greeting: '🌸 Happy Onam! Wishing you joy, good health and prosperity.', enabled: true },
          { id: 'ayudha_poojai', name: 'Ayudha Poojai / Saraswathi Poojai', date: '10-19', greeting: '✨ Happy Ayudha Poojai & Saraswathi Poojai! Best wishes for success and growth.', enabled: true },
          { id: 'vijayadashami', name: 'Vijayadashami / Dussehra', date: '10-20', greeting: '🏹 Happy Vijayadashami! May victory and goodness prevail.', enabled: true },
          { id: 'deepavali', name: 'Diwali / Deepavali', date: '11-08', greeting: '🪔 Wishing you and your family a glittering and Happy Deepavali! 🎆', enabled: true },
          { id: 'christmas', name: 'Christmas', date: '12-25', greeting: '🎄 Merry Christmas! Wishing you joy, warmth and festive cheer.', enabled: true },
          { id: 'new_year', name: 'New Year', date: '01-01', greeting: '🎉 Happy New Year! Wishing you a healthy and prosperous year ahead.', enabled: true }
        ],
      },
      billingSettings: {
        skipPaymentConfirmation: false,
        enableCalculatorWidget: true,
        defaultPaymentMethod: 'cash',
      },
      meatYield: {
        defaultChickenYieldRatio: 1.60,
      },
      backup: {
        backupDir: defaultBackupDir,
        autoBackupOnClose: true,
        maxBackupsToKeep: 7,
      },
      logging: {
        level: 'INFO',
        enableFileLogging: true,
      },
      featureFlags: {
        enableLoyalty: false,
        enableCRM: false,
        enableCloudSync: false,
        enableRestaurantMode: false,
        enableMeatMode: true,
        enableManufacturing: false,
        enablePharmacy: false,
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

    if (!fs.existsSync(this.configFilePath)) {
      this.currentConfig = defaults;
      this.save();
      logger.info('Created default configuration file', { path: this.configFilePath });
      return;
    }

    try {
      const fileData = fs.readFileSync(this.configFilePath, 'utf-8');
      const parsedData = JSON.parse(fileData);
      
      if (env === 'development' || !parsedData.dbPath) {
        parsedData.dbPath = defaultDbPath;
      }

      const validated = AppConfigSchema.parse({
        ...defaults,
        ...parsedData,
        env,
      });

      this.currentConfig = validated;
      logger.info('Configuration service loaded successfully', { env: this.currentConfig.env, dbPath: this.currentConfig.dbPath });
    } catch (err) {
      logger.error('Failed to parse config file, reverting to defaults', err);
      this.currentConfig = defaults;
      this.save();
    }
  }

  public get(): AppConfig {
    return this.currentConfig;
  }

  public update(newConfig: Partial<AppConfig>): AppConfig {
    try {
      const merged = {
        ...this.currentConfig,
        ...newConfig,
        shopInfo: { ...this.currentConfig.shopInfo, ...(newConfig.shopInfo || {}) },
        business: { ...(this.currentConfig.business || {}), ...(newConfig.business || {}) },
        invoice: { ...(this.currentConfig.invoice || {}), ...(newConfig.invoice || {}) },
        tax: { ...(this.currentConfig.tax || {}), ...(newConfig.tax || {}) },
        payments: { ...(this.currentConfig.payments || {}), ...(newConfig.payments || {}) },
        cashbox: { ...(this.currentConfig.cashbox || {}), ...(newConfig.cashbox || {}) },
        inventory: { ...(this.currentConfig.inventory || {}), ...(newConfig.inventory || {}) },
        returns: { ...(this.currentConfig.returns || {}), ...(newConfig.returns || {}) },
        hardware: { ...this.currentConfig.hardware, ...(newConfig.hardware || {}) },
        receiptTemplate: { ...(this.currentConfig.receiptTemplate || {}), ...(newConfig.receiptTemplate || {}) },
        billingSettings: { ...(this.currentConfig.billingSettings || {}), ...(newConfig.billingSettings || {}) },
        backup: { ...this.currentConfig.backup, ...(newConfig.backup || {}) },
        logging: { ...this.currentConfig.logging, ...(newConfig.logging || {}) },
        featureFlags: { ...this.currentConfig.featureFlags, ...(newConfig.featureFlags || {}) },
        // Keep WhatsApp settings when another part of the app performs a
        // partial configuration update. Without this merge, a partial update
        // can replace the saved bill-caption template with schema defaults.
        whatsAppConfig: { ...this.currentConfig.whatsAppConfig, ...(newConfig.whatsAppConfig || {}) },
      };

      if (newConfig.invoice?.editDeletePassword && newConfig.invoice.editDeletePassword.trim()) {
        try {
          const { hashPassword } = require('../../modules/auth/backend/service/auth_service');
          merged.invoice.editDeletePasswordHash = hashPassword(newConfig.invoice.editDeletePassword.trim());
        } catch (e) {}
      }

      const validated = AppConfigSchema.parse(merged);
      this.currentConfig = validated;
      this.save();
      logger.info('Application configuration updated successfully');
      return this.currentConfig;
    } catch (err) {
      logger.error('Failed to update configuration', err);
      throw err;
    }
  }

  public getFlags(): FeatureFlags {
    return this.currentConfig.featureFlags;
  }

  public toggleFlag(flag: keyof FeatureFlags, enabled: boolean): FeatureFlags {
    this.currentConfig.featureFlags[flag] = enabled;
    this.save();
    logger.info('Feature flag toggled', { flag, enabled });
    return this.currentConfig.featureFlags;
  }

  public verifyBillActionPassword(password: string): boolean {
    const config = this.get();
    const hash = config.invoice?.editDeletePasswordHash;
    if (!hash) {
      if (password === 'admin123' || password === 'admin') return true;
      try {
        const { authService } = require('../../modules/auth/backend/service/auth_service');
        const adminUser = authService.verifyManagerPin(password);
        if (adminUser) return true;
      } catch (e) {}
      return false;
    }
    const { verifyPassword } = require('../../modules/auth/backend/service/auth_service');
    return verifyPassword(password, hash);
  }

  public setBillActionPassword(newPasswordPlain: string): void {
    const { hashPassword } = require('../../modules/auth/backend/service/auth_service');
    const hash = hashPassword(newPasswordPlain);
    if (!this.currentConfig.invoice) {
      this.currentConfig.invoice = {
        numberingMode: 'continuous',
        prefix: 'INV-',
        startingNumber: 1,
        termsAndConditions: 'Goods once sold cannot be returned without receipt.',
        copiesCount: 1,
        editDeletePasswordHash: hash,
      };
    } else {
      this.currentConfig.invoice.editDeletePasswordHash = hash;
    }
    this.save();
    logger.info('Bill edit/delete password updated securely');
  }

  private save() {
    try {
      const dir = path.dirname(this.configFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configFilePath, JSON.stringify(this.currentConfig, null, 2), 'utf-8');
    } catch (err) {
      logger.error('Failed to save configuration to file', err);
      throw err;
    }
  }
}

export const configService = new ConfigService();
export default configService;

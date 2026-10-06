import { BrowserWindow, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import QRCode from 'qrcode';
import { invoiceRepository } from '../modules/billing/backend/repository/invoice_repository';
import { invoiceItemsRepository } from '../modules/billing/backend/repository/invoice_items_repository';
import { paymentsRepository } from '../modules/billing/backend/repository/payments_repository';
import { configService } from '../core/config/config_service';
import { db } from '../core/backend/db';
import { logger } from '../core/backend/logger';

export interface ReceiptImageResult {
  buffer: Buffer;
  filePath: string;
  dataUrl: string;
}

/**
 * Generates an inline SVG QR code crisp and without external dependencies.
 */
function generateQrSvg(text: string, sizePx = 130): string {
  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const modSize = qr.modules.size;
    const modData = qr.modules.data;
    const margin = 2;
    const totalMod = modSize + margin * 2;
    let paths = '';
    for (let r = 0; r < modSize; r++) {
      for (let c = 0; c < modSize; c++) {
        if (modData[r * modSize + c]) {
          paths += `M${c + margin} ${r + margin}h1v1h-1z `;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalMod} ${totalMod}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <path d="${paths}" fill="#000000"/>
    </svg>`;
  } catch (e) {
    return '';
  }
}

/**
 * Resolves or creates the directory used to cache generated receipt images.
 */
export function getWhatsAppBillsDir(): string {
  let baseDir: string;
  try {
    baseDir = app?.getPath ? app.getPath('userData') : process.cwd();
  } catch {
    baseDir = process.cwd();
  }
  const dir = path.join(baseDir, 'whatsapp-bills');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      logger.warn('[Receipt Image] Could not create whatsapp-bills directory', { error: String(e) });
    }
  }
  return dir;
}

/**
 * Normalizes input into full invoice, items, and payments records.
 */
export function resolveInvoiceData(invoiceIdOrData: number | any): {
  invoice: any;
  items: any[];
  payments: any[];
} {
  if (typeof invoiceIdOrData === 'number') {
    const invoice = invoiceRepository.findById(invoiceIdOrData);
    if (!invoice) throw new Error(`Invoice #${invoiceIdOrData} not found`);
    const items = invoiceItemsRepository.findByInvoiceId(invoiceIdOrData);
    const payments = paymentsRepository.findByInvoiceId(invoiceIdOrData);
    return { invoice, items, payments };
  }

  if (invoiceIdOrData && invoiceIdOrData.invoice) {
    return {
      invoice: invoiceIdOrData.invoice,
      items: invoiceIdOrData.items || (invoiceIdOrData.invoice.id ? invoiceItemsRepository.findByInvoiceId(invoiceIdOrData.invoice.id) : []),
      payments: invoiceIdOrData.payments || (invoiceIdOrData.invoice.id ? paymentsRepository.findByInvoiceId(invoiceIdOrData.invoice.id) : []),
    };
  }

  if (invoiceIdOrData && invoiceIdOrData.id) {
    const items = invoiceIdOrData.items || invoiceItemsRepository.findByInvoiceId(invoiceIdOrData.id);
    const payments = invoiceIdOrData.payments || paymentsRepository.findByInvoiceId(invoiceIdOrData.id);
    return { invoice: invoiceIdOrData, items, payments };
  }

  throw new Error('Invalid invoice data passed to receipt renderer');
}

/**
 * Builds a standalone, pixel-perfect HTML document matching the printed thermal receipt.
 * Width: 380px, background: white, clean monospace typography.
 */
export function buildReceiptHtml(invoiceIdOrData: number | any): string {
  const { invoice, items, payments } = resolveInvoiceData(invoiceIdOrData);
  const config = configService.get();
  const template = config.receiptTemplate || {};

  const shopName = template.shopName || invoice.shop_name_snapshot || config.shopInfo?.name || 'MEAT SHOP POS';
  const fullAddress = [template.addressLine1 || invoice.shop_address_snapshot || config.shopInfo?.address, template.addressLine2, template.city, template.pinCode].filter(Boolean).join(', ');
  const shopPhone = template.softwareMobileNo || template.phone || (config.shopInfo?.phone ? `Ph: ${config.shopInfo.phone}` : '');
  const gstin = template.gstin || config.shopInfo?.gstin || '';
  const email = template.email || '';
  const topSlogan = template.topSlogan || '';
  const primaryPayment = payments.length > 0 ? payments[0].method.toUpperCase() : 'CASH';
  const invNo = invoice.invoice_number ? invoice.invoice_number.split('_')[0] : `${invoice.id}`;

  let cashierName = 'CASHIER1';
  if (invoice.created_by) {
    try {
      const u = db.prepare('SELECT username FROM users WHERE id = ?').get(invoice.created_by) as { username: string } | undefined;
      if (u && u.username) cashierName = u.username.toUpperCase();
    } catch (e) {}
  }

  const completedDate = invoice.completed_at ? new Date(invoice.completed_at) : new Date();
  const dd = String(completedDate.getDate()).padStart(2, '0');
  const mm = String(completedDate.getMonth() + 1).padStart(2, '0');
  const yyyy = completedDate.getFullYear();
  const dateStr = `${dd}/${mm}/${yyyy}`;

  let hours = completedDate.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const hh = String(hours).padStart(2, '0');
  const min = String(completedDate.getMinutes()).padStart(2, '0');
  const timeStr = `${hh}:${min} ${ampm}`;

  // Customer Information & Ledger Balances
  let customerName = '';
  let customerPhone = '';
  let openingBalancePaise = 0;
  let billAmountPaise = invoice.total_paise;
  let paidAmountPaise = 0;
  let closingBalancePaise = 0;

  if (invoice.customer_id) {
    try {
      const customer = db.prepare('SELECT name, phone, phone2, whatsapp FROM customers WHERE id = ?').get(invoice.customer_id) as any;
      if (customer) {
        customerName = (customer.name || '').trim().toUpperCase();
        customerPhone = (customer.phone || customer.phone2 || customer.whatsapp || '').trim();
      }

      const ledgerRow = db.prepare(`
        SELECT COALESCE(SUM(debit_paise - credit_paise), 0) as balance_paise
        FROM customer_ledger
        WHERE customer_id = ?
          AND NOT (ref_type = 'invoice' AND ref_id = ?)
      `).get(invoice.customer_id, invoice.id) as { balance_paise: number } | undefined;
      openingBalancePaise = ledgerRow ? ledgerRow.balance_paise : 0;
    } catch (e) {}

    const totalPaid = payments.reduce((sum, p) => sum + p.amount_paise, 0);
    paidAmountPaise = Math.min(totalPaid, billAmountPaise);
    closingBalancePaise = openingBalancePaise + billAmountPaise - paidAmountPaise;
  }

  let totalQty = 0;
  const tableRows = items.map((item) => {
    const pName = `${item.product_name || ''} ${item.variant_name && item.variant_name !== 'Default' ? item.variant_name : ''}`.trim().toUpperCase();
    let qtyVal = 0;
    let qtyStr = '';
    if (item.unit_type === 'weight' && item.quantity_grams !== null) {
      qtyVal = item.quantity_grams / 1000;
      qtyStr = `${qtyVal.toFixed(3)} kg`;
    } else {
      qtyVal = item.quantity_units || 1;
      qtyStr = `${qtyVal} pcs`;
    }
    totalQty += qtyVal;

    const rateStr = (item.rate_paise_snapshot / 100).toFixed(2);
    const amtStr = (item.line_total_paise / 100).toFixed(2);

    return `
      <tr>
        <td class="col-desc">${pName}</td>
        <td class="col-qty">${qtyStr}</td>
        <td class="col-rate">${rateStr}</td>
        <td class="col-amt">${amtStr}</td>
      </tr>
    `;
  }).join('');

  const totalQtyStr = totalQty % 1 === 0 ? `${totalQty}` : `${totalQty.toFixed(2)}`;
  const grandTotalStr = (invoice.total_paise / 100).toFixed(2);
  const addressLines = fullAddress ? fullAddress.split(',').map((p) => p.trim()).filter(Boolean) : [];

  // Totals & Adjustments
  const subtotalStr = (invoice.subtotal_paise / 100).toFixed(2);
  const discountPercent = invoice.discount_percent || 0;
  const discountPaise = invoice.discount_paise || 0;
  const flatDeductionPaise = invoice.flat_deduction_paise || 0;
  const dressingChargePaise = invoice.dressing_charge_paise || 0;
  const roundOffPaise = invoice.round_off_paise || 0;
  const narration = invoice.narration;

  // Cash tendered & change
  let cashTenderedPaise = 0;
  let changeDuePaise = 0;
  const cashPayment = payments.find((p) => p.method === 'cash');
  if (cashPayment) {
    if (cashPayment.reference_number && cashPayment.reference_number.startsWith('TENDERED:')) {
      cashTenderedPaise = parseInt(cashPayment.reference_number.replace('TENDERED:', ''), 10) || cashPayment.amount_paise;
    } else if (cashPayment.amount_paise > invoice.total_paise) {
      cashTenderedPaise = cashPayment.amount_paise;
    }
    if (cashTenderedPaise > invoice.total_paise) {
      changeDuePaise = cashTenderedPaise - invoice.total_paise;
    }
  }

  // Delivery UPI Payment QR
  const isDelivery = Boolean((invoice as any).is_delivery || invoice.print_delivery_token || (invoice as any).delivery_id);
  const upiId = (template.upiId || config.payments?.upiId || '').trim();
  const upiPayeeName = (template.upiPayeeName || config.payments?.upiPayeeName || shopName || '').trim();
  const shouldPrintUpiQr = isDelivery && upiId && template.printUpiQrOnDelivery !== false;
  let upiQrSvg = '';
  if (shouldPrintUpiQr) {
    const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiPayeeName)}&am=${grandTotalStr}&cu=INR`;
    upiQrSvg = generateQrSvg(upiUrl, 130);
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt Image</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      background-color: #ffffff;
      width: 380px;
      margin: 0;
      padding: 0;
    }
    #receipt-container {
      background-color: #ffffff;
      color: #000000 !important;
      font-family: 'Consolas', 'Courier New', 'SF Mono', 'Segoe UI Mono', monospace;
      width: 380px;
      padding: 12px 14px;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
      font-size: 11.5px;
      font-weight: 700;
      line-height: 1.25;
      display: inline-block;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    
    .shop-name {
      font-size: 16px;
      font-weight: 900;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
      word-break: break-word;
    }
    .shop-info {
      font-size: 10.5px;
      font-weight: 700;
      text-align: center;
      line-height: 1.25;
      word-break: break-word;
    }
    .customer-info {
      font-size: 12px;
      font-weight: 900;
      text-align: left;
      line-height: 1.2;
      margin: 4px 0 2px 0;
      text-transform: uppercase;
      word-break: break-word;
    }
    .bill-type {
      font-size: 13px;
      font-weight: 900;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 4px 0 2px 0;
    }
    .duplicate-badge {
      text-align: center;
      font-weight: 900;
      font-size: 11.5px;
      letter-spacing: 0.5px;
      margin: 2px 0;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.3;
      width: 100%;
    }
    .meta-row > span:last-child {
      text-align: right;
      white-space: nowrap;
    }
    .divider {
      border-top: 1px dashed #000000;
      margin: 4px 0;
      width: 100%;
    }
    table.items-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 11px;
      font-family: inherit;
      margin: 0;
    }
    table.items-table th {
      font-size: 11px;
      font-weight: 900;
      padding: 2px 0 3px 0;
      border-bottom: 1px dashed #000000;
    }
    table.items-table td {
      padding: 2px 0;
      vertical-align: top;
      font-weight: 700;
    }
    .col-desc { text-align: left; width: 44%; word-break: break-word; font-weight: 700; padding-right: 2px; }
    .col-qty { text-align: right; width: 18%; font-weight: 700; padding-right: 2px; }
    .col-rate { text-align: right; width: 18%; font-weight: 700; padding-right: 2px; }
    .col-amt { text-align: right; width: 20%; font-weight: 900; }
    
    .adj-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.3;
      width: 100%;
    }
    .adj-row > span:last-child {
      text-align: right;
      white-space: nowrap;
    }
    .net-amount-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      width: 100%;
      margin: 3px 0;
    }
    .net-label {
      font-size: 13px;
      font-weight: 900;
    }
    .net-value {
      font-size: 13px;
      font-weight: 900;
      text-align: right;
      white-space: nowrap;
    }
    .balance-section {
      width: 100%;
      margin-top: 2px;
    }
    .note-row {
      text-align: left;
      font-size: 10.5px;
      font-weight: 700;
      margin-top: 3px;
      word-break: break-word;
    }
    .footer-msg {
      text-align: center;
      font-size: 10.5px;
      font-weight: 700;
      margin-top: 5px;
      line-height: 1.25;
    }
    .qr-container {
      text-align: center;
      margin: 6px 0 2px 0;
    }
  </style>
</head>
<body>
  <div id="receipt-container">
    <!-- Shop Header Block -->
    <div>
      ${topSlogan ? `<div class="shop-info" style="font-weight: 900; margin-bottom: 2px;">${topSlogan}</div>` : ''}
      <div class="shop-name">${shopName}</div>
      ${addressLines.map((line) => `<div class="shop-info">${line}</div>`).join('')}
      ${shopPhone ? `<div class="shop-info">${shopPhone}</div>` : ''}
      ${gstin ? `<div class="shop-info">GSTIN: ${gstin}</div>` : ''}
      ${email ? `<div class="shop-info">Email: ${email}</div>` : ''}
    </div>

    <!-- Customer Details -->
    ${customerName ? `
      <div class="customer-info">
        <div>${customerName}</div>
        ${customerPhone ? `<div>${customerPhone}</div>` : ''}
      </div>
    ` : ''}

    <!-- Bill Title -->
    <div class="bill-type">${primaryPayment} BILL</div>
    ${(invoice.reprint_count || 0) > 0 ? `
      <div class="duplicate-badge">
        *** ${(template.duplicateCopyLabel || 'Duplicate Copy').toUpperCase()} (#${invoice.reprint_count}) ***
      </div>
    ` : ''}

    <!-- Invoice Metadata -->
    <div class="meta-row">
      <span>Bill No : ${invNo}</span>
      <span>Date : ${dateStr}</span>
    </div>
    <div class="meta-row">
      <span>Cashier : ${cashierName}</span>
      <span>Time : ${timeStr}</span>
    </div>

    <div class="divider"></div>

    <!-- Item Table Header -->
    <table class="items-table">
      <thead>
        <tr>
          <th class="col-desc">ITEM</th>
          <th class="col-qty">Qty</th>
          <th class="col-rate">Rate</th>
          <th class="col-amt">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>

    <div class="divider"></div>

    <!-- Totals & Breakdown -->
    <div class="adj-row">
      <span>Gross Amount :</span>
      <span>${subtotalStr}</span>
    </div>

    ${discountPaise > 0 ? `
      <div class="adj-row">
        <span>Discount (${discountPercent}%) :</span>
        <span>-${(discountPaise / 100).toFixed(2)}</span>
      </div>
    ` : ''}

    ${flatDeductionPaise > 0 ? `
      <div class="adj-row">
        <span>Deduction :</span>
        <span>-${(flatDeductionPaise / 100).toFixed(2)}</span>
      </div>
    ` : ''}

    ${dressingChargePaise > 0 ? `
      <div class="adj-row">
        <span>Dressing Charge :</span>
        <span>+${(dressingChargePaise / 100).toFixed(2)}</span>
      </div>
    ` : ''}

    <div class="adj-row">
      <span>Coinage :</span>
      <span>${roundOffPaise < 0 ? '-' : ''}${Math.abs((roundOffPaise || 0) / 100).toFixed(2)}</span>
    </div>

    <div class="net-amount-row">
      <span class="net-label">Net Amount :</span>
      <span class="net-value">₹${grandTotalStr}</span>
    </div>

    <div class="divider"></div>

    <!-- Items count & Total Qty -->
    <div class="adj-row">
      <span>No.Of.Items ${items.length}</span>
      <span>Total Qty ${totalQtyStr}</span>
    </div>

    <!-- Customer Balances (only if customer selected) -->
    ${invoice.customer_id ? `
      <div class="balance-section">
        <div class="adj-row">
          <span>Opening Balance :</span>
          <span>${(openingBalancePaise / 100).toFixed(2)}</span>
        </div>
        <div class="adj-row">
          <span>Bill Amount :</span>
          <span>${(billAmountPaise / 100).toFixed(2)}</span>
        </div>
        <div class="adj-row">
          <span>Paid Amount :</span>
          <span>${(paidAmountPaise / 100).toFixed(2)}</span>
        </div>
        <div class="adj-row">
          <span>Closing Balance :</span>
          <span>${(closingBalancePaise / 100).toFixed(2)}</span>
        </div>
      </div>
    ` : ''}

    ${changeDuePaise > 0 ? `
      <div class="divider"></div>
      <div class="text-center" style="font-size: 11px; font-weight: 700;">
        Cash: ${(cashTenderedPaise / 100).toFixed(2)} | Change: ${(changeDuePaise / 100).toFixed(2)}
      </div>
    ` : ''}

    ${narration ? `
      <div class="note-row text-center">Note: ${narration}</div>
    ` : ''}

    <!-- Delivery UPI QR Code -->
    ${shouldPrintUpiQr ? `
      <div class="divider"></div>
      <div class="qr-container">
        <div style="font-weight: 900; font-size: 11px; margin-bottom: 2px;">SCAN TO PAY (DELIVERY)</div>
        <div style="font-size: 10px; margin-bottom: 4px;">Amount: ₹${grandTotalStr}</div>
        ${upiQrSvg}
        <div style="font-size: 9.5px; margin-top: 2px;">UPI: ${upiId}</div>
      </div>
    ` : ''}

    <!-- Footer Message -->
    <div class="divider"></div>
    <div class="footer-msg">
      <div>${template.footerMessage || 'Thank you for shopping with us! Visit again.'}</div>
      ${template.footerMsg1 ? `<div>${template.footerMsg1}</div>` : ''}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Creates a hidden offscreen BrowserWindow, renders the receipt HTML,
 * queries natural content height, resizes to prevent cropping or excess white space,
 * captures as PNG buffer, destroys the hidden window, and returns the buffer.
 */
export async function renderReceiptToImage(invoiceData: number | any): Promise<Buffer> {
  const html = buildReceiptHtml(invoiceData);
  const cacheDir = getWhatsAppBillsDir();
  const tempFile = path.join(cacheDir, `_receipt_render_${Date.now()}_${Math.random().toString(36).slice(2)}.html`);

  fs.writeFileSync(tempFile, html, 'utf8');

  const offscreenWin = new BrowserWindow({
    width: 380,
    height: 400,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      offscreen: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await offscreenWin.loadFile(tempFile);

    // Allow layout engine to settle fonts and geometry
    await new Promise((resolve) => setTimeout(resolve, 80));

    const contentHeight: number = await offscreenWin.webContents.executeJavaScript(`
      (() => {
        const el = document.getElementById('receipt-container');
        return el ? Math.ceil(el.getBoundingClientRect().height) : document.body.scrollHeight;
      })()
    `);

    const finalHeight = Math.min(Math.max(contentHeight + 2, 150), 4000);
    offscreenWin.setSize(380, finalHeight);
    await new Promise((resolve) => setTimeout(resolve, 40));

    const captured = await offscreenWin.webContents.capturePage({
      x: 0,
      y: 0,
      width: 380,
      height: finalHeight,
    });

    const pngBuffer = captured.toPNG();
    return pngBuffer;
  } finally {
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch {}

    if (!offscreenWin.isDestroyed()) {
      offscreenWin.destroy();
    }
  }
}

/**
 * Renders a crisp PNG image of an invoice receipt and caches it on disk.
 */
export async function generateReceiptPng(invoiceId: number, useCache = true): Promise<ReceiptImageResult> {
  const cacheDir = getWhatsAppBillsDir();
  
  if (useCache && fs.existsSync(cacheDir)) {
    try {
      const files = fs.readdirSync(cacheDir);
      const cachedFile = files
        .filter((f) => f.startsWith(`bill_${invoiceId}_`) && f.endsWith('.png'))
        .sort()
        .pop();

      if (cachedFile) {
        const cachedPath = path.join(cacheDir, cachedFile);
        const buffer = fs.readFileSync(cachedPath);
        const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
        logger.info(`[Receipt Image] Reusing cached PNG for invoice #${invoiceId} (${(buffer.length / 1024).toFixed(1)} KB)`);
        return { buffer, filePath: cachedPath, dataUrl };
      }
    } catch (cacheReadErr) {
      logger.warn('[Receipt Image] Cache read error, will generate fresh', { error: String(cacheReadErr) });
    }
  }

  const pngBuffer = await renderReceiptToImage(invoiceId);
  const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;
  const timestamp = Date.now();
  const filePath = path.join(cacheDir, `bill_${invoiceId}_${timestamp}.png`);

  try {
    fs.writeFileSync(filePath, pngBuffer);
  } catch (writeErr) {
    logger.warn('[Receipt Image] Failed to write PNG to cache dir', { error: String(writeErr) });
  }

  logger.info(`[Receipt Image] Generated and cached PNG for invoice #${invoiceId} (${(pngBuffer.length / 1024).toFixed(1)} KB) -> ${filePath}`);

  return { buffer: pngBuffer, filePath, dataUrl };
}

/**
 * Backward compatibility wrapper for callers expecting JPEG or dataUrl/buffer format.
 */
export async function generateReceiptJpeg(invoiceId: number): Promise<{ buffer: Buffer; dataUrl: string; filePath?: string }> {
  const res = await generateReceiptPng(invoiceId);
  return { buffer: res.buffer, dataUrl: res.dataUrl, filePath: res.filePath };
}


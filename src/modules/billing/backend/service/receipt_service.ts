import { invoiceRepository } from '../repository/invoice_repository';
import { invoiceItemsRepository } from '../repository/invoice_items_repository';
import { paymentsRepository } from '../repository/payments_repository';
import { configService } from '../../../../core/config/config_service';
import { db } from '../../../../core/backend/db';
import { authService } from '../../../auth/backend/service/auth_service';
import QRCode from 'qrcode';

function generateQrSvg(text: string, sizePx = 135): string {
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

function centerText(text: string, width: number): string {
  if (text.length <= width) {
    const leftPadding = Math.floor((width - text.length) / 2);
    return ' '.repeat(leftPadding) + text;
  }
  const lines: string[] = [];
  let currentStr = text;
  while (currentStr.length > 0) {
    let chunk = currentStr.slice(0, width);
    if (currentStr.length > width) {
      const lastSpace = chunk.lastIndexOf(' ');
      if (lastSpace > 0) {
        chunk = chunk.slice(0, lastSpace);
      }
    }
    const leftPadding = Math.floor((width - chunk.length) / 2);
    lines.push(' '.repeat(leftPadding) + chunk);
    currentStr = currentStr.slice(chunk.length).trim();
  }
  return lines.join('\n');
}

function alignLeftRight(left: string, right: string, width = 40): string {
  const spaceNeeded = width - left.length - right.length;
  if (spaceNeeded <= 0) return `${left} ${right}`;
  return left + ' '.repeat(spaceNeeded) + right;
}

export const receiptService = {
  /**
   * Records a print event for an invoice.
   * If this is the initial print (initial_printed_at is NULL, or isInitialPrint is true),
   * records initial_printed_at without incrementing reprint_count.
   * On subsequent prints, increments reprint_count and inserts an audit log into invoice_reprints.
   */
  recordPrint(
    invoiceId: number,
    userId?: number,
    reason?: string,
    isInitialPrint?: boolean
  ): { isReprint: boolean; reprintCount: number } {
    const inv = db.prepare('SELECT id, reprint_count, initial_printed_at FROM invoices WHERE id = ?').get(invoiceId) as {
      id: number;
      reprint_count: number;
      initial_printed_at: string | null;
    } | undefined;

    if (!inv) {
      return { isReprint: false, reprintCount: 0 };
    }

    if (!inv.initial_printed_at || isInitialPrint) {
      if (!inv.initial_printed_at) {
        db.prepare('UPDATE invoices SET initial_printed_at = CURRENT_TIMESTAMP WHERE id = ?').run(invoiceId);
      }
      return { isReprint: false, reprintCount: inv.reprint_count || 0 };
    }

    const newCount = (inv.reprint_count || 0) + 1;
    let effectiveUserId = userId;
    if (!effectiveUserId) {
      try {
        effectiveUserId = authService.getCurrentUserId();
      } catch (e) {}
    }
    if (!effectiveUserId) {
      effectiveUserId = 1;
    }

    db.transaction(() => {
      db.prepare('UPDATE invoices SET reprint_count = ? WHERE id = ?').run(newCount, invoiceId);
      db.prepare(`
        INSERT INTO invoice_reprints (invoice_id, user_id, reason, reprinted_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `).run(invoiceId, effectiveUserId, reason || null);
    })();

    return { isReprint: true, reprintCount: newCount };
  },

  /**
   * Formats completed invoice details into plain-text thermal receipt matching exact receipt format.
   */
  generateReceiptText(invoiceId: number, customWidth?: number): string {
    const config = configService.get();
    const template = config.receiptTemplate || {
      paperWidth: '80mm',
      headerMessage: '',
      footerMessage: '',
      showGstBreakdown: true,
      autoPrintOnComplete: true,
    };

    const width = customWidth || (template.paperWidth === '58mm' ? 32 : 40);
    const invoice = invoiceRepository.findById(invoiceId);
    const items = invoiceItemsRepository.findByInvoiceId(invoiceId);
    const payments = paymentsRepository.findByInvoiceId(invoiceId);

    const divider = '-'.repeat(width);
    let lines: string[] = [];

    // 1. Shop Name
    const shopName = invoice.shop_name_snapshot || config.shopInfo?.name || 'MEAT SHOP POS';
    lines.push(centerText(shopName.toUpperCase(), width));

    // 2. Shop Address
    const shopAddress = invoice.shop_address_snapshot || config.shopInfo?.address || '';
    if (shopAddress) {
      const parts = shopAddress.split(',').map(p => p.trim()).filter(Boolean);
      parts.forEach(part => lines.push(centerText(part, width)));
    }

    // 3. Phone Number
    const shopPhone = config.shopInfo?.phone ? `Ph:${config.shopInfo.phone}` : '';
    if (shopPhone) lines.push(centerText(shopPhone, width));

    // Customer Info (if customer selected)
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

      if (customerName) lines.push(customerName);
      if (customerPhone) lines.push(customerPhone);
    }

    // 4. Bill Title
    const primaryPayment = payments.length > 0 ? payments[0].method.toUpperCase() : 'CASH';
    lines.push(centerText(`${primaryPayment} Bill`, width));

    if ((invoice.reprint_count || 0) > 0) {
      const duplicateLabel = (template.duplicateCopyLabel || 'Duplicate Copy').toUpperCase();
      lines.push(centerText(`*** ${duplicateLabel} (#${invoice.reprint_count}) ***`, width));
    }

    // 5. Invoice Metadata
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
    const timeStr = `${hh}:${min}:${ampm}`;

    lines.push(alignLeftRight(`Bill No : ${invNo}`, `Date : ${dateStr}`, width));
    lines.push(alignLeftRight(`Cashier : ${cashierName}`, `Time : ${timeStr}`, width));

    // 6. Full-width dashed divider
    lines.push(divider);

    // 7. Table Header
    if (width === 32) {
      lines.push('Description'.padEnd(11) + 'Qty'.padStart(5) + 'Rate'.padStart(7) + 'Amount'.padStart(9));
    } else {
      lines.push('Description'.padEnd(16) + 'Qty'.padStart(6) + 'Rate'.padStart(8) + 'Amount'.padStart(10));
    }

    // 8. Full-width dashed divider
    lines.push(divider);

    // 9. Item Rows
    let totalQty = 0;
    for (const item of items) {
      const pName = `${item.product_name} ${item.variant_name && item.variant_name !== 'Default' ? item.variant_name : ''}`.trim().toUpperCase();
      
      let qtyVal = 0;
      let qtyStr = '';
      if (item.unit_type === 'weight' && item.quantity_grams !== null) {
        qtyVal = item.quantity_grams / 1000;
        qtyStr = qtyVal.toFixed(3);
      } else {
        qtyVal = item.quantity_units || 1;
        qtyStr = `${qtyVal}`;
      }
      totalQty += qtyVal;

      const rateStr = (item.rate_paise_snapshot / 100).toFixed(2);
      const amtStr = (item.line_total_paise / 100).toFixed(2);

      if (width === 32) {
        const truncName = pName.length > 11 ? pName.slice(0, 11) : pName.padEnd(11);
        const qPad = qtyStr.padStart(5);
        const rPad = rateStr.padStart(7);
        const aPad = amtStr.padStart(9);
        lines.push(`${truncName}${qPad}${rPad}${aPad}`);
      } else {
        if (pName.length <= 16) {
          const dPad = pName.padEnd(16);
          const qPad = qtyStr.padStart(6);
          const rPad = rateStr.padStart(8);
          const aPad = amtStr.padStart(10);
          lines.push(`${dPad}${qPad}${rPad}${aPad}`);
        } else {
          lines.push(pName);
          const qPad = qtyStr.padStart(6);
          const rPad = rateStr.padStart(8);
          const aPad = amtStr.padStart(10);
          lines.push(`${''.padEnd(16)}${qPad}${rPad}${aPad}`);
        }
      }
    }

    // 10. Divider
    lines.push(divider);

    // 11. Adjustments & Totals
    const subtotalStr = (invoice.subtotal_paise / 100).toFixed(2);
    const discountPercent = invoice.discount_percent || 0;
    const discountPaise = invoice.discount_paise || 0;
    const flatDeductionPaise = invoice.flat_deduction_paise || 0;
    const dressingChargePaise = invoice.dressing_charge_paise || 0;
    const roundOffPaise = invoice.round_off_paise || 0;

    lines.push(alignLeftRight('Gross Amount :', subtotalStr, width));

    if (discountPaise > 0) {
      lines.push(alignLeftRight(`Discount (${discountPercent}%) :`, `-${(discountPaise / 100).toFixed(2)}`, width));
    }
    if (flatDeductionPaise > 0) {
      lines.push(alignLeftRight('Deduction :', `-${(flatDeductionPaise / 100).toFixed(2)}`, width));
    }
    if (dressingChargePaise > 0) {
      lines.push(alignLeftRight('Dressing Charge :', `+${(dressingChargePaise / 100).toFixed(2)}`, width));
    }
    const coinageSign = (roundOffPaise || 0) < 0 ? '-' : '';
    const coinageStr = `${coinageSign}${Math.abs((roundOffPaise || 0) / 100).toFixed(2)}`;
    lines.push(alignLeftRight('Coinage :', coinageStr, width));

    const currentBillStr = (invoice.total_paise / 100).toFixed(2);
    lines.push(alignLeftRight('Net Amount :', currentBillStr, width));

    // 12. Full-width dashed divider
    lines.push(divider);

    // 13. Items & Total Qty
    const totalQtyStr = totalQty % 1 === 0 ? `${totalQty}` : `${totalQty.toFixed(2)}`;
    lines.push(alignLeftRight(`No.Of.Items ${items.length}`, `Total Qty ${totalQtyStr}`, width));

    // 14. Customer Balances (only when customer is selected)
    if (invoice.customer_id) {
      lines.push(alignLeftRight('Opening Balance :', (openingBalancePaise / 100).toFixed(2), width));
      lines.push(alignLeftRight('Bill Amount     :', (billAmountPaise / 100).toFixed(2), width));
      lines.push(alignLeftRight('Paid Amount     :', (paidAmountPaise / 100).toFixed(2), width));
      lines.push(alignLeftRight('Closing Balance :', (closingBalancePaise / 100).toFixed(2), width));
    }

    // 15. Closing Divider
    lines.push(divider);

    // 16. Optional Narration
    if (invoice.narration) {
      lines.push(centerText(`Note: ${invoice.narration}`, width));
    }

    // 17. Optional Cash change
    let cashTenderedPaise = 0;
    let changeDuePaise = 0;
    const cashPayment = payments.find(p => p.method === 'cash');
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
    if (changeDuePaise > 0) {
      const cashStr = (cashTenderedPaise / 100).toFixed(2);
      const changeStr = (changeDuePaise / 100).toFixed(2);
      lines.push(centerText(`Cash: ${cashStr} | Change: ${changeStr}`, width));
    }

    // Dynamic Delivery UPI Payment
    const isDelivery = Boolean((invoice as any).is_delivery || invoice.print_delivery_token || (invoice as any).delivery_id);
    const upiId = (template.upiId || config.payments?.upiId || '').trim();
    const upiPayeeName = (template.upiPayeeName || config.payments?.upiPayeeName || shopName || '').trim();
    if (isDelivery && upiId && (template.printUpiQrOnDelivery !== false)) {
      lines.push(divider);
      lines.push(centerText('SCAN TO PAY (DELIVERY)', width));
      lines.push(centerText(`Amount: Rs.${currentBillStr}`, width));
      lines.push(centerText(`UPI: ${upiId}`, width));
      if (upiPayeeName) lines.push(centerText(upiPayeeName, width));
    }

    return lines.join('\n');
  },

  /**
   * Formats completed invoice details into pixel-exact styled HTML thermal print layout.
   */
  generateReceiptHTML(invoiceId: number): string {
    const config = configService.get();
    const template = config.receiptTemplate || {
      paperWidth: '80mm',
      headerMessage: '',
      footerMessage: '',
      showGstBreakdown: true,
      autoPrintOnComplete: true,
    };

    const invoice = invoiceRepository.findById(invoiceId);
    const items = invoiceItemsRepository.findByInvoiceId(invoiceId);
    const payments = paymentsRepository.findByInvoiceId(invoiceId);

    const is58 = template.paperWidth === '58mm';
    const shopName = template.shopName || invoice.shop_name_snapshot || config.shopInfo?.name || 'MEAT SHOP POS';
    const fullAddress = [template.addressLine1 || invoice.shop_address_snapshot || config.shopInfo?.address, template.addressLine2, template.city, template.pinCode].filter(Boolean).join(', ');
    const shopPhone = template.softwareMobileNo || template.phone || (config.shopInfo?.phone ? `Ph:${config.shopInfo.phone}` : '');
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
    const timeStr = `${hh}:${min}:${ampm}`;

    const leftMarginMm = template.leftMarginMm ?? 0;
    const topMarginMm = template.topMarginMm ?? 0;
    const chosenFont = template.fontFamily || 'Consolas';
    const fontStack = chosenFont === 'Consolas'
      ? "'Consolas', 'Courier New', monospace"
      : `'${chosenFont}', sans-serif`;

    // Dynamic font size scaling
    const fontSizeSetting = template.fontSize || 'medium';
    let baseFontSizePx = is58 ? 9.5 : 11.5;
    if (fontSizeSetting === 'small') baseFontSizePx -= 1.5;
    if (fontSizeSetting === 'large') baseFontSizePx += 1;

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
    const tableRows = items.map(item => {
      // Clean product name 1 time only (no description, no redundant text)
      const pName = (item.product_name || '').trim().toUpperCase();
      let qtyVal = 0;
      let qtyStr = '';
      if (item.unit_type === 'weight' && item.quantity_grams !== null) {
        qtyVal = item.quantity_grams / 1000;
        qtyStr = qtyVal.toFixed(3);
      } else {
        qtyVal = item.quantity_units || 1;
        qtyStr = `${qtyVal}`;
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
    const addressLines = fullAddress ? fullAddress.split(',').map(p => p.trim()).filter(Boolean) : [];

    // Optional Adjustments
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
    const cashPayment = payments.find(p => p.method === 'cash');
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

    // Dynamic Delivery UPI Payment
    const isDelivery = Boolean((invoice as any).is_delivery || invoice.print_delivery_token || (invoice as any).delivery_id);
    const upiId = (template.upiId || config.payments?.upiId || '').trim();
    const upiPayeeName = (template.upiPayeeName || config.payments?.upiPayeeName || shopName || '').trim();
    const shouldPrintUpiQr = isDelivery && upiId && (template.printUpiQrOnDelivery !== false);
    let upiQrSvg = '';
    if (shouldPrintUpiQr) {
      const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiPayeeName)}&am=${grandTotalStr}&cu=INR`;
      upiQrSvg = generateQrSvg(upiUrl, is58 ? 120 : 135);
    }

    const paperWidthMm = is58 ? 58 : 72;
    const safePrintWidthMm = template.safePrintWidthMm || (is58 ? 48 : 60);
    const userOffsetMm = template.leftMarginMm ?? 0;

    const headerAlign = template.headerAlignment || 'left';
    const itemWidthPct = template.itemWidthPercent || 44;
    const qtyWidthPct = template.qtyWidthPercent || 18;
    const rateWidthPct = template.rateWidthPercent || 18;
    const amtWidthPct = template.amountWidthPercent || 20;
    const rightMarginMm = Math.max(0, template.rightMarginMm ?? 2);
    const rightSafeMarginMm = Math.max(0, template.rightSafeMarginMm ?? 5);

    const offsets: Record<string, number> = template.elementOffsets || {};
    const getOffsetStyle = (key: string) => {
      const val = offsets[key];
      return val ? `position: relative; left: ${val}mm;` : '';
    };

    const itemLabel = template.itemColLabel || 'ITEM';
    const qtyLabel = template.qtyColLabel || 'Qty';
    const rateLabel = template.rateColLabel || 'Rate';
    const amtLabel = template.amtColLabel || 'Amount';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>POS Receipt</title>
  <style>
    @page {
      margin: 0;
      size: ${paperWidthMm}mm auto;
    }
    @media print {
      html, body {
        width: ${paperWidthMm}mm !important;
        margin: 0 !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: ${paperWidthMm}mm;
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000 !important;
      font-family: ${fontStack};
      font-size: ${baseFontSizePx}px;
      font-weight: 700;
      line-height: 1.25;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    .receipt-container {
      width: ${safePrintWidthMm}mm !important;
      max-width: ${safePrintWidthMm}mm !important;
      position: relative;
      left: ${userOffsetMm}mm;
      margin: 0;
      padding-top: ${topMarginMm}mm;
      padding-left: 0;
      padding-right: 0;
      box-sizing: border-box;
      overflow: hidden;
      text-align: left;
    }
    .shop-name {
      font-size: ${baseFontSizePx + 4}px;
      font-weight: 900;
      letter-spacing: 0.5px;
      text-align: ${headerAlign};
      text-transform: uppercase;
      line-height: 1.2;
      margin-bottom: 2px;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    .shop-info {
      font-size: ${Math.max(9, baseFontSizePx - 1)}px;
      font-weight: 700;
      text-align: ${headerAlign};
      line-height: 1.25;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    .customer-info {
      font-size: ${baseFontSizePx + 1}px;
      font-weight: 900;
      text-align: left;
      line-height: 1.2;
      margin: 4px 0 2px 0;
      text-transform: uppercase;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    .blank-line {
      height: 4px;
    }
    .bill-type {
      font-size: ${baseFontSizePx + 2}px;
      font-weight: 900;
      text-align: ${headerAlign};
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 3px 0;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: ${is58 ? '10px' : '11.5px'};
      font-weight: 700;
      line-height: 1.3;
      width: 100%;
    }
    .meta-row > span:last-child {
      text-align: right;
      white-space: nowrap;
      word-break: normal;
    }
    .divider {
      border-top: 1px dashed #000000;
      margin: 3px 0;
      width: 100%;
    }
    table.items-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: ${is58 ? '10px' : '11.5px'};
      font-family: inherit;
      margin: 0;
    }
    table.items-table th {
      font-size: ${is58 ? '10px' : '11.5px'};
      font-weight: 900;
      padding: 2px 0 3px 0;
      border-bottom: 1px dashed #000000;
    }
    table.items-table td {
      padding: 2px 0;
      vertical-align: top;
      font-weight: 700;
    }
    
    .col-desc { text-align: left; width: ${itemWidthPct}%; word-break: break-word; overflow-wrap: break-word; font-weight: 700; padding-right: 2px; }
    .col-qty { text-align: right; width: ${qtyWidthPct}%; font-weight: 700; word-break: break-word; padding-right: 2px; }
    .col-rate { text-align: right; width: ${rateWidthPct}%; font-weight: 700; word-break: break-word; padding-right: 4px; }
    .col-amt { text-align: right; width: ${amtWidthPct}%; font-weight: 900; word-break: break-word; overflow-wrap: break-word; }

    .adj-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: ${is58 ? '10px' : '11.5px'};
      font-weight: 700;
      line-height: 1.3;
      width: 100%;
    }
    .adj-row > span:last-child {
      text-align: right;
      white-space: nowrap;
      word-break: normal;
    }
    .net-amount-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      width: 100%;
      margin: 2px 0;
    }
    .net-label {
      font-size: ${is58 ? '11px' : '12px'};
      font-weight: 900;
    }
    .net-value {
      font-size: ${is58 ? '11px' : '12px'};
      font-weight: 900;
      text-align: right;
      white-space: nowrap;
      word-break: normal;
    }
    .balance-section {
      width: 100%;
      margin-top: 2px;
    }
    .balance-section .adj-row > span:last-child {
      text-align: right;
    }
    .note-row {
      text-align: left;
      font-size: ${is58 ? '9.5px' : '10.5px'};
      font-weight: 700;
      margin-top: 3px;
      word-break: break-word;
      overflow-wrap: break-word;
    }
  </style>
</head>
<body>
  <div class="receipt-container">
    <!-- 0. Shop Header Block -->
    <div style="${getOffsetStyle('shopHeader')}">
      ${topSlogan ? `<div class="shop-info" style="font-weight: 900; margin-bottom: 2px;">${topSlogan}</div>` : ''}
      <!-- 1. Shop Name -->
      <div class="shop-name">${shopName}</div>
      <!-- 2. Address -->
      ${addressLines.map(line => `<div class="shop-info">${line}</div>`).join('')}
      <!-- 3. Phone & Tax -->
      ${shopPhone ? `<div class="shop-info">${shopPhone.startsWith('Ph') ? shopPhone : `Ph: ${shopPhone}`}</div>` : ''}
      ${gstin ? `<div class="shop-info">GSTIN: ${gstin}</div>` : ''}
      ${email ? `<div class="shop-info">Email: ${email}</div>` : ''}
    </div>
    
    <!-- Customer Details (if customer selected) -->
    ${customerName ? `
      <div class="customer-info" style="${getOffsetStyle('customerBox')}">
        <div>${customerName}</div>
        ${customerPhone ? `<div>${customerPhone}</div>` : ''}
      </div>
    ` : ''}

    <!-- 4. Bill Title -->
    <div class="bill-type" style="${getOffsetStyle('billType')}">${primaryPayment} BILL</div>
    ${(invoice.reprint_count || 0) > 0 ? `
      <div class="duplicate-badge" style="text-align: center; font-weight: 900; font-size: ${baseFontSizePx + 1}px; letter-spacing: 0.5px; margin: 2px 0;">
        *** ${(template.duplicateCopyLabel || 'Duplicate Copy').toUpperCase()} (#${invoice.reprint_count}) ***
      </div>
    ` : ''}

    <!-- 5. Meta Row 1: Bill No & Date -->
    <div class="meta-row" style="${getOffsetStyle('billNoDateRow')}">
      <span>Bill No : ${invNo}</span>
      <span>Date : ${dateStr}</span>
    </div>
    <!-- 6. Meta Row 2: Cashier & Time -->
    <div class="meta-row" style="${getOffsetStyle('cashierTimeRow')}">
      <span>Cashier : ${cashierName}</span>
      <span>Time : ${timeStr}</span>
    </div>

    <!-- 7. Full-width dashed divider -->
    <div class="divider"></div>

    <!-- 8. Unified Items Table -->
    <table class="items-table">
      <thead>
        <tr style="${getOffsetStyle('tableHeader')}">
          <th class="col-desc" style="${getOffsetStyle('colDesc')}">${itemLabel}</th>
          <th class="col-qty" style="${getOffsetStyle('colQty')}">${qtyLabel}</th>
          <th class="col-rate" style="${getOffsetStyle('colRate')}">${rateLabel}</th>
          <th class="col-amt" style="${getOffsetStyle('colAmt')}">${amtLabel}</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>

    <!-- 9. Full-width dashed divider -->
    <div class="divider"></div>

    <!-- 12. Adjustments & Totals -->
    <div class="adj-row" style="${getOffsetStyle('grossAmountRow')}">
      <span>Gross Amount :</span>
      <span>${subtotalStr}</span>
    </div>
    ${discountPaise > 0 ? `
      <div class="adj-row" style="${getOffsetStyle('grossAmountRow')}">
        <span>Discount (${discountPercent}%) :</span>
        <span>-${(discountPaise / 100).toFixed(2)}</span>
      </div>
    ` : ''}
    ${flatDeductionPaise > 0 ? `
      <div class="adj-row" style="${getOffsetStyle('grossAmountRow')}">
        <span>Deduction :</span>
        <span>-${(flatDeductionPaise / 100).toFixed(2)}</span>
      </div>
    ` : ''}
    ${dressingChargePaise > 0 ? `
      <div class="adj-row" style="${getOffsetStyle('grossAmountRow')}">
        <span>Dressing Charge :</span>
        <span>+${(dressingChargePaise / 100).toFixed(2)}</span>
      </div>
    ` : ''}
    <div class="adj-row" style="${getOffsetStyle('coinageRow')}">
      <span>Coinage :</span>
      <span>${(roundOffPaise || 0) < 0 ? '-' : ''}${Math.abs((roundOffPaise || 0) / 100).toFixed(2)}</span>
    </div>

    <div class="net-amount-row" style="${getOffsetStyle('netAmountRow')}">
      <span class="net-label">Net Amount :</span>
      <span class="net-value">${grandTotalStr}</span>
    </div>

    <!-- 13. Full-width dashed divider -->
    <div class="divider"></div>

    <!-- 14. Items & Total Qty -->
    <div class="meta-row" style="${getOffsetStyle('itemsQtyRow')}">
      <span>No.Of.Items ${items.length}</span>
      <span>Total Qty ${totalQtyStr}</span>
    </div>

    <!-- 15. Customer Balance Section (Only when customer is selected) -->
    ${invoice.customer_id ? `
      <div class="balance-section" style="${getOffsetStyle('customerBalanceBlock')}">
        <div class="adj-row">
          <span>Opening Balance :</span>
          <span>${(openingBalancePaise / 100).toFixed(2)}</span>
        </div>
        <div class="adj-row">
          <span>Bill Amount     :</span>
          <span>${(billAmountPaise / 100).toFixed(2)}</span>
        </div>
        <div class="adj-row">
          <span>Paid Amount     :</span>
          <span>${(paidAmountPaise / 100).toFixed(2)}</span>
        </div>
        <div class="adj-row">
          <span>Closing Balance :</span>
          <span>${(closingBalancePaise / 100).toFixed(2)}</span>
        </div>
      </div>
    ` : ''}

    <!-- 16. Closing Divider -->
    <div class="divider"></div>

    <!-- 17. Optional Narration -->
    ${narration ? `<div class="note-row">Note: ${narration}</div>` : ''}

    <!-- 18. Optional Cash Change -->
    ${changeDuePaise > 0 ? `
      <div class="note-row">Cash: ${(cashTenderedPaise / 100).toFixed(2)} | Change: ${(changeDuePaise / 100).toFixed(2)}</div>
    ` : ''}

    <!-- Dynamic UPI Payment QR (Delivery Bills Only) -->
    ${shouldPrintUpiQr ? `
      <div class="upi-delivery-qr" style="margin: 6px 0; text-align: center; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 6px 0;">
        <div style="font-size: 11px; font-weight: 900; letter-spacing: 0.5px; margin-bottom: 2px;">SCAN TO PAY (DELIVERY)</div>
        <div style="font-size: 15px; font-weight: 900; margin-bottom: 3px;">₹${grandTotalStr}</div>
        <div style="display: flex; justify-content: center; align-items: center; margin: 4px 0;">
          ${upiQrSvg}
        </div>
        <div style="font-size: 9.5px; font-weight: 800; word-break: break-all;">UPI: ${upiId}</div>
        ${upiPayeeName ? `<div style="font-size: 8.5px; font-weight: 600; color: #333;">${upiPayeeName}</div>` : ''}
      </div>
    ` : ''}

    <!-- 19. Footer Conditions & Messages -->
    <div style="${getOffsetStyle('footerBlock')}">
      ${template.condition1 ? `<div class="shop-info" style="margin-top: 3px; font-size: 9.5px;">* ${template.condition1}</div>` : ''}
      ${template.condition2 ? `<div class="shop-info" style="font-size: 9.5px;">* ${template.condition2}</div>` : ''}
      ${template.condition3 ? `<div class="shop-info" style="font-size: 9.5px;">* ${template.condition3}</div>` : ''}
      ${template.footerMsg1 ? `<div class="shop-info" style="font-weight: 900; margin-top: 4px;">${template.footerMsg1}</div>` : ''}
      ${template.footerMsg2 ? `<div class="shop-info">${template.footerMsg2}</div>` : ''}
    </div>

    <!-- Generous Feed & Cut Spacing (Never cuts through totals) -->
    <div class="cut-spacing" style="height: 25mm;"></div>
  </div>
</body>
</html>`;
  },

  generatePurchaseThermalText(invoiceId: number): string {
    const config = configService.get();
    const template = config.receiptTemplate || { paperWidth: '80mm' };
    const width = template.paperWidth === '58mm' ? 32 : 40;

    const invoice = db.prepare('SELECT * FROM purchase_invoices WHERE id = ?').get(invoiceId) as any;
    if (!invoice) return 'Purchase Invoice Not Found';

    const supplier = db.prepare('SELECT company_name FROM suppliers WHERE id = ?').get(invoice.supplier_id) as any;
    const items = db.prepare(`
      SELECT pi.quantity, pi.unit_price_paise, pi.total_amount_paise, pv.variant_name, p.name as product_name
      FROM purchase_invoice_items pi
      JOIN product_variants pv ON pv.id = pi.product_variant_id
      JOIN products p ON p.id = pv.product_id
      WHERE pi.purchase_invoice_id = ?
    `).all(invoiceId) as any[];

    const shopName = config.shopInfo?.name || 'MEAT SHOP POS';
    const purRef = invoice.purchase_ref_number || `PUR-${invoice.id}`;
    const supplierName = supplier?.company_name || `Supplier #${invoice.supplier_id}`;
    const billNo = invoice.supplier_invoice_number || 'N/A';
    const dateStr = new Date(invoice.invoice_date).toLocaleDateString();
    const divider = '-'.repeat(width);

    let lines: string[] = [];
    lines.push(centerText(shopName.toUpperCase(), width));
    lines.push(centerText('PURCHASE STOCK RECEIPT', width));
    lines.push(divider);
    lines.push(alignLeftRight(`PUR Ref : ${purRef}`, `Date : ${dateStr}`, width));
    lines.push(alignLeftRight(`Supplier : ${supplierName}`, `Bill # : ${billNo}`, width));
    lines.push(divider);

    if (width === 32) {
      lines.push('Description'.padEnd(11) + 'Qty'.padStart(5) + 'Rate'.padStart(7) + 'Amount'.padStart(9));
    } else {
      lines.push('Description'.padEnd(16) + 'Qty'.padStart(6) + 'Rate'.padStart(8) + 'Amount'.padStart(10));
    }
    lines.push(divider);

    for (const item of items) {
      const pName = `${item.product_name} ${item.variant_name}`.trim().toUpperCase();
      const qtyStr = `${item.quantity}`;
      const rateStr = (item.unit_price_paise / 100).toFixed(2);
      const amtStr = (item.total_amount_paise / 100).toFixed(2);

      if (width === 32) {
        const truncName = pName.length > 11 ? pName.slice(0, 11) : pName.padEnd(11);
        lines.push(`${truncName}${qtyStr.padStart(5)}${rateStr.padStart(7)}${amtStr.padStart(9)}`);
      } else {
        if (pName.length <= 16) {
          lines.push(`${pName.padEnd(16)}${qtyStr.padStart(6)}${rateStr.padStart(8)}${amtStr.padStart(10)}`);
        } else {
          lines.push(pName);
          lines.push(`${''.padEnd(16)}${qtyStr.padStart(6)}${rateStr.padStart(8)}${amtStr.padStart(10)}`);
        }
      }
    }

    lines.push(divider);
    lines.push(alignLeftRight('Net Purchased :', `₹${(invoice.total_amount_paise / 100).toFixed(2)}`, width));
    lines.push(divider);
    lines.push(alignLeftRight(`Status : ${(invoice.status || 'APPROVED').toUpperCase()}`, `Items : ${items.length}`, width));
    lines.push(divider);
    lines.push(centerText('Physical Stock Receipt Voucher', width));

    return lines.join('\n');
  },

  generatePurchaseThermalHTML(invoiceId: number): string {
    const config = configService.get();
    const template = config.receiptTemplate || { paperWidth: '80mm' };

    const invoice = db.prepare('SELECT * FROM purchase_invoices WHERE id = ?').get(invoiceId) as any;
    if (!invoice) return '<html><body>Purchase Invoice Not Found</body></html>';

    const supplier = db.prepare('SELECT company_name FROM suppliers WHERE id = ?').get(invoice.supplier_id) as any;
    const items = db.prepare(`
      SELECT pi.quantity, pi.unit_price_paise, pi.total_amount_paise, pv.variant_name, p.name as product_name
      FROM purchase_invoice_items pi
      JOIN product_variants pv ON pv.id = pi.product_variant_id
      JOIN products p ON p.id = pv.product_id
      WHERE pi.purchase_invoice_id = ?
    `).all(invoiceId) as any[];

    const shopName = config.shopInfo?.name || 'MEAT SHOP POS';
    const purRef = invoice.purchase_ref_number || `PUR-${invoice.id}`;
    const supplierName = supplier?.company_name || `Supplier #${invoice.supplier_id}`;
    const billNo = invoice.supplier_invoice_number || 'N/A';
    const dateStr = new Date(invoice.invoice_date).toLocaleDateString();
    const is58 = template.paperWidth === '58mm';

    const tableRows = items.map(item => {
      const pName = `${item.product_name} ${item.variant_name}`.trim().toUpperCase();
      const qtyStr = `${item.quantity}`;
      const rateStr = (item.unit_price_paise / 100).toFixed(2);
      const amtStr = (item.total_amount_paise / 100).toFixed(2);

      return `
        <tr>
          <td class="col-desc">${pName}</td>
          <td class="col-qty">${qtyStr}</td>
          <td class="col-rate">${rateStr}</td>
          <td class="col-amt">${amtStr}</td>
        </tr>
      `;
    }).join('');

    const totalAmountStr = (invoice.total_amount_paise / 100).toFixed(2);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { margin: 0; size: ${is58 ? '58mm' : '80mm'} auto; }
    @media print { html, body { width: 100%; margin: 0 !important; padding: 0 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%; margin: 0; padding: 0; background: #ffffff; color: #000000 !important;
      font-family: "Courier New", Courier, Consolas, monospace; font-size: ${is58 ? '10px' : '12px'};
      font-weight: 600; line-height: 1.25; -webkit-font-smoothing: none; text-rendering: pixelated;
    }
    .receipt-container { width: 100%; padding: ${is58 ? '1.5mm 1.5mm' : '2.5mm 2.5mm'}; margin: 0 auto; }
    .shop-name { font-size: ${is58 ? '16px' : '20px'}; font-weight: 900; text-align: center; text-transform: uppercase; margin-bottom: 2px; }
    .bill-type { font-size: ${is58 ? '13px' : '15px'}; font-weight: 900; text-align: center; text-transform: uppercase; margin: 4px 0; }
    .meta-row { font-size: ${is58 ? '10px' : '11.5px'}; font-weight: 600; display: flex; justify-content: space-between; margin-bottom: 2px; }
    .divider { border-top: 1px dashed #000000; margin: 3px 0; }
    table.items-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: ${is58 ? '10px' : '11.5px'}; margin: 2px 0; }
    table.items-table th { font-size: ${is58 ? '10px' : '11.5px'}; font-weight: 900; padding: 2px 0; }
    table.items-table td { padding: 2px 0; vertical-align: top; }
    .col-desc { text-align: left; width: ${is58 ? '42%' : '44%'}; word-break: break-word; font-weight: 600; }
    .col-qty { text-align: right; width: 16%; font-weight: 700; white-space: nowrap; }
    .col-rate { text-align: right; width: 18%; font-weight: 600; white-space: nowrap; }
    .col-amt { text-align: right; width: ${is58 ? '24%' : '22%'}; font-weight: 700; white-space: nowrap; }
    .net-amount-row { display: flex; justify-content: space-between; align-items: center; width: 100%; margin: 2px 0; }
    .net-label { font-size: ${is58 ? '13px' : '15px'}; font-weight: 700; }
    .net-value { font-size: ${is58 ? '20px' : '25px'}; font-weight: 900; }
    .footer { font-size: ${is58 ? '10px' : '11px'}; font-weight: 500; text-align: center; margin-top: 6px; }
  </style>
</head>
<body>
  <div class="receipt-container">
    <div class="shop-name">${shopName}</div>
    <div class="bill-type">PURCHASE STOCK RECEIPT</div>
    <div class="divider"></div>
    <div class="meta-row"><span>PUR Ref : <strong>${purRef}</strong></span><span>Date : ${dateStr}</span></div>
    <div class="meta-row"><span>Supplier : <strong>${supplierName}</strong></span><span>Bill # : ${billNo}</span></div>
    <div class="divider"></div>
    <table class="items-table">
      <thead>
        <tr>
          <th class="col-desc">Description</th>
          <th class="col-qty">Qty</th>
          <th class="col-rate">Rate</th>
          <th class="col-amt">Amount</th>
        </tr>
      </thead>
    </table>
    <div class="divider"></div>
    <table class="items-table">
      <tbody>
        ${tableRows}
      </tbody>
    </table>
    <div class="divider"></div>
    <div class="net-amount-row">
      <span class="net-label">Net Purchased :</span>
      <span class="net-value">₹${totalAmountStr}</span>
    </div>
    <div class="divider"></div>
    <div class="meta-row"><span>Status : ${(invoice.status || 'APPROVED').toUpperCase()}</span><span>Items : ${items.length}</span></div>
    <div class="divider"></div>
    <div class="footer">Physical Stock Receipt Voucher</div>
  </div>
</body>
</html>`;
  },

  /**
   * Plain text token bill printing only Shop Name, Bill No, Date, Description and Qty (matches image 2).
   */
  generateTokenReceiptText(invoiceId: number, customWidth?: number): string {
    const config = configService.get();
    const template = config.receiptTemplate || { paperWidth: '80mm' };
    const width = customWidth || (template.paperWidth === '58mm' ? 32 : 38);
    const invoice = invoiceRepository.findById(invoiceId);
    const items = invoiceItemsRepository.findByInvoiceId(invoiceId);

    const divider = '-'.repeat(width);
    let lines: string[] = [];

    const shopName = invoice.shop_name_snapshot || config.shopInfo?.name || 'MEAT SHOP POS';
    lines.push(shopName.toUpperCase());

    if ((invoice.reprint_count || 0) > 0) {
      const duplicateLabel = (template.duplicateCopyLabel || 'Duplicate Copy').toUpperCase();
      lines.push(centerText(`*** ${duplicateLabel} (#${invoice.reprint_count}) ***`, width));
    }

    const invNo = invoice.invoice_number ? invoice.invoice_number.split('_')[0] : `${invoice.id}`;
    const completedDate = invoice.completed_at ? new Date(invoice.completed_at) : new Date();
    const dd = String(completedDate.getDate()).padStart(2, '0');
    const mm = String(completedDate.getMonth() + 1).padStart(2, '0');
    const yyyy = completedDate.getFullYear();
    const dateStr = `${dd}/${mm}/${yyyy}`;

    lines.push(alignLeftRight(`Bill No : ${invNo}`, `Date : ${dateStr}`, width));
    lines.push(divider);
    lines.push(alignLeftRight('Description', 'Qty', width));
    lines.push(divider);

    for (const item of items) {
      const pName = `${item.product_name} ${item.variant_name && item.variant_name !== 'Default' ? item.variant_name : ''}`.trim().toUpperCase();
      let qtyVal = 0;
      let qtyStr = '';
      if (item.unit_type === 'weight' && item.quantity_grams !== null) {
        qtyVal = item.quantity_grams / 1000;
        qtyStr = qtyVal.toFixed(3);
      } else {
        qtyVal = item.quantity_units || 1;
        qtyStr = `${qtyVal}.000`;
      }
      lines.push(alignLeftRight(pName, qtyStr, width));
    }
    lines.push(divider);

    return lines.join('\n');
  },

  /**
   * HTML token bill printing only Shop Name, Bill No, Date, Description and Qty (matches image 2).
   */
  generateTokenReceiptHTML(invoiceId: number): string {
    const config = configService.get();
    const template = config.receiptTemplate || { paperWidth: '80mm' };
    const invoice = invoiceRepository.findById(invoiceId);
    const items = invoiceItemsRepository.findByInvoiceId(invoiceId);

    const is58 = template.paperWidth === '58mm';
    const shopName = invoice.shop_name_snapshot || config.shopInfo?.name || 'MEAT SHOP POS';
    const invNo = invoice.invoice_number ? invoice.invoice_number.split('_')[0] : `${invoice.id}`;

    const completedDate = invoice.completed_at ? new Date(invoice.completed_at) : new Date();
    const dd = String(completedDate.getDate()).padStart(2, '0');
    const mm = String(completedDate.getMonth() + 1).padStart(2, '0');
    const yyyy = completedDate.getFullYear();
    const dateStr = `${dd}/${mm}/${yyyy}`;

    const paperWidthMm = is58 ? 58 : 72;
    const baseSafeWidthMm = is58 ? 44 : 58;
    const userOffsetMm = template.leftMarginMm ?? 0;
    const topMarginMm = template.topMarginMm ?? 0;
    const rightMarginMm = Math.max(0, template.rightMarginMm ?? 2);
    const headerAlign = template.headerAlignment || 'left';

    const fontFamilies: Record<string, string> = {
      'Consolas': "'Consolas', 'Courier New', monospace",
      'Arial': "Arial, Helvetica, sans-serif",
      'Calibri': "Calibri, Candara, Segoe, sans-serif",
      'Segoe UI': "'Segoe UI', Roboto, sans-serif",
      'Courier New': "'Courier New', Courier, monospace",
    };
    const fontStack = fontFamilies[template.fontFamily || 'Consolas'] || fontFamilies['Consolas'];

    const fontSizes: Record<string, number> = {
      small: is58 ? 9.5 : 10.5,
      medium: is58 ? 10.5 : 11.5,
      large: is58 ? 11.5 : 12.5,
    };
    const baseFontSizePx = fontSizes[template.fontSize || 'medium'] || (is58 ? 10.5 : 11.5);

    const tableRows = items.map(item => {
      const pName = `${item.product_name} ${item.variant_name && item.variant_name !== 'Default' ? item.variant_name : ''}`.trim().toUpperCase();
      let qtyVal = 0;
      let qtyStr = '';
      if (item.unit_type === 'weight' && item.quantity_grams !== null) {
        qtyVal = item.quantity_grams / 1000;
        qtyStr = qtyVal.toFixed(3);
      } else {
        qtyVal = item.quantity_units || 1;
        qtyStr = `${qtyVal}.000`;
      }
      return `
        <tr>
          <td style="text-align: left; padding: 2px 0; word-break: break-word; overflow-wrap: break-word;">${pName}</td>
          <td style="text-align: right; padding: 2px 0; font-weight: 700; word-break: break-word;">${qtyStr}</td>
        </tr>
      `;
    }).join('');

    // Look up delivery record if this was a delivery bill
    let deliveryRecord: any = null;
    try {
      deliveryRecord = db.prepare('SELECT * FROM deliveries WHERE invoice_id = ? ORDER BY id DESC LIMIT 1').get(invoiceId);
    } catch (e) {}

    const isDelivery = Boolean((invoice as any).is_delivery || deliveryRecord);
    const delNo = deliveryRecord?.delivery_number || '';
    const custName = deliveryRecord?.customer_name || '';
    const custPhone = deliveryRecord?.customer_phone || '';
    const delAddr = deliveryRecord?.delivery_address_snapshot || '';
    const totalAmount = (invoice.total_paise / 100).toFixed(2);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${isDelivery ? 'Delivery Ticket' : 'POS Token'}</title>
  <style>
    @page { margin: 0; size: ${paperWidthMm}mm auto; }
    @media print { html, body { width: ${paperWidthMm}mm !important; margin: 0 !important; padding: 0 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: ${paperWidthMm}mm; margin: 0; padding: 0; background: #ffffff; color: #000000 !important;
      font-family: ${fontStack}; font-size: ${baseFontSizePx}px;
      font-weight: 700; line-height: 1.25; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
    }
    .receipt-container {
      width: ${baseSafeWidthMm}mm;
      max-width: ${baseSafeWidthMm}mm;
      position: relative;
      left: ${userOffsetMm}mm;
      margin: 0;
      padding-top: ${topMarginMm}mm;
      padding-left: 0;
      padding-right: ${rightMarginMm}mm;
      box-sizing: border-box;
      text-align: left;
    }
    .shop-name {
      font-size: ${baseFontSizePx + 4}px;
      font-weight: 900;
      text-align: ${headerAlign};
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    .ticket-badge {
      font-size: ${baseFontSizePx + 3}px;
      font-weight: 900;
      text-align: center;
      text-transform: uppercase;
      border: 2px solid #000;
      padding: 3px 0;
      margin: 4px 0;
      letter-spacing: 1px;
    }
    .meta-row {
      font-size: ${baseFontSizePx}px;
      font-weight: 700;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin: 2px 0;
    }
    .delivery-info {
      font-size: ${baseFontSizePx}px;
      font-weight: 700;
      margin: 3px 0;
      line-height: 1.3;
    }
    .divider {
      border-top: 1px dashed #000000;
      margin: 3px 0;
      width: 100%;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: ${baseFontSizePx}px;
      margin: 2px 0;
    }
    th {
      font-weight: 900;
      border-bottom: 1px dashed #000000;
      padding: 2px 0 3px 0;
    }
    td {
      padding: 2px 0;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="receipt-container">
    <div class="shop-name">${shopName}</div>
    ${isDelivery ? `
      <div class="ticket-badge">*** HOME DELIVERY TICKET ***</div>
      ${delNo ? `<div style="text-align: center; font-size: ${baseFontSizePx + 1}px; font-weight: 900; margin-bottom: 3px;">${delNo}</div>` : ''}
    ` : `
      <div class="ticket-badge">*** KITCHEN / TOKEN SLIP ***</div>
    `}
    ${(invoice.reprint_count || 0) > 0 ? `
      <div class="duplicate-badge" style="text-align: center; font-weight: 900; font-size: ${baseFontSizePx}px; margin: 2px 0;">
        *** ${(template.duplicateCopyLabel || 'Duplicate Copy').toUpperCase()} (#${invoice.reprint_count}) ***
      </div>
    ` : ''}
    <div class="meta-row">
      <span>Bill No : ${invNo}</span>
      <span>Date : ${dateStr}</span>
    </div>
    ${isDelivery && (custName || custPhone || delAddr) ? `
      <div class="divider"></div>
      <div class="delivery-info">
        ${custName ? `<div><strong>Customer:</strong> ${custName.toUpperCase()}</div>` : ''}
        ${custPhone ? `<div><strong>Mobile:</strong> ${custPhone}</div>` : ''}
        ${delAddr && delAddr !== 'Counter / Offline Delivery' ? `<div><strong>Address:</strong> ${delAddr}</div>` : ''}
      </div>
    ` : ''}
    <div class="divider"></div>
    <table>
      <thead>
        <tr>
          <th style="text-align: left; width: 70%;">Description</th>
          <th style="text-align: right; width: 30%;">Qty</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
    <div class="divider"></div>
    ${isDelivery ? `
      <div style="display: flex; justify-content: space-between; font-size: ${baseFontSizePx + 2}px; font-weight: 900; margin-top: 4px;">
        <span>TOTAL TO COLLECT:</span>
        <span>Rs. ${totalAmount}</span>
      </div>
      <div class="divider"></div>
    ` : ''}
  </div>
</body>
</html>`;
  },

  /**
   * Generates a thermal printer test ticket matching the live screen preview 1:1.
   */
  generateTestReceiptHTML(templateOverride?: Partial<any>): string {
    const config = configService.get();
    const template = {
      ...(config.receiptTemplate || {}),
      ...(templateOverride || {}),
    };

    const is58 = template.paperWidth === '58mm';
    const paperWidthMm = is58 ? 58 : 72;
    const safeWidthMm = template.safePrintWidthMm || (is58 ? 48 : 60);
    const userOffsetMm = template.leftMarginMm ?? 0;
    const topMarginMm = template.topMarginMm ?? 0;

    const headerAlign = template.headerAlignment || 'left';
    const itemWidthPct = template.itemWidthPercent || 44;
    const qtyWidthPct = template.qtyWidthPercent || 18;
    const rateWidthPct = template.rateWidthPercent || 18;
    const amtWidthPct = template.amountWidthPercent || 20;
    const rightMarginMm = Math.max(0, template.rightMarginMm ?? 4);
    const rightSafeMarginMm = Math.max(0, template.rightSafeMarginMm ?? 5);

    const chosenFont = template.fontFamily || 'Consolas';
    const fontStack = chosenFont === 'Consolas'
      ? "'Consolas', 'Courier New', monospace"
      : `'${chosenFont}', sans-serif`;

    const fontSizeSetting = template.fontSize || 'medium';
    let baseFontSizePx = is58 ? 9.5 : 11.5;
    if (fontSizeSetting === 'small') baseFontSizePx -= 1.5;
    if (fontSizeSetting === 'large') baseFontSizePx += 1.5;

    const shopName = template.shopName || config.shopInfo?.name || 'MY PREMIUM MEAT SHOP';
    const addr1 = template.addressLine1 || config.shopInfo?.address || '123 Market Square, Bangalore';
    const addr2 = template.addressLine2 || 'Opposite Bus Stand';
    const shopPhone = template.softwareMobileNo || template.phone || config.shopInfo?.phone || '7200134807';
    const topSlogan = template.topSlogan || '*** FRESH & HALAL MEAT ***';
    const prefix = config.invoice?.prefix || 'INV-';

    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const dateStr = `${dd}/${mm}/${yyyy}`;
    let hours = now.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const timeStr = `${String(hours).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${ampm}`;

    const offsets: Record<string, number> = template.elementOffsets || {};
    const getOffsetStyle = (key: string) => {
      const val = offsets[key];
      return val ? `position: relative; left: ${val}mm;` : '';
    };

    const itemLabel = template.itemColLabel || 'ITEM';
    const qtyLabel = template.qtyColLabel || 'Qty';
    const rateLabel = template.rateColLabel || 'Rate';
    const amtLabel = template.amtColLabel || 'Amount';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>POS Receipt</title>
  <style>
    @page {
      margin: 0;
      size: ${paperWidthMm}mm auto;
    }
    @media print {
      html, body {
        width: ${paperWidthMm}mm !important;
        margin: 0 !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: ${paperWidthMm}mm;
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000 !important;
      font-family: ${fontStack};
      font-size: ${baseFontSizePx}px;
      font-weight: 700;
      line-height: 1.25;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    .receipt-container {
      width: ${safeWidthMm}mm !important;
      max-width: ${safeWidthMm}mm !important;
      position: relative;
      left: ${userOffsetMm}mm;
      margin: 0;
      padding-top: ${topMarginMm}mm;
      padding-left: 0;
      padding-right: 0;
      box-sizing: border-box;
      overflow: hidden;
      text-align: left;
    }
    .shop-slogan {
      font-size: 11px;
      font-weight: 900;
      text-align: ${headerAlign};
      margin-bottom: 2px;
      word-break: break-word;
    }
    .shop-name {
      font-size: ${baseFontSizePx + 3}px;
      font-weight: 900;
      letter-spacing: 0.5px;
      text-align: ${headerAlign};
      text-transform: uppercase;
      line-height: 1.2;
      margin-bottom: 3px;
      word-break: break-word;
    }
    .shop-info {
      font-size: ${Math.max(9, baseFontSizePx - 1)}px;
      font-weight: 700;
      text-align: ${headerAlign};
      line-height: 1.25;
      word-break: break-word;
    }
    .customer-box {
      font-size: ${baseFontSizePx + 1}px;
      font-weight: 900;
      text-transform: uppercase;
      text-align: left;
      margin: 4px 0 2px 0;
      line-height: 1.25;
      word-break: break-word;
    }
    .bill-type {
      font-size: ${baseFontSizePx + 1}px;
      font-weight: 900;
      text-align: ${headerAlign};
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 4px 0 3px 0;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: ${is58 ? '10px' : '10.5px'};
      font-weight: 700;
      line-height: 1.3;
      width: 100%;
      margin: 1px 0;
    }
    .meta-row > span:last-child {
      text-align: right;
      white-space: nowrap;
      word-break: normal;
    }
    .divider {
      border-top: 1px dashed #000000;
      margin: 3px 0;
      width: 100%;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: ${is58 ? '10px' : '10.5px'};
      margin: 2px 0;
    }
    th {
      font-weight: 900;
      text-transform: uppercase;
      border-bottom: 1px dashed #000000;
      padding: 2.5px 0;
      line-height: 1.2;
    }
    td {
      padding: 2px 0;
      font-weight: 700;
      vertical-align: top;
      word-break: break-word;
    }
    .col-desc { text-align: left; width: ${itemWidthPct}%; word-break: break-word; overflow-wrap: break-word; font-weight: 700; padding-right: 2px; }
    .col-qty  { text-align: right; width: ${qtyWidthPct}%; font-weight: 700; word-break: break-word; padding-right: 2px; }
    .col-rate { text-align: right; width: ${rateWidthPct}%; font-weight: 700; word-break: break-word; padding-right: 4px; }
    .col-amt  { text-align: right; width: ${amtWidthPct}%; font-weight: 900; word-break: break-word; overflow-wrap: break-word; }
    .adj-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: ${is58 ? '10px' : '10.5px'};
      font-weight: 700;
      line-height: 1.3;
      width: 100%;
      margin: 1px 0;
    }
    .adj-row > span:last-child {
      text-align: right;
      white-space: nowrap;
      word-break: normal;
    }
    .net-amount-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: ${is58 ? '11px' : '12px'};
      font-weight: 900;
      line-height: 1.3;
      width: 100%;
      margin: 2px 0;
    }
    .net-amount-row > span:last-child {
      text-align: right;
      white-space: nowrap;
      word-break: normal;
    }
    .footer-condition {
      text-align: ${headerAlign};
      font-size: ${Math.max(8, baseFontSizePx - 2.5)}px;
      font-weight: 700;
      line-height: 1.25;
      margin-top: 2px;
      word-break: break-word;
    }
    .cut-spacing {
      height: 25mm;
    }
  </style>
</head>
<body>
  <div class="receipt-container">
    <div style="${getOffsetStyle('shopHeader')}">
      ${topSlogan ? `<div class="shop-slogan">${topSlogan}</div>` : ''}
      <div class="shop-name">${shopName}</div>
      ${addr1 ? `<div class="shop-info">${addr1}</div>` : ''}
      ${addr2 ? `<div class="shop-info">${addr2}</div>` : ''}
      ${shopPhone ? `<div class="shop-info">${shopPhone.startsWith('Ph') ? shopPhone : `Ph: ${shopPhone}`}</div>` : ''}
    </div>

    ${template.showCustomer ? `
      <div class="customer-box" style="${getOffsetStyle('customerBox')}">
        <div>CUST: MOHAN REDDY</div>
        <div>PH  : 9876543210</div>
      </div>
    ` : ''}

    <div class="bill-type" style="${getOffsetStyle('billType')}">*** CASH BILL ***</div>

    <div class="meta-row" style="${getOffsetStyle('billNoDateRow')}">
      <span>Bill No : ${prefix}0042</span>
      <span>Date : ${dateStr}</span>
    </div>
    <div class="meta-row" style="${getOffsetStyle('cashierTimeRow')}">
      ${template.showCashier ? `<span>Cashier : ADMIN</span>` : `<span></span>`}
      <span>Time : ${timeStr}</span>
    </div>

    <div class="divider"></div>

    <table>
      <thead>
        <tr style="${getOffsetStyle('tableHeader')}">
          <th class="col-desc" style="${getOffsetStyle('colDesc')}">${itemLabel}</th>
          <th class="col-qty" style="${getOffsetStyle('colQty')}">${qtyLabel}</th>
          <th class="col-rate" style="${getOffsetStyle('colRate')}">${rateLabel}</th>
          <th class="col-amt" style="${getOffsetStyle('colAmt')}">${amtLabel}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="col-desc" style="${getOffsetStyle('colDesc')}">CHICKEN CURRY CUT</td>
          <td class="col-qty" style="${getOffsetStyle('colQty')}">0.500</td>
          <td class="col-rate" style="${getOffsetStyle('colRate')}">160.00</td>
          <td class="col-amt" style="${getOffsetStyle('colAmt')}">80.00</td>
        </tr>
        <tr>
          <td class="col-desc" style="${getOffsetStyle('colDesc')}">CHICKEN LIVER</td>
          <td class="col-qty" style="${getOffsetStyle('colQty')}">0.250</td>
          <td class="col-rate" style="${getOffsetStyle('colRate')}">30.00</td>
          <td class="col-amt" style="${getOffsetStyle('colAmt')}">7.50</td>
        </tr>
      </tbody>
    </table>

    <div class="divider"></div>

    <div class="adj-row" style="${getOffsetStyle('grossAmountRow')}">
      <span>Gross Amount :</span>
      <span>87.50</span>
    </div>
    <div class="adj-row" style="${getOffsetStyle('coinageRow')}">
      <span>Coinage :</span>
      <span>0.50</span>
    </div>
    <div class="net-amount-row" style="${getOffsetStyle('netAmountRow')}">
      <span>Net Amount :</span>
      <span>88.00</span>
    </div>

    <div class="divider"></div>

    <div class="meta-row" style="${getOffsetStyle('itemsQtyRow')}">
      <span>No.Of.Items 2</span>
      <span>Total Qty 0.750</span>
    </div>

    ${template.showCustomer ? `
      <div class="divider"></div>
      <div style="${getOffsetStyle('customerBalanceBlock')}">
        <div class="adj-row">
          <span>Opening Balance :</span>
          <span>0.00</span>
        </div>
        <div class="adj-row">
          <span>Bill Amount     :</span>
          <span>88.00</span>
        </div>
        <div class="adj-row">
          <span>Paid Amount     :</span>
          <span>88.00</span>
        </div>
        <div class="adj-row" style="font-weight: 900;">
          <span>Closing Balance :</span>
          <span>0.00</span>
        </div>
      </div>
    ` : ''}

    <div class="divider"></div>

    <div style="${getOffsetStyle('footerBlock')}">
      ${template.condition1 ? `<div class="footer-condition">* ${template.condition1}</div>` : '<div class="footer-condition">* Weight checked at billing counter</div>'}
      ${template.condition2 ? `<div class="footer-condition">* ${template.condition2}</div>` : '<div class="footer-condition">* Goods once sold cannot be returned</div>'}
      ${template.condition3 ? `<div class="footer-condition">* ${template.condition3}</div>` : ''}
      ${template.footerMsg1 ? `<div class="footer-condition" style="font-weight: 900; margin-top: 3px;">${template.footerMsg1}</div>` : ''}
      ${template.footerMsg2 ? `<div class="footer-condition">${template.footerMsg2}</div>` : ''}
    </div>

    <div class="divider"></div>

    <div style="font-size: ${Math.max(9, baseFontSizePx - 1)}px; font-weight: 700; line-height: 1.35; margin: 4px 0; background: #f4f4f4; padding: 4px; border: 1px dashed #000; box-sizing: border-box; width: 100%;">
      <div style="font-weight: 900; text-align: center; margin-bottom: 2px;">*** CALIBRATION INFO ***</div>
      <div style="display: flex; justify-content: space-between;"><span>Safe Width:</span><strong>${safeWidthMm} mm</strong></div>
      <div style="display: flex; justify-content: space-between;"><span>H-Offset  :</span><strong>${userOffsetMm} mm</strong></div>
      <div style="display: flex; justify-content: space-between;"><span>Paper Roll:</span><strong>${template.paperWidth || '80mm'}</strong></div>
      <div style="display: flex; justify-content: space-between;"><span>Font / Sz :</span><strong>${chosenFont} (${fontSizeSetting})</strong></div>
    </div>

    <div class="cut-spacing"></div>
  </div>
</body>
</html>`;
  },

  /**
   * Generates a multi-width calibration test print HTML with back-to-back test strips
   * for widths [76, 72, 68, 64, 60, 56, 52] mm (or custom widths).
   * Each strip features full-width reference lines, column tables, and clear boundary markers
   * so the user can immediately observe which width prints with zero cropping.
   */
  generateWidthCalibrationHTML(customWidths?: number[]): string {
    const config = configService.get();
    const template = config.receiptTemplate || {};
    const widths = customWidths && customWidths.length > 0
      ? customWidths
      : [76, 72, 68, 64, 60, 56, 52];

    const chosenFont = template.fontFamily || 'Consolas';
    const fontStack = chosenFont === 'Consolas'
      ? "'Consolas', 'Courier New', monospace"
      : `'${chosenFont}', sans-serif`;

    const stripsHtml = widths.map((w, idx) => {
      let rulerStr = '|0mm';
      let currentMm = 10;
      while (currentMm <= w) {
        rulerStr += `...${currentMm}`;
        currentMm += 10;
      }
      rulerStr += `..${w}mm|`;

      return `
      <div class="cal-strip" style="width: ${w}mm; max-width: ${w}mm; box-sizing: border-box; border: 2px solid #000; margin: 0 0 8mm 0; padding: 3px; background: #fff; page-break-inside: avoid;">
        <div style="font-size: 13px; font-weight: 900; text-align: center; border-bottom: 2px solid #000; padding-bottom: 2px; margin-bottom: 3px;">
          *** WIDTH TEST: ${w} mm ***
        </div>
        <div style="font-size: 8px; font-family: monospace; font-weight: 700; white-space: nowrap; overflow: hidden; border-bottom: 1px dashed #000; margin-bottom: 3px; letter-spacing: -0.2px;">
          ${rulerStr}
        </div>
        <div style="font-size: 9px; font-weight: 900; display: flex; justify-content: space-between; margin-bottom: 2px;">
          <span>[LEFT EDGE]</span>
          <span>[CENTER]</span>
          <span>[RIGHT EDGE]</span>
        </div>
        <div style="border-top: 1px dashed #000; margin: 2px 0;"></div>
        <table style="width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; font-weight: 700;">
          <thead>
            <tr style="border-bottom: 1px solid #000;">
              <th style="text-align: left; width: 42%; padding: 1px 0;">ITEM</th>
              <th style="text-align: right; width: 18%; padding: 1px 0;">QTY</th>
              <th style="text-align: right; width: 20%; padding: 1px 0;">RATE</th>
              <th style="text-align: right; width: 20%; padding: 1px 0;">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="text-align: left; padding: 2px 0; word-break: break-word;">CHICKEN CURRY CUT</td>
              <td style="text-align: right; padding: 2px 0;">1.000</td>
              <td style="text-align: right; padding: 2px 0;">180.00</td>
              <td style="text-align: right; padding: 2px 0;">180.00</td>
            </tr>
          </tbody>
        </table>
        <div style="border-top: 1px dashed #000; margin: 2px 0;"></div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 900; margin: 2px 0;">
          <span>NET AMOUNT:</span>
          <span>₹180.00</span>
        </div>
        <div style="border-top: 1px solid #000; margin-top: 3px; padding-top: 2px; font-size: 8px; font-weight: 700; text-align: center; background: #eeeeee;">
          Strip #${idx + 1} (${w}mm) — If right border or text is cut, ${w}mm is TOO WIDE
        </div>
      </div>
      `;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Width Calibration Series</title>
  <style>
    @page { margin: 0; size: 80mm auto; }
    @media print {
      html, body {
        width: 80mm !important;
        margin: 0 !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 80mm;
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000 !important;
      font-family: ${fontStack};
      line-height: 1.25;
      -webkit-font-smoothing: antialiased;
    }
    .calibration-container {
      width: 80mm;
      margin: 0;
      padding: 3mm 0 25mm 0;
      box-sizing: border-box;
    }
    .header-banner {
      font-size: 13px;
      font-weight: 900;
      text-align: center;
      margin-bottom: 5mm;
      border-bottom: 2px dashed #000;
      padding-bottom: 3mm;
    }
  </style>
</head>
<body>
  <div class="calibration-container">
    <div class="header-banner">
      <div>*** THERMAL CALIBRATION SERIES ***</div>
      <div style="font-size: 10px; font-weight: 700; margin-top: 2px;">Find the widest strip below with ZERO right-edge cut!</div>
    </div>
    ${stripsHtml}
    <div style="text-align: center; font-size: 11px; font-weight: 900; margin-top: 4mm;">
      *** END OF CALIBRATION SERIES ***
    </div>
    <div style="height: 25mm;"></div>
  </div>
</body>
</html>`;
  }
};

import QRCode from 'qrcode';

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

export function generateClientTestReceiptHTML(template: any, shopInfo: any): string {
  const is58 = template?.paperWidth === '58mm';
  const paperWidthMm = is58 ? 58 : 72;
  const safeWidthMm = template?.safePrintWidthMm || (is58 ? 48 : 60);
  const userOffsetMm = template?.leftMarginMm ?? 0;
  const topMarginMm = template?.topMarginMm ?? 0;

  const headerAlign = template?.headerAlignment || 'left';
  const itemWidthPct = template?.itemWidthPercent || 44;
  const qtyWidthPct = template?.qtyWidthPercent || 18;
  const rateWidthPct = template?.rateWidthPercent || 18;
  const amtWidthPct = template?.amountWidthPercent || 20;
  const rightMarginMm = Math.max(0, template?.rightMarginMm ?? 4);
  const rightSafeMarginMm = Math.max(0, template?.rightSafeMarginMm ?? 5);

  const chosenFont = template?.fontFamily || 'Consolas';
  const fontStack = chosenFont === 'Consolas'
    ? "'Consolas', 'Courier New', monospace"
    : `'${chosenFont}', sans-serif`;

  const fontSizeSetting = template?.fontSize || 'medium';
  let baseFontSizePx = is58 ? 9.5 : 11.5;
  if (fontSizeSetting === 'small') baseFontSizePx -= 1.5;
  if (fontSizeSetting === 'large') baseFontSizePx += 1.5;

  const shopName = template?.shopName || shopInfo?.name || 'MY PREMIUM MEAT SHOP';
  const addr1 = template?.addressLine1 || shopInfo?.address || '123 Market Square, Bangalore';
  const addr2 = template?.addressLine2 || 'Opposite Bus Stand';
  const shopPhone = template?.softwareMobileNo || template?.phone || shopInfo?.phone || '7200134807';
  const topSlogan = template?.topSlogan || '*** FRESH & HALAL MEAT ***';

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const dateStr = `${dd}/${mm}/${yyyy}`;
  let hours = now.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const timeStr = `${String(hours).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${ampm}`;

  const offsets: Record<string, number> = template?.elementOffsets || {};
  const getOffsetStyle = (key: string) => {
    const val = offsets[key];
    return val ? `position: relative; left: ${val}mm;` : '';
  };

  const itemLabel = template?.itemColLabel || 'ITEM';
  const qtyLabel = template?.qtyColLabel || 'Qty';
  const rateLabel = template?.rateColLabel || 'Rate';
  const amtLabel = template?.amtColLabel || 'Amount';

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

    ${template?.showCustomer ? `
      <div class="customer-box" style="${getOffsetStyle('customerBox')}">
        <div>CUST: MOHAN REDDY</div>
        <div>PH  : 9876543210</div>
      </div>
    ` : ''}

    <div class="bill-type" style="${getOffsetStyle('billType')}">*** CASH BILL ***</div>

    <div class="meta-row" style="${getOffsetStyle('billNoDateRow')}">
      <span>Bill No : INV-0042</span>
      <span>Date : ${dateStr}</span>
    </div>
    <div class="meta-row" style="${getOffsetStyle('cashierTimeRow')}">
      ${template?.showCashier ? `<span>Cashier : ADMIN</span>` : `<span></span>`}
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

    ${template?.showCustomer ? `
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
      ${template?.condition1 ? `<div class="footer-condition">* ${template.condition1}</div>` : '<div class="footer-condition">* Weight checked at billing counter</div>'}
      ${template?.condition2 ? `<div class="footer-condition">* ${template.condition2}</div>` : '<div class="footer-condition">* Goods once sold cannot be returned</div>'}
      ${template?.condition3 ? `<div class="footer-condition">* ${template.condition3}</div>` : ''}
      ${template?.footerMsg1 ? `<div class="footer-condition" style="font-weight: 900; margin-top: 3px;">${template.footerMsg1}</div>` : ''}
      ${template?.footerMsg2 ? `<div class="footer-condition">${template.footerMsg2}</div>` : ''}
    </div>

    <div class="divider"></div>

    ${template?.upiId ? `
      <div style="margin: 6px 0; text-align: center; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 4px 0;">
        <div style="font-size: 10px; font-weight: 900; letter-spacing: 0.5px;">SCAN TO PAY (SAMPLE DELIVERY)</div>
        <div style="font-size: 13px; font-weight: 900; margin: 2px 0;">₹88.00</div>
        <div style="display: flex; justify-content: center; align-items: center; margin: 3px 0;">
          ${generateQrSvg(`upi://pay?pa=${encodeURIComponent(template.upiId)}&pn=${encodeURIComponent(template.upiPayeeName || shopName)}&am=88.00&cu=INR`, is58 ? 110 : 125)}
        </div>
        <div style="font-size: 9px; font-weight: 800;">UPI: ${template.upiId}</div>
      </div>
      <div class="divider"></div>
    ` : ''}

    <div style="font-size: ${Math.max(9, baseFontSizePx - 1)}px; font-weight: 700; line-height: 1.35; margin: 4px 0; background: #f4f4f4; padding: 4px; border: 1px dashed #000; box-sizing: border-box; width: 100%;">
      <div style="font-weight: 900; text-align: center; margin-bottom: 2px;">*** CALIBRATION INFO ***</div>
      <div style="display: flex; justify-content: space-between;"><span>Safe Width:</span><strong>${safeWidthMm} mm</strong></div>
      <div style="display: flex; justify-content: space-between;"><span>H-Offset  :</span><strong>${userOffsetMm} mm</strong></div>
      <div style="display: flex; justify-content: space-between;"><span>Paper Roll:</span><strong>${template?.paperWidth || '80mm'}</strong></div>
      <div style="display: flex; justify-content: space-between;"><span>Font / Sz :</span><strong>${chosenFont} (${fontSizeSetting})</strong></div>
    </div>

    <div class="cut-spacing"></div>
  </div>
</body>
</html>`;
}

export function printHtmlViaIframe(html: string): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.zIndex = '-9999';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      resolve();
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.warn('Iframe print error:', err);
      }
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch (e) {}
        resolve();
      }, 2000);
    }, 300);
  });
}

export function generateClientWidthCalibrationHTML(template?: any): string {
  const widths = [76, 72, 68, 64, 60, 56, 52];
  const chosenFont = template?.fontFamily || 'Consolas';
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


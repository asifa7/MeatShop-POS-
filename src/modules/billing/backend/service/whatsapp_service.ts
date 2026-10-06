import { invoiceRepository } from '../repository/invoice_repository';
import { invoiceItemsRepository } from '../repository/invoice_items_repository';
import { paymentsRepository } from '../repository/payments_repository';
import { configService } from '../../../../core/config/config_service';
import { db } from '../../../../core/backend/db';
import { logger } from '../../../../core/backend/logger';
import { baileysWhatsAppService } from '../../../../electron/baileys_whatsapp_service';
import { renderReceiptToImage } from '../../../../electron/receipt_image_generator';

export const whatsAppService = {
  /**
   * Generates a clean, professional WhatsApp text invoice formatted with bold headers and itemized details.
   */
  generateInvoiceWhatsAppText(invoiceId: number): string {
    const config = configService.get();
    const invoice = invoiceRepository.findById(invoiceId);
    if (!invoice) throw new Error(`Invoice #${invoiceId} not found`);

    const items = invoiceItemsRepository.findByInvoiceId(invoiceId);
    const payments = paymentsRepository.findByInvoiceId(invoiceId);
    const tmpl = config.receiptTemplate || {};

    const shopName = config.shopInfo?.name || 'ISHANTH PROTEINS-6';
    const shopAddress = [tmpl.addressLine1 || config.shopInfo?.address, tmpl.addressLine2, tmpl.city].filter(Boolean).join(', ');
    const shopPhone = tmpl.softwareMobileNo || config.shopInfo?.phone || '';

    const completedDate = invoice.completed_at ? new Date(invoice.completed_at) : new Date();
    const dd = String(completedDate.getDate()).padStart(2, '0');
    const mm = String(completedDate.getMonth() + 1).padStart(2, '0');
    const yyyy = completedDate.getFullYear();
    let hours = completedDate.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const timeStr = `${String(hours).padStart(2, '0')}:${String(completedDate.getMinutes()).padStart(2, '0')} ${ampm}`;
    const dateStr = `${dd}/${mm}/${yyyy} ${timeStr}`;

    const invNo = invoice.invoice_number ? invoice.invoice_number.split('_')[0] : `${invoice.id}`;

    let customerName = '';
    let customerPhone = '';
    let openingBalancePaise = 0;
    const itemsTotalPaise = items.reduce((sum, it) => sum + (it.line_total_paise || 0), 0);
    const effectiveTotalPaise = invoice.total_paise || itemsTotalPaise;
    const billAmountPaise = effectiveTotalPaise;
    let paidAmountPaise = 0;
    let closingBalancePaise = 0;

    if (invoice.customer_id) {
      try {
        const cust = db.prepare('SELECT name, phone, phone2, whatsapp FROM customers WHERE id = ?').get(invoice.customer_id) as any;
        if (cust) {
          customerName = (cust.name || '').trim().toUpperCase();
          customerPhone = (cust.whatsapp || cust.phone || cust.phone2 || '').trim();
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

    let itemsText = '';
    let totalQty = 0;
    items.forEach((item) => {
      const pName = (item.product_name || '').trim().toUpperCase();
      let qtyStr = '';
      if (item.unit_type === 'weight' && item.quantity_grams !== null) {
        const qtyKg = item.quantity_grams / 1000;
        totalQty += qtyKg;
        qtyStr = `${qtyKg.toFixed(3)} kg`;
      } else {
        const units = item.quantity_units || 1;
        totalQty += units;
        qtyStr = `${units} pcs`;
      }
      const rate = (item.rate_paise_snapshot / 100).toFixed(2);
      const amt = (item.line_total_paise / 100).toFixed(2);
      itemsText += `• *${pName}*\n  ${qtyStr} @ ₹${rate} = *₹${amt}*\n`;
    });

    const primaryPayment = payments.length > 0 ? payments[0].method.toUpperCase() : 'CASH';
    const totalAmount = (effectiveTotalPaise / 100).toFixed(2);

    let isDelivery = Boolean(invoice.print_delivery_token || (invoice as any).is_delivery);
    try {
      const deliveryRow = db.prepare('SELECT id, status FROM deliveries WHERE invoice_id = ? LIMIT 1').get(invoiceId) as any;
      if (deliveryRow) isDelivery = true;
    } catch (e) {}

    // Check for Holiday / Festival Greeting from calendar_events and template settings
    let festivalGreeting = '';
    try {
      if (tmpl.whatsAppAutoFestivalWishes !== false) {
        const todayMonthDay = `${mm}-${dd}`;
        const todayFull = `${yyyy}-${mm}-${dd}`;

        // 1. Check configured festival list in template
        const configuredFestivals = tmpl.festivalGreetings || [];
        const matchedFest = configuredFestivals.find((f: any) => {
          if (!f || f.enabled === false) return false;
          const fDate = (f.date || '').trim();
          return fDate === todayMonthDay || fDate === todayFull;
        });

        if (matchedFest && matchedFest.greeting) {
          festivalGreeting = matchedFest.greeting;
        } else {
          // 2. Fallback check from database calendar_events
          const eventRow = db.prepare('SELECT event_name FROM calendar_events WHERE event_date = ? LIMIT 1').get(todayFull) as { event_name: string } | undefined;
          if (eventRow && eventRow.event_name) {
            festivalGreeting = `🎉 Wishing you and your family a very Happy ${eventRow.event_name}! 🌟`;
          }
        }
      }
    } catch (festErr: any) {
      logger.warn('Failed checking festival greetings', { error: String(festErr) });
    }

    let text = `🧾 *${shopName}*\n`;
    if (festivalGreeting) {
      text += `✨ *${festivalGreeting}*\n`;
    }
    if (isDelivery) {
      text += `🛵 *Order Confirmed - Will deliver shortly!*\n`;
    }
    if (shopAddress) text += `📍 ${shopAddress}\n`;
    if (shopPhone) text += `📞 ${shopPhone}\n`;
    text += `--------------------------------\n`;
    text += `*Bill No:* ${invNo}\n`;
    text += `*Date:* ${dateStr}\n`;
    if (customerName) {
      text += `*Customer:* ${customerName}${customerPhone ? ` (${customerPhone})` : ''}\n`;
    }
    text += `--------------------------------\n`;
    text += `*ITEMS PURCHASED:*\n`;
    text += itemsText;
    text += `--------------------------------\n`;
    text += `*Total Items:* ${items.length} (Qty: ${totalQty % 1 === 0 ? totalQty : totalQty.toFixed(2)})\n`;
    text += `*Payment Mode:* ${primaryPayment}\n`;
    text += `--------------------------------\n`;
    text += `💰 *TOTAL AMOUNT TO BE PAID: ₹${totalAmount}*\n`;
    text += `--------------------------------\n`;

    // Payment reminder of outstanding balance only if there is outstanding due (> 0)
    if (invoice.customer_id && tmpl.billPrintClosingBalance !== false) {
      if (closingBalancePaise > 0) {
        text += `*Opening Balance:* ₹${(openingBalancePaise / 100).toFixed(2)}\n`;
        text += `*Bill Amount:* ₹${(billAmountPaise / 100).toFixed(2)}\n`;
        text += `*Paid Amount:* ₹${(paidAmountPaise / 100).toFixed(2)}\n`;
        text += `⚠️ *Outstanding Balance Due: ₹${(closingBalancePaise / 100).toFixed(2)}*\n`;
        text += `_Kindly clear the pending balance at your earliest convenience. Thank you!_\n`;
        text += `--------------------------------\n`;
      }
    }

    // Default Thank You / Custom Message Bar from Settings
    const defaultMsg = tmpl.whatsAppDefaultMessage || tmpl.footerMessage || 'Thank you for shopping with us! Visit again.';
    text += `${defaultMsg}\n`;
    if (tmpl.footerMsg1) text += `${tmpl.footerMsg1}\n`;

    return text;
  },

  /**
   * Generates a wa.me direct WhatsApp link with pre-filled encoded text.
   */
  generateWhatsAppUrl(phone: string, text: string): string {
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    // If Indian 10-digit number without country code, prepend 91
    if (cleanPhone.length === 10) {
      cleanPhone = `91${cleanPhone}`;
    }
    const encoded = encodeURIComponent(text);
    return `https://wa.me/${cleanPhone}?text=${encoded}`;
  },

  /**
   * Generates a concise WhatsApp caption based on the configurable template with variable placeholders:
   * {shopName}, {customerName}, {billNo}, {netAmount}, {date}
   * Followed by conditional outstanding balance reminder if balance > 0.
   */
  generateInvoiceWhatsAppCaption(invoiceId: number): string {
    const config = configService.get();
    const invoice = invoiceRepository.findById(invoiceId);
    if (!invoice) throw new Error(`Invoice #${invoiceId} not found`);

    const tmpl = config.receiptTemplate || {};
    const shopName = tmpl.shopName || config.shopInfo?.name || 'MEAT SHOP POS';
    const invNo = invoice.invoice_number ? invoice.invoice_number.split('_')[0] : `${invoice.id}`;
    const totalAmount = (invoice.total_paise / 100).toFixed(2);

    const completedDate = invoice.completed_at ? new Date(invoice.completed_at) : new Date();
    const dd = String(completedDate.getDate()).padStart(2, '0');
    const mm = String(completedDate.getMonth() + 1).padStart(2, '0');
    const yyyy = completedDate.getFullYear();
    const dateStr = `${dd}/${mm}/${yyyy}`;

    let customerName = 'Customer';
    let closingBalancePaise = 0;

    if (invoice.customer_id) {
      try {
        const cust = db.prepare('SELECT name, phone, phone2, whatsapp FROM customers WHERE id = ?').get(invoice.customer_id) as any;
        if (cust && cust.name) {
          customerName = cust.name.trim();
        }

        const ledgerRow = db.prepare(`
          SELECT COALESCE(SUM(debit_paise - credit_paise), 0) as balance_paise
          FROM customer_ledger
          WHERE customer_id = ?
        `).get(invoice.customer_id) as { balance_paise: number } | undefined;
        closingBalancePaise = ledgerRow ? ledgerRow.balance_paise : 0;
      } catch (e) {}
    }

    const defaultTmpl =
      "🧾 *{shopName}*\nDear *{customerName}*, greetings from {shopName}! 🙏\n\n📄 *Bill No:* {billNo}\n💰 *Bill Total:* ₹{netAmount}\n📅 *Date:* {date}\n\nAttached is your digital bill receipt. Thank you for choosing us! ✨";

    const tmplString = config.whatsAppConfig?.billCaptionTemplate || defaultTmpl;

    let text = tmplString
      .replace(/\{shopName\}/g, shopName)
      .replace(/\{customerName\}/g, customerName)
      .replace(/\{billNo\}/g, invNo)
      .replace(/\{netAmount\}/g, totalAmount)
      .replace(/\{date\}/g, dateStr);

    // Only mention outstanding balance if closingBalancePaise > 0!
    if (closingBalancePaise > 0) {
      const outstandingRupees = (closingBalancePaise / 100).toFixed(2);
      text += `\n\n⚠️ *Payment Reminder:*\nYour pending outstanding balance is *₹${outstandingRupees}*.\nKindly clear the pending amount at your convenience. 🙏`;
    }

    return text;
  },

  /**
   * Generates a separate delivery status message if "Mark as Delivery" was active on the bill.
   */
  generateDeliveryNoticeText(invoiceId: number): string {
    const ctx = this.extractInvoiceTemplateContext(invoiceId);
    if (!ctx) return '🛵 Your order is confirmed and will deliver shortly! 🙏';

    const config = configService.get();
    const defaultTmpl =
      "🛵 *Order Confirmed - Will deliver shortly!*\nDear *{customerName}*, your order (#{billNo}) is freshly prepared and out for delivery shortly. Thank you! 🙏";

    const tmplString = config.whatsAppConfig?.deliveryMessageTemplate || defaultTmpl;
    return this.interpolateTemplate(tmplString, ctx);
  },

  /**
   * Extracts all 18 invoice template variables from database and config for full variable interpolation.
   */
  extractInvoiceTemplateContext(invoiceIdOrData: number | any): Record<string, string> | null {
    let invoice: any;
    if (typeof invoiceIdOrData === 'number') {
      invoice = invoiceRepository.findById(invoiceIdOrData);
    } else if (invoiceIdOrData && invoiceIdOrData.invoice) {
      invoice = invoiceIdOrData.invoice;
    } else {
      invoice = invoiceIdOrData;
    }

    if (!invoice) return null;

    const invoiceId = invoice.id;
    const config = configService.get();
    const tmpl = config.receiptTemplate || {};
    const items = invoiceItemsRepository.findByInvoiceId(invoiceId) || [];
    const payments = paymentsRepository.findByInvoiceId(invoiceId) || [];

    const shopName = tmpl.shopName || config.shopInfo?.name || invoice.shop_name_snapshot || 'MEAT SHOP POS';
    const shopAddress = [tmpl.addressLine1 || config.shopInfo?.address, tmpl.addressLine2, tmpl.city].filter(Boolean).join(', ');
    const shopPhone = tmpl.softwareMobileNo || config.shopInfo?.phone || '';

    const completedDate = invoice.completed_at ? new Date(invoice.completed_at) : new Date();
    const dd = String(completedDate.getDate()).padStart(2, '0');
    const mm = String(completedDate.getMonth() + 1).padStart(2, '0');
    const yyyy = completedDate.getFullYear();
    let hours = completedDate.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const timeStr = `${String(hours).padStart(2, '0')}:${String(completedDate.getMinutes()).padStart(2, '0')} ${ampm}`;
    const dateStr = `${dd}/${mm}/${yyyy}`;
    const dateTimeStr = `${dateStr} ${timeStr}`;

    const invNo = invoice.invoice_number ? invoice.invoice_number.split('_')[0] : `${invoice.id}`;

    let customerName = '';
    let customerPhone = '';
    let openingBalancePaise = 0;
    const itemsTotalPaise = items.reduce((sum, it) => sum + (it.line_total_paise || 0), 0);
    const effectiveTotalPaise = invoice.total_paise || itemsTotalPaise;
    const billAmountPaise = effectiveTotalPaise;
    let paidAmountPaise = 0;
    let closingBalancePaise = 0;

    if (invoice.customer_id) {
      try {
        const cust = db.prepare('SELECT name, phone, phone2, whatsapp FROM customers WHERE id = ?').get(invoice.customer_id) as any;
        if (cust) {
          customerName = (cust.name || '').trim().toUpperCase();
          customerPhone = (cust.whatsapp || cust.phone || cust.phone2 || '').trim();
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

    const itemsLines: string[] = [];
    let totalQty = 0;
    items.forEach((item) => {
      const pName = (item.product_name || '').trim().toUpperCase();
      let qtyStr = '';
      if (item.unit_type === 'weight' && item.quantity_grams !== null) {
        const qtyKg = item.quantity_grams / 1000;
        totalQty += qtyKg;
        qtyStr = `${qtyKg.toFixed(3)} kg`;
      } else {
        const units = item.quantity_units || 1;
        totalQty += units;
        qtyStr = `${units} pcs`;
      }
      const rate = (item.rate_paise_snapshot / 100).toFixed(2);
      const amt = (item.line_total_paise / 100).toFixed(2);
      itemsLines.push(`• *${pName}* (${qtyStr} @ ₹${rate}) = ₹${amt}`);
    });

    const primaryPayment = payments.length > 0 ? payments[0].method.toUpperCase() : 'CASH';
    const netAmountStr = (effectiveTotalPaise / 100).toFixed(2);
    const paidAmountStr = (paidAmountPaise / 100).toFixed(2);
    const balanceAmountStr = (closingBalancePaise / 100).toFixed(2);
    const prevBalanceStr = (openingBalancePaise / 100).toFixed(2);
    const totalQtyStr = totalQty % 1 === 0 ? `${totalQty}` : totalQty.toFixed(2);

    let isDelivery = Boolean(invoice.print_delivery_token || (invoice as any).is_delivery);
    try {
      const deliveryRow = db.prepare('SELECT id, status FROM deliveries WHERE invoice_id = ? LIMIT 1').get(invoiceId) as any;
      if (deliveryRow) isDelivery = true;
    } catch (e) {}
    const deliveryStatusStr = isDelivery ? '🛵 Order Confirmed - Will deliver shortly!' : '';

    let festivalGreeting = '';
    try {
      const todayFull = `${yyyy}-${mm}-${dd}`;
      const eventRow = db.prepare('SELECT event_name FROM calendar_events WHERE event_date = ? LIMIT 1').get(todayFull) as { event_name: string } | undefined;
      if (eventRow && eventRow.event_name) {
        festivalGreeting = `🎉 Wishing you and your family a very Happy ${eventRow.event_name}! 🌟`;
      }
    } catch (e) {}

    if (!customerName || !customerName.trim()) {
      customerName = 'Customer';
    }

    return {
      shopName,
      shopPhone,
      shopAddress,
      customerName,
      customerPhone,
      billNo: invNo,
      netAmount: netAmountStr,
      paidAmount: paidAmountStr,
      balanceAmount: balanceAmountStr,
      previousBalance: prevBalanceStr,
      paymentMode: primaryPayment,
      date: dateStr,
      time: timeStr,
      dateTime: dateTimeStr,
      itemsCount: String(items.length),
      totalQty: totalQtyStr,
      itemsList: itemsLines.join('\n'),
      deliveryStatus: deliveryStatusStr,
      festivalGreeting,
    };
  },

  /**
   * Replaces all placeholders like {shopName}, {billNo}, {netAmount} in a template string,
   * with full case-insensitive matching and common synonyms/aliases.
   */
  interpolateTemplate(template: string, ctx: Record<string, string>): string {
    if (!template) return '';
    let result = template;

    const aliasMap: Record<string, string> = {
      // Shop
      shopname: ctx.shopName,
      shop_name: ctx.shopName,
      storename: ctx.shopName,
      store_name: ctx.shopName,
      shopphone: ctx.shopPhone,
      shop_phone: ctx.shopPhone,
      shopaddress: ctx.shopAddress,
      shop_address: ctx.shopAddress,
      address: ctx.shopAddress,

      // Customer
      customername: ctx.customerName,
      customer_name: ctx.customerName,
      customer: ctx.customerName,
      customerphone: ctx.customerPhone,
      customer_phone: ctx.customerPhone,
      phone: ctx.customerPhone,

      // Bill / Invoice
      billno: ctx.billNo,
      bill_no: ctx.billNo,
      invoiceno: ctx.billNo,
      invoice_no: ctx.billNo,
      billnumber: ctx.billNo,
      bill_number: ctx.billNo,

      // Amounts
      netamount: ctx.netAmount,
      net_amount: ctx.netAmount,
      total: ctx.netAmount,
      totalamount: ctx.netAmount,
      total_amount: ctx.netAmount,
      billamount: ctx.netAmount,
      amount: ctx.netAmount,

      paidamount: ctx.paidAmount,
      paid_amount: ctx.paidAmount,
      paid: ctx.paidAmount,

      balanceamount: ctx.balanceAmount,
      balance_amount: ctx.balanceAmount,
      balancedue: ctx.balanceAmount,
      balance_due: ctx.balanceAmount,
      balance: ctx.balanceAmount,
      due: ctx.balanceAmount,

      previousbalance: ctx.previousBalance,
      previous_balance: ctx.previousBalance,
      prev_balance: ctx.previousBalance,
      openingbalance: ctx.previousBalance,

      // Payment mode
      paymentmode: ctx.paymentMode,
      payment_mode: ctx.paymentMode,
      paymentmethod: ctx.paymentMode,
      payment_method: ctx.paymentMode,
      mode: ctx.paymentMode,

      // Date & Time
      date: ctx.date,
      time: ctx.time,
      datetime: ctx.dateTime,
      date_time: ctx.dateTime,

      // Items & Qty
      itemscount: ctx.itemsCount,
      items_count: ctx.itemsCount,
      totalqty: ctx.totalQty,
      total_qty: ctx.totalQty,
      qty: ctx.totalQty,
      itemslist: ctx.itemsList,
      items_list: ctx.itemsList,
      items: ctx.itemsList,

      // Delivery & Festival
      deliverystatus: ctx.deliveryStatus,
      delivery_status: ctx.deliveryStatus,
      festivalgreeting: ctx.festivalGreeting,
      festival_greeting: ctx.festivalGreeting,
      greeting: ctx.festivalGreeting,
    };

    // Replace canonical variables
    for (const [key, val] of Object.entries(ctx)) {
      const regex = new RegExp(`\\{${key}\\}`, 'gi');
      result = result.replace(regex, val ?? '');
    }

    // Replace aliases
    for (const [alias, val] of Object.entries(aliasMap)) {
      const regex = new RegExp(`\\{${alias}\\}`, 'gi');
      result = result.replace(regex, val ?? '');
    }

    // Clean up empty double asterisks e.g. ** from missing values
    result = result.replace(/\*\s*\*/g, '');

    return result.trim();
  },

  /**
   * Generates WhatsApp caption attached to the receipt image using the configured user template.
   */
  buildShortWhatsAppCaption(invoiceIdOrData: number | any): string {
    const ctx = this.extractInvoiceTemplateContext(invoiceIdOrData);
    if (!ctx) return 'Thank you for shopping with us! Visit again. ✨';

    const config = configService.get();
    const userTemplate = config.whatsAppConfig?.billCaptionTemplate?.trim();

    if (userTemplate) {
      return this.interpolateTemplate(userTemplate, ctx);
    }

    // Default clean caption
    return [
      `🧾 *${ctx.shopName}*`,
      `📄 *Bill No:* ${ctx.billNo}`,
      `📅 *Date:* ${ctx.date}`,
      `💰 *Total:* ₹${ctx.netAmount}`,
      ``,
      `Thank you for shopping with us! Visit again. ✨`,
    ].join('\n');
  },

  /**
   * Directly sends a single WhatsApp message containing the rendered receipt PNG image
   * with a short caption attached.
   */
  async sendInvoiceWhatsApp(
    invoiceId: number,
    customPhone?: string
  ): Promise<{ success: boolean; phone?: string; billText?: string; messageId?: string; failureReason?: string }> {
    try {
      const invoice = invoiceRepository.findById(invoiceId);
      if (!invoice) throw new Error('Invoice not found');

      let targetPhone = customPhone?.trim() || '';
      if (!targetPhone && invoice.customer_id) {
        const cust = db.prepare('SELECT phone, phone2, whatsapp FROM customers WHERE id = ?').get(invoice.customer_id) as any;
        if (cust) {
          targetPhone = (cust.whatsapp || cust.phone || cust.phone2 || '').trim();
        }
      }

      if (!targetPhone) {
        return {
          success: false,
          failureReason: 'No phone number found for this customer or invoice. Please enter a valid mobile number.',
        };
      }

      let cleanRecipient = targetPhone.replace(/[^0-9]/g, '');
      if (cleanRecipient.length === 10) cleanRecipient = `91${cleanRecipient}`;

      // 1. Render the receipt image buffer. Automatic bill delivery must remain
      // image-only so a render failure cannot silently send a different text
      // invoice and bypass the user's saved caption template.
      let imageBuffer: Buffer | null = null;
      try {
        logger.info(`[WhatsApp Service] Rendering receipt image for invoice #${invoiceId}...`);
        imageBuffer = await renderReceiptToImage(invoiceId);
      } catch (renderErr: any) {
        const reason = renderErr?.message || String(renderErr);
        logger.error(`[WhatsApp Service] Image rendering failed for invoice #${invoiceId}; no text fallback will be sent`, {
          error: reason,
        });
        invoiceRepository.updateWhatsAppDeliveryStatus(invoiceId, 'not_delivered');
        return {
          success: false,
          failureReason: `Could not generate the bill image: ${reason}`,
        };
      }

      if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
        const reason = 'Receipt image generation returned an empty image';
        logger.error(`[WhatsApp Service] ${reason} for invoice #${invoiceId}; no text fallback will be sent`);
        invoiceRepository.updateWhatsAppDeliveryStatus(invoiceId, 'not_delivered');
        return {
          success: false,
          failureReason: reason,
        };
      }

      // 2. Build the configured caption and send exactly one image message.
      const caption = this.buildShortWhatsAppCaption(invoiceId);
      logger.info(`[WhatsApp Service] Using saved bill caption template for invoice #${invoiceId}`, {
        captionLength: caption.length,
      });
      logger.info(`[WhatsApp Service] Dispatching receipt image for +${cleanRecipient} (invoice #${invoiceId})...`);
      const dispatchResult = await baileysWhatsAppService.sendBillWhatsApp(cleanRecipient, {
        image: imageBuffer,
        caption,
      });

      if (dispatchResult.success) {
        invoiceRepository.updateWhatsAppDeliveryStatus(invoiceId, 'sent');
        return {
          success: true,
          phone: cleanRecipient,
          billText: caption,
          messageId: dispatchResult.messageId,
        };
      } else {
        invoiceRepository.updateWhatsAppDeliveryStatus(invoiceId, 'not_delivered');
        return {
          success: false,
          phone: cleanRecipient,
          billText: caption,
          failureReason: dispatchResult.error || 'Failed to dispatch via WhatsApp',
        };
      }
    } catch (err: any) {
      logger.error('Failed to send invoice via WhatsApp', { error: err });
      return { success: false, failureReason: err.message };
    }
  },
};

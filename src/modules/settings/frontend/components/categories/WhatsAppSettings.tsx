import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  RefreshCw,
  Send,
  RotateCcw,
  Sparkles,
  Check,
  AlertCircle,
  QrCode,
  ShieldCheck,
  LogOut,
  CheckCircle2,
  Copy,
  Smartphone,
  Bold,
  Italic,
  List,
  Smile,
  Save,
  Wand2,
  Sliders,
  CheckSquare,
  Square,
  FileText,
  Image,
} from 'lucide-react';
import { SettingCard } from '../ui/SettingCard';
import { TextAreaField } from '../ui/TextAreaField';
import { useSettingsDraftStore } from '../../hooks/useSettingsDraftStore';
import { IPC_CHANNELS } from '../../../../../core/ipc/channels';

export const DEFAULT_BILL_TEMPLATE =
  "🧾 *{shopName}*\nDear *{customerName}*, greetings from {shopName}! 🙏\n\n📌 *Bill No:* {billNo}\n💰 *Bill Total:* ₹{netAmount}\n📅 *Date:* {date}\n\nAttached is your digital bill receipt. Thank you for choosing us! ✨";

export const DEFAULT_DELIVERY_TEMPLATE =
  "🛵 *Order Confirmed - Will deliver shortly!*\nDear *{customerName}*, your order (#{billNo}) is freshly prepared and out for delivery shortly. Thank you! 🙏";

export interface TemplatePreset {
  id: string;
  name: string;
  badge: string;
  desc: string;
  template: string;
}

export const BILL_PRESETS: TemplatePreset[] = [
  {
    id: 'standard',
    name: 'Standard Receipt',
    badge: 'Popular',
    desc: 'Shop name, customer greeting, bill no, date, total amount and thank you',
    template:
      "🧾 *{shopName}*\nDear *{customerName}*, greetings from {shopName}! 🙏\n\n📌 *Bill No:* {billNo}\n💰 *Bill Total:* ₹{netAmount}\n📅 *Date:* {date} {time}\n\nAttached is your digital bill receipt. Thank you for choosing us! ✨",
  },
  {
    id: 'itemized',
    name: 'Itemized (With Items)',
    badge: 'Detailed',
    desc: 'Includes itemized bulleted list of all items, quantities, and rates',
    template:
      "🧾 *{shopName}*\nDear *{customerName}*, here is your bill receipt: 🙏\n\n📄 *Bill No:* {billNo} | 📅 *Date:* {date}\n\n📋 *Items Purchased:*\n{itemsList}\n\n💰 *Total Amount:* ₹{netAmount}\n💳 *Payment Mode:* {paymentMode}\n\nThank you for choosing us! Visit again. ✨",
  },
  {
    id: 'ledger',
    name: 'Balance & Ledger Due',
    badge: 'Accounts',
    desc: 'Includes bill amount, paid amount, and current closing balance due',
    template:
      "🧾 *{shopName}*\nCustomer: *{customerName}*\n📌 *Bill No:* {billNo} (Date: {date})\n\n💰 *Bill Total:* ₹{netAmount}\n💵 *Paid Amount:* ₹{paidAmount} ({paymentMode})\n⚠️ *Balance Due:* ₹{balanceAmount}\n\nAttached is your bill receipt. Thank you! ✨",
  },
  {
    id: 'minimal',
    name: 'Clean & Minimal',
    badge: 'Short',
    desc: 'Compact message with bill number, total amount, and receipt image',
    template:
      "🧾 *{shopName}* — Bill #{billNo}\n💰 *Total:* ₹{netAmount} | 📅 *Date:* {date}\nThank you for choosing us! Attached is your bill receipt. 🙏",
  },
];

export const DELIVERY_PRESETS: TemplatePreset[] = [
  {
    id: 'standard_del',
    name: 'Standard Notice',
    badge: 'Default',
    desc: 'Order confirmed and out for delivery',
    template:
      "🛵 *Order Confirmed - Will deliver shortly!*\nDear *{customerName}*, your order (#{billNo}) is freshly prepared and out for delivery shortly. Thank you! 🙏",
  },
  {
    id: 'detailed_del',
    name: 'Detailed Notice with Total',
    badge: 'Detailed',
    desc: 'Includes bill total and store contact phone',
    template:
      "🛵 *Order Out for Delivery!*\nDear *{customerName}*, your order (#{billNo}) of *₹{netAmount}* is on its way to you.\n\n📞 For questions, call us at {shopPhone}.\nThank you from *{shopName}*! 🙏",
  },
  {
    id: 'minimal_del',
    name: 'Quick Confirmation',
    badge: 'Short',
    desc: 'Compact delivery dispatch notice',
    template:
      "🛵 *{shopName}:* Order #{billNo} confirmed for *{customerName}*. On its way! 🙏",
  },
];

export const BILL_BLOCKS = [
  { id: 'header', label: 'Shop Header', snippet: '🧾 *{shopName}*' },
  { id: 'greeting', label: 'Customer Greeting', snippet: 'Dear *{customerName}*, greetings from {shopName}! 🙏' },
  { id: 'bill_no', label: 'Bill Number', snippet: '📌 *Bill No:* {billNo}' },
  { id: 'date_time', label: 'Date & Time', snippet: '📅 *Date:* {date} {time}' },
  { id: 'total', label: 'Bill Total', snippet: '💰 *Bill Total:* ₹{netAmount}' },
  { id: 'payment', label: 'Paid & Mode', snippet: '💳 *Paid:* ₹{paidAmount} via {paymentMode}' },
  { id: 'balance', label: 'Balance Due', snippet: '⚠️ *Balance Due:* ₹{balanceAmount}' },
  { id: 'items', label: 'Items List', snippet: '📋 *Items Purchased:*\n{itemsList}' },
  { id: 'festival', label: 'Festival Greeting (if holiday)', snippet: '{festivalGreeting}' },
  { id: 'thanks', label: 'Thank You Message', snippet: 'Attached is your digital bill receipt. Thank you for choosing us! ✨' },
];

export const AVAILABLE_VARIABLES = [
  { tag: '{shopName}', label: 'Shop Name', desc: 'Business/shop name' },
  { tag: '{shopPhone}', label: 'Shop Phone', desc: 'Shop contact number' },
  { tag: '{shopAddress}', label: 'Shop Address', desc: 'Full business address' },
  { tag: '{customerName}', label: 'Customer Name', desc: 'Customer full name' },
  { tag: '{customerPhone}', label: 'Customer Phone', desc: 'Customer mobile number' },
  { tag: '{billNo}', label: 'Bill No', desc: 'Invoice / bill serial number' },
  { tag: '{netAmount}', label: 'Total Amount (₹)', desc: 'Net bill amount in rupees' },
  { tag: '{paidAmount}', label: 'Paid Amount (₹)', desc: 'Amount paid by customer' },
  { tag: '{balanceAmount}', label: 'Balance Due (₹)', desc: 'Closing outstanding due' },
  { tag: '{previousBalance}', label: 'Opening Bal (₹)', desc: 'Previous outstanding balance' },
  { tag: '{paymentMode}', label: 'Payment Mode', desc: 'Cash / UPI / Card / Credit' },
  { tag: '{date}', label: 'Date', desc: 'Date of bill (DD/MM/YYYY)' },
  { tag: '{time}', label: 'Time', desc: 'Time of bill (e.g. 02:45 PM)' },
  { tag: '{dateTime}', label: 'Date & Time', desc: 'Full date and time' },
  { tag: '{itemsCount}', label: 'Items Count', desc: 'Number of distinct items' },
  { tag: '{totalQty}', label: 'Total Qty', desc: 'Total weight or pieces' },
  { tag: '{itemsList}', label: 'Items List', desc: 'Itemized bulleted list' },
  { tag: '{deliveryStatus}', label: 'Delivery Status', desc: 'Delivery confirmation note' },
  { tag: '{festivalGreeting}', label: 'Festival Wish', desc: 'Active festival/holiday greeting' },
];

export const WhatsAppSettings: React.FC = () => {
  const { draftConfig, updateDraftConfig } = useSettingsDraftStore();
  const cfg = draftConfig.whatsAppConfig || {};

  const currentBillTemplate = cfg.billCaptionTemplate ?? DEFAULT_BILL_TEMPLATE;
  const currentDeliveryTemplate = cfg.deliveryMessageTemplate ?? DEFAULT_DELIVERY_TEMPLATE;

  const [waStatus, setWaStatus] = useState<{
    status: 'connected' | 'connecting' | 'disconnected';
    qrCodeDataUrl: string | null;
    userJid?: string;
    phone?: string;
    hasSavedSession?: boolean;
  }>({
    status: 'connecting',
    qrCodeDataUrl: null,
  });
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Pairing Mode: 'qr' | 'phone'
  const [pairingMethod, setPairingMethod] = useState<'qr' | 'phone'>('qr');
  const [pairingPhoneInput, setPairingPhoneInput] = useState('');
  const [isRequestingPairingCode, setIsRequestingPairingCode] = useState(false);
  const [pairingCodeResult, setPairingCodeResult] = useState<string | null>(null);
  const [pairingCodeError, setPairingCodeError] = useState<string | null>(null);
  const [hasCopiedCode, setHasCopiedCode] = useState(false);

  const [testPhone, setTestPhone] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchStatus = async () => {
      try {
        const raw = await window.api.invoke(IPC_CHANNELS.WHATSAPP.GET_STATUS);
        const res = raw?.data ?? raw;
        if (isMounted && res && res.status) {
          setWaStatus(res);
        }
      } catch (err) {
        console.error('Failed to get WhatsApp status:', err);
      }
    };

    fetchStatus();

    const unsubStatus = window.api?.on
      ? window.api.on(
          IPC_CHANNELS.WHATSAPP.STATUS_UPDATE,
          (raw: any) => {
            const statusData = raw?.data ?? raw;
            if (isMounted && statusData && statusData.status) {
              setWaStatus((prev) => ({ ...prev, ...statusData }));
            }
          }
        )
      : undefined;

    const unsubQr = window.api?.on
      ? window.api.on(
          IPC_CHANNELS.WHATSAPP.QR_UPDATE,
          (raw: any) => {
            const qrData = raw?.data ?? raw;
            if (isMounted && qrData) {
              setWaStatus((prev) => ({
                ...prev,
                qrCodeDataUrl: qrData.qrCodeDataUrl,
                status: qrData.qrCodeDataUrl ? 'connecting' : prev.status,
              }));
            }
          }
        )
      : undefined;

    return () => {
      isMounted = false;
      if (unsubStatus) unsubStatus();
      if (unsubQr) unsubQr();
    };
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await window.api.invoke(IPC_CHANNELS.WHATSAPP.LOGOUT);
      setWaStatus({
        status: 'connecting',
        qrCodeDataUrl: null,
      });
    } catch (e) {
      console.error('Logout failed:', e);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleRefreshStatus = async () => {
    setIsRefreshing(true);
    setPairingCodeResult(null);
    setPairingCodeError(null);
    try {
      const raw = await window.api.invoke(IPC_CHANNELS.WHATSAPP.FORCE_RECONNECT);
      const res = raw?.data ?? raw;
      if (res && res.status) setWaStatus(res);
    } catch (e) {
      console.error('Failed to reconnect WhatsApp:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRequestPairingCode = async () => {
    const clean = pairingPhoneInput.replace(/\D/g, '');
    if (clean.length < 10) {
      setPairingCodeError('Please enter a valid 10-digit mobile number');
      return;
    }
    const fullPhone = clean.length === 10 ? `91${clean}` : clean;
    setIsRequestingPairingCode(true);
    setPairingCodeError(null);
    setPairingCodeResult(null);

    try {
      const raw = await window.api.invoke(IPC_CHANNELS.WHATSAPP.REQUEST_PAIRING_CODE, { phone: fullPhone });
      const res = raw?.data ?? raw;
      if (res && res.success && res.code) {
        setPairingCodeResult(res.code);
      } else {
        setPairingCodeError(res?.error || 'Failed to request pairing code from WhatsApp');
      }
    } catch (err: any) {
      setPairingCodeError(err?.message || 'Error requesting pairing code');
    } finally {
      setIsRequestingPairingCode(false);
    }
  };

  const handleCopyPairingCode = () => {
    if (pairingCodeResult) {
      const cleanCode = pairingCodeResult.replace(/[^A-Za-z0-9]/g, '');
      navigator.clipboard.writeText(cleanCode);
      setHasCopiedCode(true);
      setTimeout(() => setHasCopiedCode(false), 2500);
    }
  };

  const handleSendTestMessage = async () => {
    const clean = testPhone.replace(/[^0-9]/g, '');
    if (clean.length < 10) {
      setTestFeedback({ type: 'error', text: 'Please enter a valid 10-digit mobile number' });
      return;
    }
    const fullPhone = clean.length === 10 ? `91${clean}` : clean;
    setIsTesting(true);
    setTestFeedback(null);
    try {
      const raw = await window.api.invoke(IPC_CHANNELS.WHATSAPP.SEND_MESSAGE, {
        phone: fullPhone,
        message: 'Hi! This is a test message from POS software. WhatsApp connectivity is working successfully! 👍',
      });
      const res = raw?.data ?? raw;
      if (res && res.success) {
        setTestFeedback({
          type: 'success',
          text: `✓ Delivered via Baileys! (Message ID: ${res.messageId || 'confirmed'}) to +${fullPhone}`,
        });
      } else {
        setTestFeedback({
          type: 'error',
          text: `Failed: ${res?.failureReason || 'Could not send test message'}`,
        });
      }
    } catch (err: any) {
      setTestFeedback({ type: 'error', text: `Error: ${err?.message || 'Send failed'}` });
    } finally {
      setIsTesting(false);
    }
  };

  const billTextareaRef = useRef<HTMLTextAreaElement>(null);
  const deliveryTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [autoBoldVars, setAutoBoldVars] = useState<boolean>(true);
  const [activeBuilderTab, setActiveBuilderTab] = useState<'presets' | 'blocks' | 'editor'>('presets');
  const [selectedBlocks, setSelectedBlocks] = useState<string[]>([
    'header',
    'greeting',
    'bill_no',
    'date_time',
    'total',
    'thanks',
  ]);
  const [isSavingDirectly, setIsSavingDirectly] = useState<'bill' | 'delivery' | null>(null);
  const [directSaveSuccess, setDirectSaveSuccess] = useState<'bill' | 'delivery' | null>(null);

  const insertTextAtCursor = (
    ref: React.RefObject<HTMLTextAreaElement>,
    currentText: string,
    textToInsert: string,
    updater: (newText: string) => void
  ) => {
    const el = ref.current;
    if (!el) {
      updater(`${currentText}${currentText.endsWith('\n') || !currentText ? '' : '\n'}${textToInsert}`);
      return;
    }

    const start = el.selectionStart ?? currentText.length;
    const end = el.selectionEnd ?? currentText.length;
    const before = currentText.substring(0, start);
    const after = currentText.substring(end);
    const next = `${before}${textToInsert}${after}`;
    updater(next);

    setTimeout(() => {
      el.focus();
      const pos = start + textToInsert.length;
      el.setSelectionRange(pos, pos);
    }, 10);
  };

  const wrapSelectionWithMarker = (
    ref: React.RefObject<HTMLTextAreaElement>,
    currentText: string,
    marker: string,
    updater: (newText: string) => void
  ) => {
    const el = ref.current;
    if (!el) return;

    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;

    if (start === end) {
      const placeholder = 'text';
      const insertion = `${marker}${placeholder}${marker}`;
      const next = `${currentText.substring(0, start)}${insertion}${currentText.substring(end)}`;
      updater(next);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + marker.length, start + marker.length + placeholder.length);
      }, 10);
      return;
    }

    const selected = currentText.substring(start, end);
    if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2) {
      const unwrapped = selected.slice(marker.length, -marker.length);
      const next = `${currentText.substring(0, start)}${unwrapped}${currentText.substring(end)}`;
      updater(next);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start, start + unwrapped.length);
      }, 10);
      return;
    }

    const wrapped = `${marker}${selected}${marker}`;
    const next = `${currentText.substring(0, start)}${wrapped}${currentText.substring(end)}`;
    updater(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + marker.length, end + marker.length);
    }, 10);
  };

  const handleInsertVariable = (target: 'bill' | 'delivery', tag: string) => {
    const ref = target === 'bill' ? billTextareaRef : deliveryTextareaRef;
    const current = target === 'bill' ? currentBillTemplate : currentDeliveryTemplate;
    const toInsert = autoBoldVars ? `*${tag}*` : tag;

    insertTextAtCursor(ref, current, toInsert, (val) => {
      updateDraftConfig((prev) => ({
        ...prev,
        whatsAppConfig: {
          ...(prev.whatsAppConfig || {}),
          [target === 'bill' ? 'billCaptionTemplate' : 'deliveryMessageTemplate']: val,
        },
      }));
    });
  };

  const handleApplyPreset = (target: 'bill' | 'delivery', tmplText: string) => {
    updateDraftConfig((prev) => ({
      ...prev,
      whatsAppConfig: {
        ...(prev.whatsAppConfig || {}),
        [target === 'bill' ? 'billCaptionTemplate' : 'deliveryMessageTemplate']: tmplText,
      },
    }));
  };

  const handleApplyBlocks = () => {
    const blocks: string[] = [];
    if (selectedBlocks.includes('header')) blocks.push('🧾 *{shopName}*');
    if (selectedBlocks.includes('greeting')) blocks.push('Dear *{customerName}*, greetings from {shopName}! 🙏');

    const details: string[] = [];
    if (selectedBlocks.includes('bill_no')) details.push('📌 *Bill No:* {billNo}');
    if (selectedBlocks.includes('date_time')) details.push('📅 *Date:* {date} {time}');
    if (selectedBlocks.includes('total')) details.push('💰 *Bill Total:* ₹{netAmount}');
    if (selectedBlocks.includes('payment')) details.push('💳 *Paid:* ₹{paidAmount} via {paymentMode}');
    if (selectedBlocks.includes('balance')) details.push('⚠️ *Balance Due:* ₹{balanceAmount}');
    if (details.length > 0) blocks.push(details.join('\n'));

    if (selectedBlocks.includes('items')) blocks.push('📋 *Items Purchased:*\n{itemsList}');
    if (selectedBlocks.includes('festival')) blocks.push('{festivalGreeting}');
    if (selectedBlocks.includes('thanks')) blocks.push('Attached is your digital bill receipt. Thank you for choosing us! ✨');

    const assembled = blocks.join('\n\n');
    updateDraftConfig((prev) => ({
      ...prev,
      whatsAppConfig: {
        ...(prev.whatsAppConfig || {}),
        billCaptionTemplate: assembled,
      },
    }));
  };

  const handleSaveDirectly = async (section: 'bill' | 'delivery') => {
    setIsSavingDirectly(section);
    try {
      const state = useSettingsDraftStore.getState();
      const currentConfig = state.draftConfig;
      const nextWhatsAppConfig = {
        ...(currentConfig.whatsAppConfig || {}),
        billCaptionTemplate: currentBillTemplate,
        deliveryMessageTemplate: currentDeliveryTemplate,
      };

      const res = await window.api.invoke(IPC_CHANNELS.CONFIG.UPDATE, {
        ...currentConfig,
        whatsAppConfig: nextWhatsAppConfig,
      });

      if (res?.success || res?.data) {
        state.setSaveStatus('saved');
        setDirectSaveSuccess(section);
        setTimeout(() => setDirectSaveSuccess(null), 3000);
      }
    } catch (e) {
      console.error('Failed to directly save WhatsApp template:', e);
    } finally {
      setIsSavingDirectly(null);
    }
  };

  const handleResetDefaults = () => {
    updateDraftConfig((prev) => ({
      ...prev,
      whatsAppConfig: {
        ...(prev.whatsAppConfig || {}),
        maxRetries: 3,
        retryBackoffSeconds: 30,
        billCaptionTemplate: DEFAULT_BILL_TEMPLATE,
        deliveryMessageTemplate: DEFAULT_DELIVERY_TEMPLATE,
      },
    }));
  };

  // Sample live preview interpolation with full variables
  const sampleShop = draftConfig.shopInfo?.name || 'ISHANTH PROTEINS-6';
  const sampleItemsList = [
    '• *CHICKEN CURRY CUT* (1.250 kg @ ₹240.00) = ₹300.00',
    '• *CHICKEN BONELESS* (0.500 kg @ ₹380.00) = ₹190.00',
    '• *COUNTRY EGGS* (12 pcs @ ₹8.00) = ₹96.00',
  ].join('\n');

  const previewBillText = (currentBillTemplate || '')
    .replace(/\{shopName\}|\{shop_name\}/gi, sampleShop)
    .replace(/\{shopPhone\}|\{shop_phone\}/gi, draftConfig.shopInfo?.phone || '+91 9876543210')
    .replace(/\{shopAddress\}|\{shop_address\}/gi, draftConfig.shopInfo?.address || '123 Main Bazaar, Chennai')
    .replace(/\{customerName\}|\{customer_name\}|\{customer\}/gi, 'RAJESH KUMAR')
    .replace(/\{customerPhone\}|\{customer_phone\}/gi, '+91 9876543210')
    .replace(/\{billNo\}|\{bill_no\}/gi, 'INV-1042')
    .replace(/\{netAmount\}|\{net_amount\}|\{total\}/gi, '586.00')
    .replace(/\{paidAmount\}|\{paid_amount\}|\{paid\}/gi, '586.00')
    .replace(/\{balanceAmount\}|\{balance_amount\}|\{balance\}/gi, '0.00')
    .replace(/\{previousBalance\}|\{previous_balance\}/gi, '0.00')
    .replace(/\{paymentMode\}|\{payment_mode\}/gi, 'UPI (GPay)')
    .replace(/\{date\}/gi, '02/10/2026')
    .replace(/\{time\}/gi, '02:30 PM')
    .replace(/\{dateTime\}|\{date_time\}/gi, '02/10/2026 02:30 PM')
    .replace(/\{itemsCount\}|\{items_count\}/gi, '3')
    .replace(/\{totalQty\}|\{total_qty\}/gi, '1.75 kg')
    .replace(/\{itemsList\}|\{items_list\}/gi, sampleItemsList)
    .replace(/\{deliveryStatus\}|\{delivery_status\}/gi, '🛵 Order Confirmed - Will deliver shortly!')
    .replace(/\{festivalGreeting\}|\{festival_greeting\}/gi, '🎉 Happy Gandhi Jayanti! 🌟');

  const previewDeliveryText = (currentDeliveryTemplate || '')
    .replace(/\{shopName\}|\{shop_name\}/gi, sampleShop)
    .replace(/\{customerName\}|\{customer_name\}|\{customer\}/gi, 'RAJESH KUMAR')
    .replace(/\{billNo\}|\{bill_no\}/gi, 'INV-1042')
    .replace(/\{netAmount\}|\{net_amount\}|\{total\}/gi, '586.00')
    .replace(/\{shopPhone\}|\{shop_phone\}/gi, draftConfig.shopInfo?.phone || '+91 9876543210');

  const renderWhatsAppFormatted = (raw: string) => {
    const lines = (raw || '').split('\n');
    return (
      <div className="space-y-1 font-sans text-xs">
        {lines.map((line, lineIdx) => {
          if (!line.trim()) {
            return <div key={lineIdx} className="h-2" />;
          }
          const parts = line.split(/(\*[^*]+\*|_[^_]+_|~[^~]+~)/g);
          return (
            <div key={lineIdx} className="leading-relaxed">
              {parts.map((part, pIdx) => {
                if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
                  return (
                    <strong key={pIdx} className="font-bold text-zinc-950 dark:text-white">
                      {part.slice(1, -1)}
                    </strong>
                  );
                }
                if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
                  return (
                    <em key={pIdx} className="italic text-zinc-800 dark:text-zinc-200">
                      {part.slice(1, -1)}
                    </em>
                  );
                }
                if (part.startsWith('~') && part.endsWith('~') && part.length > 2) {
                  return (
                    <span key={pIdx} className="line-through opacity-75">
                      {part.slice(1, -1)}
                    </span>
                  );
                }
                return <span key={pIdx}>{part}</span>;
              })}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-3xl pb-10">
      {/* WhatsApp Device Connection */}
      <SettingCard
        title="WhatsApp Device Connection"
        description="Pair your mobile phone once to enable 100% background, zero-click bill sending without browser popups"
        icon={<ShieldCheck size={16} className={waStatus.status === 'connected' ? 'text-emerald-500' : 'text-amber-500'} />}
        headerAction={
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase ${
                waStatus.status === 'connected'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30'
                  : waStatus.status === 'connecting'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30 animate-pulse'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300 border border-rose-300 dark:border-rose-500/30'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  waStatus.status === 'connected'
                    ? 'bg-emerald-600 dark:bg-emerald-400'
                    : waStatus.status === 'connecting'
                    ? 'bg-amber-600 dark:bg-amber-400'
                    : 'bg-rose-600 dark:bg-rose-400'
                }`}
              />
              {waStatus.status === 'connected'
                ? `Connected (${waStatus.phone || 'Ready'})`
                : waStatus.status === 'connecting'
                ? 'Pairing / Connecting'
                : 'Disconnected'}
            </span>
          </div>
        }
      >
        {waStatus.status === 'connected' ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-500/30 rounded-2xl shadow-xs">
              <div className="flex items-center gap-3.5">
                <div className="p-3 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 rounded-xl shrink-0">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <div className="text-sm font-bold text-emerald-950 dark:text-white flex items-center gap-2">
                    <span>Background Dispatcher Active</span>
                    {waStatus.phone && (
                      <span className="text-xs px-2 py-0.5 bg-emerald-200/90 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-300 rounded font-mono font-bold border border-emerald-300 dark:border-emerald-500/30">
                        {waStatus.phone}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-emerald-900/90 dark:text-zinc-300 mt-1 leading-relaxed">
                    Connected to WhatsApp servers. When sales are completed, thermal receipt images and messages dispatch instantly in the background with zero clicks, no browser popups, and no manual confirmations.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="px-3.5 py-2 bg-white dark:bg-zinc-800 hover:bg-rose-50 dark:hover:bg-rose-950/60 text-zinc-700 hover:text-rose-700 dark:text-zinc-300 dark:hover:text-rose-200 border border-zinc-300 hover:border-rose-400 dark:border-zinc-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 shadow-xs"
              >
                <LogOut size={13} />
                <span>{isLoggingOut ? 'Unlinking...' : 'Unlink Device'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Pairing Method Switcher */}
            <div className="flex items-center gap-2 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 w-fit">
              <button
                type="button"
                onClick={() => setPairingMethod('qr')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  pairingMethod === 'qr'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <QrCode size={13} />
                <span>Scan QR Code</span>
              </button>
              <button
                type="button"
                onClick={() => setPairingMethod('phone')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  pairingMethod === 'phone'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <Smartphone size={13} />
                <span>Link with Mobile Number</span>
              </button>
            </div>

            {pairingMethod === 'qr' ? (
              /* QR Code Method */
              <div className="flex flex-col md:flex-row items-center gap-6 p-5 bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
                {waStatus.qrCodeDataUrl ? (
                  <div className="relative group shrink-0 flex flex-col items-center">
                    <img
                      src={waStatus.qrCodeDataUrl}
                      alt="WhatsApp Pairing QR Code"
                      className="w-56 h-56 rounded-xl bg-white p-2.5 shadow-xl border border-zinc-300 dark:border-zinc-700"
                    />
                    <span className="mt-2 text-[10px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                      Scan with WhatsApp
                    </span>
                  </div>
                ) : (
                  <div className="w-56 h-56 rounded-xl bg-white dark:bg-zinc-950 flex flex-col items-center justify-center p-4 border border-zinc-200 dark:border-zinc-800 text-center shrink-0 shadow-xs">
                    <RefreshCw size={28} className="text-emerald-500 animate-spin mb-3" />
                    <span className="text-xs text-zinc-900 dark:text-zinc-100 font-bold mb-1">
                      {waStatus.hasSavedSession
                        ? 'Restoring Saved WhatsApp Session...'
                        : 'Connecting to WhatsApp...'}
                    </span>
                    <span className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">
                      {waStatus.hasSavedSession
                        ? 'Reconnecting using saved credentials. QR scan not required.'
                        : 'Requesting pairing QR code from WhatsApp servers...'}
                    </span>
                  </div>
                )}

                <div className="space-y-3.5 flex-1 text-left">
                  <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <QrCode size={14} />
                    <span>One-Time Pairing Instructions</span>
                  </div>
                  <ol className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300 list-decimal list-inside leading-relaxed font-medium">
                    <li>Open <strong>WhatsApp</strong> on your phone</li>
                    <li>Tap <strong>Settings</strong> (or the <strong>⋮</strong> menu on Android) &gt; <strong>Linked Devices</strong></li>
                    <li>Tap <strong>Link a Device</strong> and point your camera at this QR code</li>
                    <li>Once paired, credentials persist safely. You won&apos;t need to scan again!</li>
                  </ol>

                  <div className="pt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleRefreshStatus}
                      disabled={isRefreshing}
                      className="px-3.5 py-1.5 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border border-zinc-300 dark:border-zinc-700 shadow-xs disabled:opacity-50"
                    >
                      <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
                      <span>{isRefreshing ? 'Reconnecting...' : (waStatus.hasSavedSession ? 'Reconnect Now' : 'Refresh Code')}</span>
                    </button>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {waStatus.hasSavedSession ? 'Click to re-establish the connection using your saved session.' : 'Click to force a live reconnect if QR is taking time.'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* Mobile Phone Pairing Code Method */
              <div className="p-5 bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-4">
                <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Smartphone size={14} />
                  <span>Pair with Phone Number (No Camera Needed)</span>
                </div>

                <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  Enter your mobile number to generate an official 8-character pairing code. You can type this code in WhatsApp on your phone under <strong>Linked Devices &gt; Link with phone number instead</strong>.
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 max-w-md">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-2.5 text-xs font-bold text-zinc-500 select-none">
                      +91
                    </span>
                    <input
                      type="tel"
                      value={pairingPhoneInput}
                      onChange={(e) => setPairingPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="9876543210"
                      maxLength={10}
                      className="w-full pl-10 pr-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-xl text-xs font-mono text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleRequestPairingCode}
                    disabled={isRequestingPairingCode || pairingPhoneInput.replace(/\D/g, '').length !== 10}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 disabled:pointer-events-none text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs shrink-0"
                  >
                    {isRequestingPairingCode ? (
                      <>
                        <RefreshCw size={13} className="animate-spin" />
                        <span>Generating Code...</span>
                      </>
                    ) : (
                      <>
                        <Smartphone size={13} />
                        <span>Generate Pairing Code</span>
                      </>
                    )}
                  </button>
                </div>

                {pairingCodeError && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-500/30 rounded-xl text-xs text-rose-700 dark:text-rose-300 font-medium flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0 text-rose-600 dark:text-rose-400" />
                    <span>{pairingCodeError}</span>
                  </div>
                )}

                {pairingCodeResult && (
                  <div className="p-4 bg-emerald-50 dark:bg-zinc-950 border border-emerald-300 dark:border-emerald-500/40 rounded-xl space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                          Your WhatsApp Pairing Code
                        </div>
                        <div className="text-2xl font-black font-mono tracking-widest text-emerald-950 dark:text-emerald-300 mt-1 select-all">
                          {pairingCodeResult}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleCopyPairingCode}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs self-start sm:self-auto"
                      >
                        {hasCopiedCode ? (
                          <>
                            <Check size={14} />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={14} />
                            <span>Copy Code</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="p-3 bg-white/80 dark:bg-zinc-900/80 rounded-lg border border-emerald-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 space-y-1">
                      <div className="font-bold text-zinc-900 dark:text-zinc-100">Next Steps on your phone:</div>
                      <ol className="list-decimal list-inside space-y-0.5 text-[11px]">
                        <li>Open WhatsApp &gt; <strong>Linked Devices</strong> &gt; <strong>Link a Device</strong></li>
                        <li>Tap <strong>&quot;Link with phone number instead&quot;</strong> at the bottom</li>
                        <li>Enter the 8-character code shown above</li>
                      </ol>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </SettingCard>

      {/* Test WhatsApp Connectivity */}
      <SettingCard
        title="Test WhatsApp Connectivity"
        description="Verify WhatsApp sending with a sample 'Hi' test message before sending bills"
        icon={<Sparkles size={16} className="text-emerald-500" />}
      >
        <div className="space-y-3">
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Send a sample &quot;Hi&quot; message to test whether the background dispatcher can successfully send messages to your phone.
          </p>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <span className="absolute left-3 top-2.5 text-xs font-bold text-zinc-500 select-none">
                +91
              </span>
              <input
                type="tel"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="9876543210"
                maxLength={10}
                className="w-full pl-10 pr-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl text-xs font-mono text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              type="button"
              onClick={handleSendTestMessage}
              disabled={isTesting || testPhone.replace(/\D/g, '').length !== 10}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 disabled:pointer-events-none text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
            >
              {isTesting ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>Sending Test...</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  <span>Send Test &apos;Hi&apos; Message</span>
                </>
              )}
            </button>
          </div>

          {testFeedback && (
            <div
              className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                testFeedback.type === 'success'
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400'
                  : 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-400'
              }`}
            >
              {testFeedback.type === 'success' ? (
                <Check size={14} className="shrink-0" />
              ) : (
                <AlertCircle size={14} className="shrink-0" />
              )}
              <span>{testFeedback.text}</span>
            </div>
          )}
        </div>
      </SettingCard>

      {/* Bill Caption Template */}
      <SettingCard
        title="Bill Receipt Caption Template"
        description="Custom message sent alongside the thermal receipt PNG image (zero typing required — click presets or variables)"
        icon={<MessageSquare size={16} className="text-emerald-500" />}
        headerAction={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSaveDirectly('bill')}
              disabled={isSavingDirectly === 'bill'}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs ${
                directSaveSuccess === 'bill'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/80 dark:text-emerald-300 dark:border-emerald-800'
              }`}
            >
              {isSavingDirectly === 'bill' ? (
                <>
                  <RefreshCw size={12} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : directSaveSuccess === 'bill' ? (
                <>
                  <Check size={12} />
                  <span>Saved to POS!</span>
                </>
              ) : (
                <>
                  <Save size={12} />
                  <span>Save Template</span>
                </>
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Builder Method Selector: Presets | Block Builder | Direct Editor */}
          <div className="flex items-center gap-2 p-1 bg-zinc-100 dark:bg-zinc-900/90 rounded-xl border border-zinc-200 dark:border-zinc-800 w-fit">
            <button
              type="button"
              onClick={() => setActiveBuilderTab('presets')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeBuilderTab === 'presets'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              <Sparkles size={13} />
              <span>1-Click Presets</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveBuilderTab('blocks')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeBuilderTab === 'blocks'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              <Wand2 size={13} />
              <span>Build with Blocks</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveBuilderTab('editor')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeBuilderTab === 'editor'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              <FileText size={13} />
              <span>Template Editor</span>
            </button>
          </div>

          {/* TAB 1: 1-Click Presets */}
          {activeBuilderTab === 'presets' && (
            <div className="space-y-2.5">
              <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                Choose a ready-to-use template (1-Click Setup):
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {BILL_PRESETS.map((p) => {
                  const isCurrent = currentBillTemplate.trim() === p.template.trim();
                  return (
                    <div
                      key={p.id}
                      onClick={() => applyBillPreset(p.template)}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                        isCurrent
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-600 shadow-xs'
                          : 'bg-white dark:bg-zinc-900/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 border-zinc-200 dark:border-zinc-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                          {isCurrent ? <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" /> : null}
                          {p.name}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                          {p.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">
                        {p.desc}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          applyBillPreset(p.template);
                        }}
                        className="mt-2 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1"
                      >
                        {isCurrent ? 'Active Template ✓' : 'Click to Load Preset →'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: Build with Blocks (Checkboxes) */}
          {activeBuilderTab === 'blocks' && (
            <div className="p-4 bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-zinc-900 dark:text-white">
                    Select which details to include in your message:
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Click checkboxes to choose your sections, then click &quot;Apply Blocks&quot; to build the message with zero typing!
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleApplyBlocks}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs shrink-0"
                >
                  <Wand2 size={13} />
                  <span>Apply Blocks</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {BILL_BLOCKS.map((b) => {
                  const isChecked = selectedBlocks.includes(b.id);
                  return (
                    <label
                      key={b.id}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer select-none transition-all ${
                        isChecked
                          ? 'bg-white dark:bg-zinc-800 border-emerald-400 dark:border-emerald-600 shadow-2xs'
                          : 'bg-white/50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedBlocks((prev) => [...prev, b.id]);
                          } else {
                            setSelectedBlocks((prev) => prev.filter((id) => id !== b.id));
                          }
                        }}
                        className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                          {b.label}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 truncate">
                          {b.snippet}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Toolbar (Zero typing of * or _) */}
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => wrapSelectionWithMarker(billTextareaRef, currentBillTemplate, '*', (val) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      whatsAppConfig: { ...(prev.whatsAppConfig || {}), billCaptionTemplate: val },
                    }))
                  )}
                  title="Make text Bold (*text*) without typing *"
                  className="px-2.5 py-1 text-xs font-bold bg-white dark:bg-zinc-800 hover:bg-emerald-50 text-zinc-800 dark:text-zinc-200 hover:text-emerald-700 rounded-lg transition-all border border-zinc-300 dark:border-zinc-700 shadow-2xs flex items-center gap-1"
                >
                  <Bold size={12} />
                  <span>Bold</span>
                </button>

                <button
                  type="button"
                  onClick={() => wrapSelectionWithMarker(billTextareaRef, currentBillTemplate, '_', (val) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      whatsAppConfig: { ...(prev.whatsAppConfig || {}), billCaptionTemplate: val },
                    }))
                  )}
                  title="Make text Italic (_text_) without typing _"
                  className="px-2 py-1 text-xs font-bold bg-white dark:bg-zinc-800 hover:bg-emerald-50 text-zinc-800 dark:text-zinc-200 hover:text-emerald-700 rounded-lg transition-all border border-zinc-300 dark:border-zinc-700 shadow-2xs flex items-center gap-1"
                >
                  <Italic size={12} />
                  <span>Italic</span>
                </button>

                <button
                  type="button"
                  onClick={() => insertTextAtCursor(billTextareaRef, currentBillTemplate, '• ', (val) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      whatsAppConfig: { ...(prev.whatsAppConfig || {}), billCaptionTemplate: val },
                    }))
                  )}
                  title="Insert bullet point"
                  className="px-2 py-1 text-xs font-bold bg-white dark:bg-zinc-800 hover:bg-emerald-50 text-zinc-800 dark:text-zinc-200 hover:text-emerald-700 rounded-lg transition-all border border-zinc-300 dark:border-zinc-700 shadow-2xs flex items-center gap-1"
                >
                  <List size={12} />
                  <span>Bullet</span>
                </button>

                <button
                  type="button"
                  onClick={() => insertTextAtCursor(billTextareaRef, currentBillTemplate, '₹', (val) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      whatsAppConfig: { ...(prev.whatsAppConfig || {}), billCaptionTemplate: val },
                    }))
                  )}
                  title="Insert rupee symbol ₹"
                  className="px-2 py-1 text-xs font-bold bg-white dark:bg-zinc-800 hover:bg-emerald-50 text-zinc-800 dark:text-zinc-200 hover:text-emerald-700 rounded-lg transition-all border border-zinc-300 dark:border-zinc-700 shadow-2xs"
                >
                  ₹
                </button>

                <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700 mx-0.5" />

                {/* Emojis palette */}
                {['🧾', '💰', '📌', '📅', '🛵', '🙏', '✨', '⭐', '📋', '🛒', '🍗'].map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => insertTextAtCursor(billTextareaRef, currentBillTemplate, em, (val) =>
                      updateDraftConfig((prev) => ({
                        ...prev,
                        whatsAppConfig: { ...(prev.whatsAppConfig || {}), billCaptionTemplate: val },
                      }))
                    )}
                    className="w-6 h-6 text-xs hover:scale-125 transition-transform flex items-center justify-center rounded"
                    title={`Insert ${em}`}
                  >
                    {em}
                  </button>
                ))}
              </div>

              {/* Auto-bold Variables Checkbox */}
              <label className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300 font-medium select-none cursor-pointer bg-zinc-100 dark:bg-zinc-900 px-2.5 py-1 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <input
                  type="checkbox"
                  checked={autoBoldVars}
                  onChange={(e) => setAutoBoldVars(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>Auto-Bold Variables on Click (e.g. *{'{total}'}*)</span>
              </label>
            </div>

            {/* Clickable Variable Buttons with Cursor Insertion */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                <span>Click to insert variable at cursor position:</span>
                <span className="text-[10px] text-zinc-500 font-normal">
                  {autoBoldVars ? '(Will automatically insert formatted in bold *)' : '(Will insert plain tag)'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 max-h-36 overflow-y-auto p-2 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                {AVAILABLE_VARIABLES.map((v) => (
                  <button
                    key={v.tag}
                    type="button"
                    onClick={() => handleInsertVariable('bill', v.tag)}
                    title={v.desc}
                    className="px-2.5 py-1 text-xs font-mono font-medium bg-white hover:bg-emerald-50 text-emerald-950 dark:text-emerald-200 border border-zinc-300 hover:border-emerald-400 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:border-zinc-700 rounded-lg transition-all shadow-2xs flex items-center gap-1"
                  >
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">+</span>
                    <span>{autoBoldVars ? `*${v.tag}*` : v.tag}</span>
                    <span className="text-[10px] font-sans text-zinc-500 dark:text-zinc-400">
                      ({v.label})
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Textarea Editor */}
            <div className="relative">
              <textarea
                ref={billTextareaRef}
                value={currentBillTemplate}
                onChange={(e) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    whatsAppConfig: {
                      ...(prev.whatsAppConfig || {}),
                      billCaptionTemplate: e.target.value,
                    },
                  }))
                }
                rows={6}
                placeholder="Type your WhatsApp message template here..."
                className="w-full p-3 font-mono text-xs leading-relaxed bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-2xs"
              />
            </div>

            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 italic">
              Tip: Tags like {'{shopName}'}, {'{billNo}'}, and {'{netAmount}'} are automatically replaced with real bill details when printing/sending. Emojis and WhatsApp formatting (*bold*, _italic_) are fully supported!
            </p>
          </div>

          {/* Real WhatsApp Chat Bubble Live Preview */}
          <div className="p-4 bg-zinc-100 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <Smartphone size={13} />
                <span>Live WhatsApp Customer View (Real Look)</span>
              </span>
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                Sample Bill: ₹586.00 (INV-1042)
              </span>
            </div>

            {/* Simulated WhatsApp Chat Phone Interface */}
            <div className="rounded-xl overflow-hidden border border-zinc-300 dark:border-zinc-800 shadow-xs max-w-lg bg-[#efeae2] dark:bg-[#0b141a]">
              {/* WhatsApp App Topbar */}
              <div className="bg-[#008069] text-white px-3.5 py-2 flex items-center justify-between text-xs font-bold">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">
                    {sampleShop.charAt(0)}
                  </div>
                  <div>
                    <div className="leading-tight text-[11px]">{sampleShop}</div>
                    <div className="text-[9px] text-white/80 font-normal">Official Business Account</div>
                  </div>
                </div>
                <div className="text-[10px] text-white/80">Online</div>
              </div>

              {/* Chat Canvas & Message Bubble */}
              <div className="p-3.5 space-y-2">
                <div className="max-w-[92%] bg-white dark:bg-[#202c33] rounded-2xl rounded-tl-xs p-3 shadow-md border border-zinc-200/60 dark:border-zinc-800 space-y-2.5">
                  {/* Attached Thermal Image Thumbnail */}
                  <div className="p-2.5 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300">
                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 rounded-lg shrink-0">
                      <Image size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold text-zinc-900 dark:text-white truncate">
                        Receipt_INV-1042.png
                      </div>
                      <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                        Thermal Bill Receipt Image Attached (Auto-generated)
                      </div>
                    </div>
                  </div>

                  {/* Formatted Text Message with WhatsApp Bold Rendering */}
                  <div className="text-zinc-900 dark:text-zinc-100 leading-relaxed text-xs">
                    {renderWhatsAppFormatted(previewBillText)}
                  </div>

                  {/* Message timestamp and blue ticks */}
                  <div className="flex items-center justify-end gap-1 text-[10px] text-zinc-400 dark:text-zinc-500 pt-0.5">
                    <span>02:30 PM</span>
                    <span className="text-[#53bdeb] font-bold tracking-tighter">✓✓</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SettingCard>

      {/* Delivery Notice Template */}
      <SettingCard
        title="Delivery Notice Follow-Up Template"
        description="Sent automatically when an order is flagged for delivery"
        icon={<Send size={16} className="text-emerald-500" />}
        headerAction={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSaveDirectly('delivery')}
              disabled={isSavingDirectly === 'delivery'}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs ${
                directSaveSuccess === 'delivery'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/80 dark:text-emerald-300 dark:border-emerald-800'
              }`}
            >
              {isSavingDirectly === 'delivery' ? (
                <>
                  <RefreshCw size={12} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : directSaveSuccess === 'delivery' ? (
                <>
                  <Check size={12} />
                  <span>Saved to POS!</span>
                </>
              ) : (
                <>
                  <Save size={12} />
                  <span>Save Template</span>
                </>
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Quick Presets for Delivery */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
              1-Click Delivery Presets:
            </div>
            <div className="flex flex-wrap gap-2">
              {DELIVERY_PRESETS.map((dp) => (
                <button
                  key={dp.id}
                  type="button"
                  onClick={() => applyDeliveryPreset(dp.template)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-zinc-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 shadow-2xs flex items-center gap-1.5"
                >
                  <Sparkles size={12} className="text-emerald-500" />
                  <span>{dp.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Variables and Format Tools */}
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                Insert:
              </span>
              {[
                { tag: '{shopName}', label: 'Shop Name' },
                { tag: '{customerName}', label: 'Customer' },
                { tag: '{billNo}', label: 'Bill No' },
                { tag: '{netAmount}', label: 'Total (₹)' },
                { tag: '{shopPhone}', label: 'Shop Phone' },
                { tag: '{deliveryStatus}', label: 'Delivery Status' },
              ].map((v) => (
                <button
                  key={v.tag}
                  type="button"
                  onClick={() => handleInsertVariable('delivery', v.tag)}
                  className="px-2.5 py-1 text-xs font-mono font-medium bg-white hover:bg-emerald-50 text-emerald-900 border border-zinc-300 hover:border-emerald-400 rounded-lg transition-all dark:bg-emerald-950/60 dark:hover:bg-emerald-900/80 dark:text-emerald-300 dark:border-emerald-800/60 shadow-2xs flex items-center gap-1"
                >
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">+</span>
                  <span>{autoBoldVars ? `*${v.tag}*` : v.tag}</span>
                </button>
              ))}
            </div>

            <textarea
              ref={deliveryTextareaRef}
              value={currentDeliveryTemplate}
              onChange={(e) =>
                updateDraftConfig((prev) => ({
                  ...prev,
                  whatsAppConfig: {
                    ...(prev.whatsAppConfig || {}),
                    deliveryMessageTemplate: e.target.value,
                  },
                }))
              }
              rows={4}
              className="w-full p-3 font-mono text-xs leading-relaxed bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-2xs"
            />

            {/* Live Preview for Delivery */}
            <div className="p-3.5 bg-zinc-100 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Live Preview (Customer WhatsApp Notice)
                </span>
              </div>
              <div className="p-3 bg-white dark:bg-[#202c33] rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs max-w-md">
                <div className="text-zinc-900 dark:text-zinc-100 leading-relaxed text-xs">
                  {renderWhatsAppFormatted(previewDeliveryText)}
                </div>
                <div className="flex items-center justify-end gap-1 text-[10px] text-zinc-400 dark:text-zinc-500 pt-1">
                  <span>02:35 PM</span>
                  <span className="text-[#53bdeb] font-bold">✓✓</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SettingCard>

      {/* Reset to Defaults */}
      <div className="pt-2 flex justify-end">
        <button
          type="button"
          onClick={handleResetDefaults}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-zinc-700 hover:text-zinc-900 bg-white hover:bg-zinc-100 border border-zinc-300 rounded-xl transition-colors dark:text-zinc-300 dark:hover:text-white dark:bg-zinc-800/70 dark:hover:bg-zinc-700/80 dark:border-zinc-700 shadow-2xs"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset All WhatsApp Templates to Default
        </button>
      </div>
    </div>
  );
};

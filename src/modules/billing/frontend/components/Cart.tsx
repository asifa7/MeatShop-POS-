import { useState, useEffect } from 'react';
import { Pause, CheckCircle2, CreditCard, Banknote, Smartphone, SplitSquareVertical, Shield, RotateCcw, Truck, Printer, MessageSquare, Loader2 } from 'lucide-react';
import { useCart } from '../hooks/useCart';
import { formatPaise, calculateLineTax } from '../types/billing.types';
import CartLineItem from './CartLineItem';
import ManualBatchPickerModal from './ManualBatchPickerModal';
import SalesReturnModal from './SalesReturnModal';
import { WhatsAppPhoneModal } from './WhatsAppPhoneModal';
import type { InvoiceDetail, InvoiceItem } from '../types/billing.types';
import { useCustomer } from '../../../customers/frontend/hooks/useCustomers';
import { useBillingSettingsStore } from '../hooks/useBillingSettingsStore';
import { usePOSShortcutsStore, formatKeyLabel, isKeyMatch } from '../hooks/usePOSShortcutsStore';
import { useNavigate } from 'react-router-dom';

interface CartProps {
  onOpenWeightEntry: (itemId: number, variantName: string, ratePaise: number) => void;
  onOpenPaymentPanel: () => void;
  onCompleteSale: (invoice: InvoiceDetail, printType?: 'both' | 'normal' | 'token' | 'none') => void;
  selectedPaymentMethod: any;
  onSelectPaymentMethod: (method: any) => void;
  skipPaymentConfirmation?: boolean;
  defaultPaymentMethod?: 'cash' | 'upi' | 'card' | 'split';
  deliveryChargePaise?: number;
  onOpenDeliveryModal?: () => void;
  onToggleDelivery?: () => void;
  isDeliveryOrder?: boolean;
}

export default function Cart({
  onOpenWeightEntry,
  onOpenPaymentPanel,
  onCompleteSale,
  selectedPaymentMethod,
  onSelectPaymentMethod,
  defaultPaymentMethod = 'cash',
  deliveryChargePaise = 0,
  onOpenDeliveryModal,
  onToggleDelivery,
  isDeliveryOrder = false,
}: CartProps) {
  const cart = useCart();
  const {
    skipPaymentConfirmation,
    setSkipPaymentConfirmation,
    setLastCompletedInvoice,
    isPaymentSelectionFocused,
    setIsPaymentSelectionFocused,
  } = useBillingSettingsStore();
  const { shortcuts } = usePOSShortcutsStore();
  const navigate = useNavigate();

  const [removingId, setRemovingId] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cartError, setCartError] = useState('');
  const [pickerTargetItem, setPickerTargetItem] = useState<InvoiceItem | null>(null);
  const [isSalesReturnOpen, setIsSalesReturnOpen] = useState(false);

  const [discountPercent, setDiscountPercent] = useState('');
  const [flatDeduction, setFlatDeduction] = useState('');
  const [dressingCharge, setDressingCharge] = useState('');
  const [narration, setNarration] = useState('');
  const [printNormalBill, setPrintNormalBill] = useState(true);
  const [printTokenBill, setPrintTokenBill] = useState(false);
  const [cashGiven, setCashGiven] = useState('');
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [showWhatsAppPhoneModal, setShowWhatsAppPhoneModal] = useState(false);
  const [whatsAppFeedback, setWhatsAppFeedback] = useState<{ type: 'sending' | 'success' | 'error'; text: string } | null>(null);

  const handleSendWhatsApp = async (overridePhone?: string) => {
    if (!cart.activeInvoice?.id) return;
    const targetPhone = (overridePhone || customer?.whatsapp || customer?.phone || customer?.phone2 || '').trim();
    if (!targetPhone) {
      setShowWhatsAppPhoneModal(true);
      return;
    }

    setIsSendingWhatsApp(true);
    const cleanPhone = targetPhone.replace(/[^0-9]/g, '').slice(-10);
    setWhatsAppFeedback({ type: 'sending', text: `Sending bill image to +91 ${cleanPhone}...` });
    try {
      const res = await window.api.invoke('billing:send-whatsapp-bill', {
        invoice_id: cart.activeInvoice.id,
        customPhone: targetPhone,
      });
      if (res && res.success) {
        setWhatsAppFeedback({ type: 'success', text: `✓ Bill image queued to send to +91 ${cleanPhone} in background!` });
        setShowWhatsAppPhoneModal(false);
      } else if (res && res.notLoggedIn) {
        setWhatsAppFeedback({ type: 'error', text: '⚠️ WhatsApp not linked. Please scan QR in WhatsApp tab once.' });
      } else if (res && res.failureReason && res.failureReason.toLowerCase().includes('phone')) {
        setShowWhatsAppPhoneModal(true);
        setWhatsAppFeedback({ type: 'error', text: res.failureReason });
      } else {
        setWhatsAppFeedback({ type: 'error', text: res?.failureReason || 'Failed to send WhatsApp bill' });
      }
    } catch (e: any) {
      setWhatsAppFeedback({ type: 'error', text: `Error: ${e.message || 'Send failed'}` });
    } finally {
      setIsSendingWhatsApp(false);
      setTimeout(() => setWhatsAppFeedback(null), 6000);
    }
  };

  const customerId = cart.activeInvoice?.customer_id ?? null;
  const { data: customer } = useCustomer(customerId);

  const subtotalPaise = cart.items.reduce((sum, item) => sum + item.line_subtotal_paise, 0);
  const taxPaise = cart.items.reduce((sum, item) => {
    return sum + calculateLineTax(item.line_subtotal_paise, item.gst_rate_percent_snapshot);
  }, 0);

  const discPercentNum = parseFloat(discountPercent) || 0;
  const discountPaise = discPercentNum > 0 ? Math.round(subtotalPaise * (discPercentNum / 100)) : 0;
  const deductionPaise = Math.round((parseFloat(flatDeduction) || 0) * 100);
  const dressingPaise = Math.round((parseFloat(dressingCharge) || 0) * 100);

  const exactTotalPaise = Math.max(0, subtotalPaise - discountPaise - deductionPaise + taxPaise + dressingPaise + (deliveryChargePaise || 0));
  const exactRupees = exactTotalPaise / 100;
  const roundedRupees = Math.round(exactRupees);
  const netTotalPaise = roundedRupees * 100;
  const roundOffPaise = netTotalPaise - exactTotalPaise;

  useEffect(() => {
    if (cart.items.length === 0) {
      onSelectPaymentMethod(null);
      setDiscountPercent('');
      setFlatDeduction('');
      setDressingCharge('');
      setNarration('');
      setPrintTokenBill(false);
      setCashGiven('');
      setIsPaymentSelectionFocused(false);
    }
  }, [cart.items.length, onSelectPaymentMethod, setIsPaymentSelectionFocused]);

  const handleRemove = async (itemId: number) => {
    setRemovingId(itemId);
    try {
      await cart.removeItem(itemId);
    } catch (err: any) {
      setCartError(err.message || 'Failed to remove item');
    } finally {
      setRemovingId(null);
    }
  };

  const handleHold = async () => {
    if (!cart.activeInvoiceId) return;
    setIsProcessing(true);
    try {
      await cart.holdInvoice();
      onSelectPaymentMethod(null);
    } catch (err: any) {
      setCartError(err.message || 'Failed to hold invoice');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCheckout = async (
    explicitMethod?: 'cash' | 'upi' | 'card' | 'credit' | 'split',
  ) => {
    let methodToUse = explicitMethod || selectedPaymentMethod;
    if (!methodToUse && skipPaymentConfirmation) {
      methodToUse = defaultPaymentMethod || 'cash';
      onSelectPaymentMethod(methodToUse);
    }

    if (!methodToUse) {
      setIsPaymentSelectionFocused(true);
      setCartError(`Select payment method first (Press ${formatKeyLabel(shortcuts.cash)} for Cash, ${formatKeyLabel(shortcuts.upi)} for UPI, ${formatKeyLabel(shortcuts.card)} for Card, ${formatKeyLabel(shortcuts.split)} for Split)`);
      return;
    }

    if (methodToUse === 'split') {
      onOpenPaymentPanel();
      return;
    }

    setIsProcessing(true);
    setCartError('');
    try {
      if (methodToUse === 'cash') {
        const tenderPaise = cashGiven && !isNaN(parseFloat(cashGiven)) ? Math.round(parseFloat(cashGiven) * 100) : netTotalPaise;
        await cart.recordPayment('cash', netTotalPaise, `TENDERED:${tenderPaise}`);
      } else if (methodToUse !== 'credit' && methodToUse !== 'split') {
        await cart.recordPayment(methodToUse, netTotalPaise);
      }

      let printType: 'both' | 'normal' | 'token' | 'none' = 'none';
      if (printNormalBill && printTokenBill) {
        printType = 'both';
      } else if (printNormalBill) {
        printType = 'normal';
      } else if (printTokenBill) {
        printType = 'token';
      }

      const completePayload = {
        discount_percent: discPercentNum > 0 ? discPercentNum : undefined,
        flat_deduction_paise: deductionPaise > 0 ? deductionPaise : undefined,
        dressing_charge_paise: dressingPaise > 0 ? dressingPaise : undefined,
        narration: narration.trim() ? narration.trim() : undefined,
        print_delivery_token: printTokenBill,
        is_delivery: isDeliveryOrder,
        delivery_charge_paise: deliveryChargePaise || 0,
      };
      console.log('[DELIVERY-CHECK-CART]', 'isDeliveryOrder at completeInvoice time:', isDeliveryOrder, 'payload:', completePayload);
      const completed = await cart.completeInvoice(completePayload);

      if (completed) {
        setLastCompletedInvoice(completed);
        setIsPaymentSelectionFocused(false);
        onCompleteSale(completed, printType);
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      setCartError(err?.message || (typeof err === 'string' ? err : 'Checkout failed'));
    } finally {
      setIsProcessing(false);
    }
  };

  // Keyboard Shortcuts: Configured checkout key (Spacebar) to print & direct keys for payment methods
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement;
      if (pickerTargetItem || isSalesReturnOpen) {
        return;
      }

      // Quick Checkout / Print Hotkey (e.g. Spacebar or custom key)
      if (isKeyMatch(e, shortcuts.checkout)) {
        if (cart.items.length === 0) {
          const input = document.getElementById('quick-product-search-input');
          if (input) {
            e.preventDefault();
            (input as HTMLInputElement).focus();
          }
          return;
        }
        e.preventDefault();
        if (skipPaymentConfirmation) {
          handleCheckout();
        } else {
          setIsPaymentSelectionFocused(true);
        }
        return;
      }

      // Single-Key Payment Selection Shortcuts
      if (isPaymentSelectionFocused || !activeEl || !['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName)) {
        if (isKeyMatch(e, shortcuts.cash)) {
          e.preventDefault();
          onSelectPaymentMethod('cash');
          if (!skipPaymentConfirmation && isPaymentSelectionFocused) {
            handleCheckout('cash');
          }
        } else if (isKeyMatch(e, shortcuts.upi)) {
          e.preventDefault();
          onSelectPaymentMethod('upi');
          if (!skipPaymentConfirmation && isPaymentSelectionFocused) {
            handleCheckout('upi');
          }
        } else if (isKeyMatch(e, shortcuts.card)) {
          e.preventDefault();
          onSelectPaymentMethod('card');
          if (!skipPaymentConfirmation && isPaymentSelectionFocused) {
            handleCheckout('card');
          }
        } else if (isKeyMatch(e, shortcuts.split)) {
          e.preventDefault();
          onSelectPaymentMethod('split');
        } else if (isKeyMatch(e, shortcuts.credit) && customer && customer.credit_allowed === 1) {
          e.preventDefault();
          onSelectPaymentMethod('credit');
          if (!skipPaymentConfirmation && isPaymentSelectionFocused) {
            handleCheckout('credit');
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    cart.items.length,
    onSelectPaymentMethod,
    handleCheckout,
    pickerTargetItem,
    isSalesReturnOpen,
    customer,
    skipPaymentConfirmation,
    isPaymentSelectionFocused,
    setIsPaymentSelectionFocused,
    shortcuts,
  ]);

  const paymentButtons: any[] = [
    { key: 'cash', label: 'Cash', shortcut: formatKeyLabel(shortcuts.cash), icon: <Banknote size={13} /> },
    { key: 'upi', label: 'UPI', shortcut: formatKeyLabel(shortcuts.upi), icon: <Smartphone size={13} /> },
    { key: 'card', label: 'Card', shortcut: formatKeyLabel(shortcuts.card), icon: <CreditCard size={13} /> },
  ];

  if (customer && customer.credit_allowed === 1) {
    paymentButtons.push({ key: 'credit' as const, label: 'Credit', shortcut: formatKeyLabel(shortcuts.credit), icon: <Shield size={13} /> });
  }

  paymentButtons.push({ key: 'split' as const, label: 'Split', shortcut: formatKeyLabel(shortcuts.split), icon: <SplitSquareVertical size={13} /> });

  return (
    <div className="flex flex-col h-full bg-surface-panel overflow-hidden border-l border-border-subtle">
      {/* Header */}
      <div className="p-3.5 border-b border-border-subtle bg-surface-panel flex-shrink-0 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-extrabold text-text-primary flex items-center gap-1.5">
            <span>Bill Sequence</span>
            <span className="font-mono text-xs font-bold text-brand-500">
              {cart.activeInvoice ? `#${cart.activeInvoice.id}` : 'Ready'}
            </span>
          </h3>
          <div className="flex items-center gap-1.5 mt-0.5 select-none">
            <span className="bg-surface-card text-text-secondary border border-border-subtle text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase">
              {cart.activeInvoice?.status || 'Draft'}
            </span>
            {cart.isGstInvoice && (
              <span className="bg-blue-950/40 text-blue-400 border border-blue-800/40 text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase">
                GST Invoice
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(onToggleDelivery || onOpenDeliveryModal) && (
            <button
              type="button"
              onClick={() => {
                console.log('[DELIVERY-TOGGLE]', 'before:', isDeliveryOrder, 'clicked');
                if (!isDeliveryOrder) {
                  setPrintTokenBill(true);
                }
                if (onToggleDelivery) onToggleDelivery();
                else if (onOpenDeliveryModal) onOpenDeliveryModal();
              }}
              className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                isDeliveryOrder
                  ? 'bg-brand-500 text-white shadow-sm ring-2 ring-brand-400/30'
                  : 'text-text-muted hover:text-brand-400 bg-surface-card hover:bg-brand-500/10 border border-border-subtle hover:border-brand-500/30'
              }`}
              title={isDeliveryOrder ? 'Click to disable Home Delivery' : 'Click to enable Home Delivery for this bill'}
            >
              <Truck size={12} className={isDeliveryOrder ? 'text-white' : 'text-brand-400'} />
              <span>{isDeliveryOrder ? 'Home Delivery ✓' : 'Home Delivery'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsSalesReturnOpen(true)}
            className="text-[10px] font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
            title="Customer Sales Return"
          >
            <RotateCcw size={11} /> Return Item
          </button>
          <span className="text-[10px] text-text-secondary font-bold font-mono bg-surface-card border border-border-subtle px-2 py-0.5 rounded">
            {cart.items.length} item{cart.items.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Cart Errors */}
      {cartError && (
        <div className="p-3 mx-4 mt-3 bg-red-950/40 border border-red-800/40 rounded-lg text-xs font-semibold text-red-400 flex-shrink-0">
          {cartError}
        </div>
      )}

      {/* Scrollable Items list */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
        {cart.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-text-muted select-none">
            <p className="text-xs font-bold text-text-secondary">This cart is empty.</p>
            <p className="text-[10px] text-text-muted mt-1">Tap products to load items into this bill.</p>
          </div>
        ) : (
          cart.items.map((item, idx) => (
            <CartLineItem
              key={item.id}
              item={item}
              index={idx}
              onEditQty={() => onOpenWeightEntry(item.id, `${item.product_name} — ${item.variant_name}`, item.rate_paise_snapshot)}
              onIncrementPiece={(delta) => {
                if (item.quantity_units === null) return;
                const newQty = Math.max(1, item.quantity_units + delta);
                cart.updateItemQuantity(item.id, null, newQty);
              }}
              onSetQuantity={(quantity) => {
                const safeQuantity = Math.max(1, Math.round(quantity));
                const isWeightType = item.unit_type === 'weight' || item.unit_type === 'live_dual';
                cart.updateItemQuantity(item.id, isWeightType ? safeQuantity : null, item.unit_type === 'piece' ? safeQuantity : null);
              }}
              onRemove={() => handleRemove(item.id)}
              removing={removingId === item.id}
              isGstInvoice={cart.isGstInvoice}
              onOpenBatchPicker={() => setPickerTargetItem(item)}
            />
          ))
        )}
      </div>

      {/* Totals & Adjustments & Actions Footer */}
      {cart.items.length > 0 && (
        <div className="p-2 border-t border-border-subtle bg-surface-app/60 flex-shrink-0 space-y-1.5">
          {/* Adjustments: Discount (%), Deduction (flat ₹), Dressing Charge (flat ₹) */}
          <div className="grid grid-cols-3 gap-1 text-[10px]">
            <div>
              <label className="block text-[8px] font-bold uppercase text-text-muted mb-0.5">Discount (%)</label>
              <input
                type="number"
                step="any"
                min="0"
                max="100"
                placeholder="0%"
                value={discountPercent}
                onChange={e => setDiscountPercent(e.target.value)}
                className="w-full px-1.5 py-0.5 bg-surface-card border border-border-subtle rounded font-mono text-text-primary outline-none focus:border-brand-500 font-bold text-xs"
              />
            </div>
            <div>
              <label className="block text-[8px] font-bold uppercase text-text-muted mb-0.5">Deduction (₹)</label>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="₹0"
                value={flatDeduction}
                onChange={e => setFlatDeduction(e.target.value)}
                className="w-full px-1.5 py-0.5 bg-surface-card border border-border-subtle rounded font-mono text-text-primary outline-none focus:border-brand-500 font-bold text-xs"
              />
            </div>
            <div>
              <label className="block text-[8px] font-bold uppercase text-text-muted mb-0.5">Dressing Charge</label>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="₹0"
                value={dressingCharge}
                onChange={e => setDressingCharge(e.target.value)}
                className="w-full px-1.5 py-0.5 bg-surface-card border border-border-subtle rounded font-mono text-text-primary outline-none focus:border-brand-500 font-bold text-xs"
              />
            </div>
          </div>

          {/* Narration Note Field */}
          <div>
            <input
              type="text"
              placeholder="Narration / Note (optional)..."
              value={narration}
              onChange={e => setNarration(e.target.value)}
              className="w-full px-2 py-0.5 bg-surface-card border border-border-subtle rounded text-[10px] text-text-primary outline-none focus:border-brand-500"
            />
          </div>

          {/* Totals & Rounding Breakdown */}
          <div className="space-y-0.5 border-t border-b border-border-subtle/50 py-1 text-[10px]">
            <div className="flex justify-between text-text-secondary font-medium">
              <span>Subtotal</span>
              <span className="font-mono text-text-primary">{formatPaise(subtotalPaise)}</span>
            </div>

            {discountPaise > 0 && (
              <div className="flex justify-between text-emerald-400 font-semibold">
                <span>Discount ({discPercentNum}%)</span>
                <span className="font-mono">-{formatPaise(discountPaise)}</span>
              </div>
            )}

            {deductionPaise > 0 && (
              <div className="flex justify-between text-emerald-400 font-semibold">
                <span>Flat Deduction</span>
                <span className="font-mono">-{formatPaise(deductionPaise)}</span>
              </div>
            )}

            {dressingPaise > 0 && (
              <div className="flex justify-between text-amber-400 font-semibold">
                <span>Dressing Charge</span>
                <span className="font-mono">+{formatPaise(dressingPaise)}</span>
              </div>
            )}

            {deliveryChargePaise > 0 && (
              <div className="flex justify-between text-purple-400 font-semibold">
                <span className="flex items-center gap-1">
                  <Truck size={11} /> Delivery Fee
                </span>
                <span className="font-mono">+{formatPaise(deliveryChargePaise)}</span>
              </div>
            )}

            {cart.isGstInvoice && taxPaise > 0 && (
              <div className="flex justify-between text-blue-400 font-semibold">
                <span>GST (CGST + SGST)</span>
                <span className="font-mono">{formatPaise(taxPaise)}</span>
              </div>
            )}

            {roundOffPaise !== 0 && (
              <div className="flex justify-between text-text-muted font-bold">
                <span>Round Off</span>
                <span className="font-mono">{roundOffPaise > 0 ? '+' : ''}₹{(roundOffPaise / 100).toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between text-xs font-black text-text-primary pt-0.5 border-t border-border-subtle/40">
              <span>Net Amount</span>
              <span className="font-mono text-brand-500 text-sm font-black">₹{(netTotalPaise / 100).toFixed(2)}</span>
            </div>
          </div>

          {/* Print Options: Bill Print & Token Bill */}
          <div className="flex items-center justify-between bg-surface-card border border-border-subtle/80 rounded-lg px-2.5 py-1.5 shadow-sm">
            <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1">
              <Printer size={12} className="text-brand-500" /> Print Options:
            </span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-text-primary cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="normal-bill-checkbox"
                  checked={printNormalBill}
                  onChange={e => setPrintNormalBill(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-border-subtle text-brand-500 focus:ring-brand-500 cursor-pointer accent-brand-500"
                />
                <span>Bill Print</span>
              </label>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-text-primary cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="token-bill-checkbox"
                  checked={printTokenBill}
                  onChange={e => setPrintTokenBill(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-border-subtle text-amber-500 focus:ring-amber-500 cursor-pointer accent-amber-500"
                />
                <span className="text-amber-400">Token Bill</span>
              </label>
            </div>
          </div>

          {/* Cash Tendered & Change Due (When Cash Payment Selected) */}
          {selectedPaymentMethod === 'cash' && (
            <div className="bg-brand-500/10 border border-brand-500/50 rounded-lg p-1.5 space-y-1 text-[10px]">
              <div className="flex items-center justify-between gap-1.5">
                <label className="font-extrabold uppercase text-brand-500 tracking-wider flex items-center gap-1">
                  <Banknote size={12} /> Cash Received (₹):
                </label>
                <input
                  type="number"
                  step="any"
                  autoFocus
                  placeholder={(netTotalPaise / 100).toFixed(2)}
                  value={cashGiven}
                  onChange={e => setCashGiven(e.target.value)}
                  className="w-28 px-2 py-0.5 bg-surface-card border border-brand-500 rounded font-mono font-bold text-right text-text-primary text-xs outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {cashGiven !== '' && !isNaN(parseFloat(cashGiven)) && (
                <div className="pt-0.5">
                  {parseFloat(cashGiven) >= netTotalPaise / 100 ? (
                    <div className="flex items-center justify-between px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded font-mono text-[10px] text-emerald-400 font-bold">
                      <span>Change to Return:</span>
                      <span className="text-xs font-black">₹{(parseFloat(cashGiven) - (netTotalPaise / 100)).toFixed(2)}</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded font-mono text-[10px] text-amber-400 font-bold">
                      <span>⚠️ Shortage:</span>
                      <span className="text-xs font-black">₹{((netTotalPaise / 100) - parseFloat(cashGiven)).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Payment Methods & Print-Without-Confirming Toggle */}
          <div className={`p-1 rounded-xl transition-all ${
            isPaymentSelectionFocused
              ? 'ring-2 ring-brand-500 bg-brand-500/10 shadow-lg'
              : ''
          }`}>
            {isPaymentSelectionFocused && (
              <div className="flex items-center justify-between mb-1.5 px-1 text-[10px] font-black text-brand-500">
                <span className="flex items-center gap-1 animate-pulse">⚡ SELECT PAYMENT METHOD:</span>
                <span className="font-mono text-[9px] text-text-primary">
                  Press {formatKeyLabel(shortcuts.cash)} (Cash) · {formatKeyLabel(shortcuts.upi)} (UPI) · {formatKeyLabel(shortcuts.card)} (Card) · {formatKeyLabel(shortcuts.split)} (Split)
                </span>
              </div>
            )}
            <div className="grid grid-cols-4 gap-1">
              {paymentButtons.map(btn => {
                const isSelected = selectedPaymentMethod === btn.key;
                return (
                  <button
                    key={btn.key}
                    type="button"
                    onClick={() => {
                      onSelectPaymentMethod(btn.key);
                      if (!skipPaymentConfirmation && isPaymentSelectionFocused) {
                        handleCheckout(btn.key);
                      }
                    }}
                    className={`py-1 px-1 rounded-md text-[9px] font-bold border flex flex-col items-center gap-0.5 transition-all active:scale-[0.97] ${
                      isSelected
                        ? 'bg-brand-500/10 border-brand-500 text-brand-500 shadow-subtle ring-1 ring-brand-500'
                        : isPaymentSelectionFocused
                        ? 'bg-surface-card border-brand-500/50 text-text-primary hover:bg-brand-500/20'
                        : 'bg-surface-card border-border-subtle text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      {btn.icon}
                      <span>{btn.label}</span>
                    </div>
                    <span className={`text-[8px] font-mono font-bold px-1 py-0.2 rounded leading-none ${
                      isSelected ? 'bg-brand-500 text-white' : 'bg-surface-app text-text-muted border border-border-subtle/50'
                    }`}>
                      [{btn.shortcut}]
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Compact Toggle Switch: Print without confirming */}
            <div className="flex items-center justify-between pt-1.5 px-1 mt-1 border-t border-border-subtle/40">
              <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] font-bold text-text-secondary hover:text-text-primary">
                <div className="relative inline-flex items-center">
                  <input
                    type="checkbox"
                    id="toggle-print-without-confirming"
                    checked={skipPaymentConfirmation}
                    onChange={(e) => setSkipPaymentConfirmation(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-7 h-4 bg-surface-card peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-brand-500 border border-border-subtle"></div>
                </div>
                <span className="text-[10px] font-bold">Print without confirming</span>
              </label>
              <span className="text-[9px] font-mono text-text-muted">
                {skipPaymentConfirmation ? `${formatKeyLabel(shortcuts.checkout)} = Instant Print` : `${formatKeyLabel(shortcuts.checkout)} = Pick Method`}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-1.5 pt-0.5">
            <div className="flex gap-1.5">
              <button
                onClick={handleHold}
                disabled={isProcessing}
                className="btn-secondary flex-1 py-1.5 text-xs font-bold flex items-center justify-center gap-1"
              >
                <Pause size={12} />
                Hold
              </button>
              <button
                onClick={() => handleCheckout()}
                disabled={isProcessing || (!selectedPaymentMethod && !skipPaymentConfirmation)}
                className="btn-primary flex-1 py-1.5 text-xs font-black flex items-center justify-center gap-1.5 shadow-subtle group"
                title={`Complete Sale & Print Bill (Shortcut: ${formatKeyLabel(shortcuts.checkout)})`}
              >
                <CheckCircle2 size={13} />
                <span>{isProcessing ? 'Saving & Printing...' : 'Complete & Print'}</span>
                <span className="text-[9px] font-mono font-bold bg-white/20 px-1 py-0.5 rounded text-white tracking-wider group-hover:bg-white/30">
                  [{formatKeyLabel(shortcuts.checkout)}]
                </span>
              </button>
            </div>

            {/* In-Billing Direct Background WhatsApp Bill Send Button */}
            <button
              type="button"
              onClick={() => handleSendWhatsApp()}
              disabled={isProcessing || isSendingWhatsApp || cart.items.length === 0}
              className="w-full py-1.5 px-3 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/40 text-emerald-400 text-xs font-black flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] disabled:opacity-50"
              title={customer?.phone ? `Send bill image to ${customer.name || customer.phone}` : 'Send current bill image to WhatsApp in background'}
            >
              {isSendingWhatsApp ? (
                <Loader2 size={13} className="animate-spin text-emerald-400" />
              ) : (
                <MessageSquare size={13} className="text-emerald-400" />
              )}
              <span>
                {isSendingWhatsApp
                  ? 'Sending Bill Image...'
                  : `Send Bill Image via WhatsApp ${customer?.phone ? `(${customer.phone})` : ''}`}
              </span>
            </button>

            {whatsAppFeedback && (
              <div
                className={`w-full text-[10px] px-2 py-1 rounded border font-bold text-center flex items-center justify-center gap-1.5 transition-all ${
                  whatsAppFeedback.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : whatsAppFeedback.type === 'sending'
                    ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300 animate-pulse'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                }`}
              >
                <span>{whatsAppFeedback.text}</span>
              </div>
            )}
          </div>
        </div>
      )}


      {pickerTargetItem && (
        <ManualBatchPickerModal
          isOpen={!!pickerTargetItem}
          onClose={() => setPickerTargetItem(null)}
          productVariantId={pickerTargetItem.product_variant_id}
          productName={pickerTargetItem.product_name}
          unitType={pickerTargetItem.unit_type}
          requiredQuantityGrams={pickerTargetItem.quantity_grams}
          requiredQuantityUnits={pickerTargetItem.quantity_units}
          existingAllocations={pickerTargetItem.manual_batch_allocations}
          onSaveAllocations={(allocations) => {
            cart.updateItemManualAllocations(pickerTargetItem.id, allocations);
            setPickerTargetItem(null);
          }}
        />
      )}

      <SalesReturnModal
        isOpen={isSalesReturnOpen}
        onClose={() => setIsSalesReturnOpen(false)}
      />

      {/* Direct WhatsApp Phone Prompt Modal */}
      {showWhatsAppPhoneModal && cart.activeInvoice && (
        <WhatsAppPhoneModal
          isOpen={showWhatsAppPhoneModal}
          invoiceId={cart.activeInvoice.id}
          invoiceNumber={cart.activeInvoice.invoice_number}
          customerId={cart.activeInvoice.customer_id}
          customerName={customer?.name}
          initialPhone={customer?.whatsapp || customer?.phone || ''}
          onClose={() => setShowWhatsAppPhoneModal(false)}
          onSuccess={() => {
            setWhatsAppFeedback({ type: 'success', text: '✓ Bill image queued for WhatsApp delivery in background!' });
            setShowWhatsAppPhoneModal(false);
            setTimeout(() => setWhatsAppFeedback(null), 5000);
          }}
        />
      )}
    </div>
  );
}

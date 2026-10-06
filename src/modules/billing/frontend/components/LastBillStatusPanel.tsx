import { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Printer,
  Edit3,
  Trash2,
  AlertTriangle,
  Key,
  Search,
  ChevronDown,
  ChevronUp,
  Receipt,
  MessageSquare,
  Send,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useBillingSettingsStore } from '../hooks/useBillingSettingsStore';
import { useCart } from '../hooks/useCart';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../../auth/frontend/hooks/useAuth';
import { useActiveRates } from '../hooks/useActiveRates';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';
import ReprintLookupModal from './ReprintLookupModal';
import { WhatsAppPhoneModal } from './WhatsAppPhoneModal';
import { useNavigate } from 'react-router-dom';

interface LastBillStatusPanelProps {
  variant?: 'embedded' | 'persistent';
}

export default function LastBillStatusPanel({ variant = 'embedded' }: LastBillStatusPanelProps) {
  const {
    lastCompletedInvoice,
    setLastCompletedInvoice,
    isLastBillPanelExpanded,
    setIsLastBillPanelExpanded,
  } = useBillingSettingsStore();
  const cart = useCart();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { data: activeVariants } = useActiveRates();

  useEffect(() => {
    (async () => {
      try {
        const res = await window.api.invoke(IPC_CHANNELS.BILLING.GET_LAST_COMPLETED);
        if (res && res.success && res.data) {
          setLastCompletedInvoice(res.data);
        }
      } catch (e) {
        console.error('Failed to fetch last completed bill:', e);
      }
    })();
  }, [setLastCompletedInvoice]);

  const [showEditPasswordModal, setShowEditPasswordModal] = useState(false);
  const [editPassword, setEditPassword] = useState('');
  const [editError, setEditError] = useState('');

  const [showVoidConfirmModal, setShowVoidConfirmModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState('');

  const [showReprintChoiceModal, setShowReprintChoiceModal] = useState(false);
  const [showReprintLookupModal, setShowReprintLookupModal] = useState(false);

  const handlePrintLastReceipt = async () => {
    if (!lastCompletedInvoice) return;
    try {
      await window.api.invoke('billing:print-receipt', { invoice_id: lastCompletedInvoice.invoice.id });
    } catch (err: any) {
      console.error('Printing failed:', err);
    }
  };

  const handlePrintReceiptById = async (invoiceId: number) => {
    try {
      await window.api.invoke('billing:print-receipt', { invoice_id: invoiceId });
    } catch (err: any) {
      console.error('Printing failed:', err);
    }
  };

  const navigate = useNavigate();

  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [showWhatsAppPhoneModal, setShowWhatsAppPhoneModal] = useState(false);
  const [whatsAppPhoneInput, setWhatsAppPhoneInput] = useState('');
  const [whatsAppFeedback, setWhatsAppFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const handleSendWhatsApp = async (overridePhone?: string) => {
    if (!lastCompletedInvoice) return;
    setIsSendingWhatsApp(true);
    setWhatsAppFeedback({ type: 'info', text: 'Sending WhatsApp bill in background...' });
    try {
      const phoneToUse = (overridePhone || whatsAppPhoneInput).trim();
      const res = await window.api.invoke(IPC_CHANNELS.BILLING.SEND_WHATSAPP_BILL, {
        invoice_id: lastCompletedInvoice.invoice.id,
        customPhone: phoneToUse || undefined,
      });

      if (res && res.success) {
        setWhatsAppFeedback({ type: 'success', text: `✓ WhatsApp bill sent to ${res.phone || phoneToUse}!` });
        setShowWhatsAppPhoneModal(false);
        setWhatsAppPhoneInput('');
        // Dispatched automatically in the background - zero tab navigation
      } else if (res && res.notLoggedIn) {
        setWhatsAppFeedback({ type: 'error', text: '⚠️ WhatsApp not linked. Please scan QR in WhatsApp tab once.' });
      } else if (res && res.failureReason && res.failureReason.toLowerCase().includes('phone')) {
        setShowWhatsAppPhoneModal(true);
        setWhatsAppFeedback({ type: 'error', text: res.failureReason });
      } else {
        setWhatsAppFeedback({ type: 'error', text: `Failed: ${res?.failureReason || 'Could not send WhatsApp bill'}` });
      }
    } catch (e: any) {
      setWhatsAppFeedback({ type: 'error', text: `Error: ${e.message || 'Send failed'}` });
    } finally {
      setIsSendingWhatsApp(false);
      setTimeout(() => setWhatsAppFeedback(null), 7000);
    }
  };

  const handleSendTestHi = async (overridePhone?: string) => {
    if (!lastCompletedInvoice) return;
    const rawPhone = (overridePhone || lastCompletedInvoice.invoice.customer_phone || (lastCompletedInvoice.customer as any)?.phone || whatsAppPhoneInput).trim();
    if (!rawPhone) {
      setShowWhatsAppPhoneModal(true);
      return;
    }
    setIsSendingWhatsApp(true);
    setWhatsAppFeedback({ type: 'info', text: 'Sending test "Hi" message in background...' });
    try {
      let clean = rawPhone.replace(/[^0-9]/g, '');
      if (clean.length === 10) clean = `91${clean}`;
      const res = await window.api.invoke(IPC_CHANNELS.WHATSAPP.SEND_MESSAGE, {
        phone: clean,
        message: 'Hi! This is a test message from your POS software. WhatsApp connectivity is working successfully! 👍',
      });
      if (res && res.success) {
        setWhatsAppFeedback({ type: 'success', text: `✓ Test "Hi" message sent to +${clean}!` });
        setShowWhatsAppPhoneModal(false);
      } else if (res && res.notLoggedIn) {
        setWhatsAppFeedback({ type: 'error', text: '⚠️ WhatsApp is not linked. Please scan QR code in WhatsApp tab once.' });
      } else {
        setWhatsAppFeedback({ type: 'error', text: `Failed: ${res?.failureReason || 'Could not send test message'}` });
      }
    } catch (err: any) {
      setWhatsAppFeedback({ type: 'error', text: `Error: ${err.message || 'Send failed'}` });
    } finally {
      setIsSendingWhatsApp(false);
      setTimeout(() => setWhatsAppFeedback(null), 7000);
    }
  };

  const handleReprintClick = () => {
    if (lastCompletedInvoice) {
      setShowReprintChoiceModal(true);
    } else {
      setShowReprintLookupModal(true);
    }
  };

  const handleEditBillConfirm = async () => {
    if (!lastCompletedInvoice) return;
    setEditError('');
    try {
      const verifyRes = await window.api.invoke('billing:verify-action-password', { password: editPassword });
      if (!verifyRes.success || !verifyRes.data) {
        setEditError('Invalid password. Edit authorization failed.');
        return;
      }
      const reopenRes = await window.api.invoke('billing:reopen-invoice', { 
        invoice_id: lastCompletedInvoice.invoice.id,
        password: editPassword,
      });
      if (reopenRes.success) {
        setShowEditPasswordModal(false);
        setEditPassword('');
        await cart.loadInvoice(lastCompletedInvoice.invoice.id);
        queryClient.invalidateQueries({ queryKey: ['billing', 'held'] });
      } else {
        setEditError(reopenRes.error?.message || 'Failed to reopen invoice for editing');
      }
    } catch (err: any) {
      setEditError(err.message || 'Authorization failed');
    }
  };

  const handleVoidBillConfirm = async () => {
    if (!lastCompletedInvoice) return;
    setVoidError('');
    try {
      const res = await window.api.invoke('billing:delete-invoice', {
        invoice_id: lastCompletedInvoice.invoice.id,
        reason: voidReason.trim() || 'Customer requested void / cancellation',
      });
      if (res.success) {
        setShowVoidConfirmModal(false);
        setVoidReason('');
        setLastCompletedInvoice({
          ...lastCompletedInvoice,
          invoice: { ...lastCompletedInvoice.invoice, status: 'void' },
        });
        queryClient.invalidateQueries({ queryKey: ['billing', 'held'] });
      } else {
        setVoidError(res.error?.message || 'Failed to delete/void invoice');
      }
    } catch (err: any) {
      setVoidError(err.message || 'Delete operation failed');
    }
  };

  // Compact floating widget for non-billing screens
  if (variant === 'persistent') {
    return (
      <>
        <div
          id="persistent-last-bill-widget"
          className="fixed bottom-10 right-4 z-40 max-w-sm w-80 sm:w-96 bg-surface-panel/95 backdrop-blur-md border border-border-subtle rounded-2xl shadow-2xl overflow-hidden transition-all duration-200"
        >
          {/* Header Bar with Toggle */}
          <div
            onClick={() => setIsLastBillPanelExpanded(!isLastBillPanelExpanded)}
            className="px-3.5 py-2.5 bg-surface-card border-b border-border-subtle/70 flex items-center justify-between cursor-pointer hover:bg-surface-hover select-none"
          >
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center shrink-0">
                <Receipt size={13} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-text-primary">Last Bill Status</span>
                  {lastCompletedInvoice && (
                    <span
                      className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded border ${
                        lastCompletedInvoice.invoice.status === 'completed'
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-500'
                          : 'bg-rose-500/10 border-rose-500/40 text-rose-400'
                      }`}
                    >
                      {lastCompletedInvoice.invoice.status}
                    </span>
                  )}
                </div>
                {lastCompletedInvoice ? (
                  <p className="text-[10px] text-text-muted font-mono font-semibold">
                    #{lastCompletedInvoice.invoice.invoice_number?.split('_')[0] || lastCompletedInvoice.invoice.id} · ₹
                    {(lastCompletedInvoice.invoice.total_paise / 100).toFixed(2)}
                  </p>
                ) : (
                  <p className="text-[10px] text-text-muted">No completed bills yet</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1">
              {lastCompletedInvoice && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePrintLastReceipt();
                  }}
                  className="p-1 text-brand-500 hover:bg-brand-500/10 rounded-md transition-colors"
                  title="Quick Reprint Receipt"
                >
                  <Printer size={14} />
                </button>
              )}
              <button
                type="button"
                className="text-text-muted hover:text-text-primary p-1"
                title={isLastBillPanelExpanded ? 'Collapse' : 'Expand'}
              >
                {isLastBillPanelExpanded ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
              </button>
            </div>
          </div>

          {/* Expanded Content View */}
          {isLastBillPanelExpanded && (
            <div className="p-3 space-y-2.5 max-h-[70vh] overflow-y-auto">
              {!lastCompletedInvoice ? (
                <div className="p-4 bg-surface-card rounded-xl border border-border-subtle text-center text-text-muted text-xs">
                  No completed bill recorded yet.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {/* Bill Details */}
                  <div className="grid grid-cols-2 gap-2 text-[10px] bg-surface-card p-2 rounded-lg border border-border-subtle/50">
                    <div>
                      <span className="text-text-muted block text-[8px] uppercase font-bold">Date & Time</span>
                      <span className="font-mono text-text-primary font-semibold">
                        {new Date(lastCompletedInvoice.invoice.created_at).toLocaleDateString()}{' '}
                        {new Date(lastCompletedInvoice.invoice.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[8px] uppercase font-bold">Payment Mode</span>
                      <span className="font-bold text-brand-500 uppercase font-mono">
                        {lastCompletedInvoice.payments[0]?.method || 'CASH'}
                      </span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[8px] uppercase font-bold">Cashier</span>
                      <span className="text-text-primary font-semibold">Admin</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[8px] uppercase font-bold">Customer</span>
                      <span className="text-text-primary font-semibold truncate block">
                        {lastCompletedInvoice.invoice.customer_id
                          ? `Customer #${lastCompletedInvoice.invoice.customer_id}`
                          : 'Walk-in'}
                      </span>
                    </div>
                  </div>

                  {/* Detailed Items List */}
                  <div className="space-y-1">
                    <span className="text-[9px] uppercase font-extrabold text-text-muted block tracking-wider">
                      Itemized Breakdown
                    </span>
                    <div className="border border-border-subtle rounded-lg overflow-y-auto max-h-[140px] text-[10px]">
                      <table className="w-full text-left relative">
                        <thead className="bg-surface-card sticky top-0 z-10 text-[8px] uppercase font-extrabold text-text-muted border-b border-border-subtle shadow-sm">
                          <tr>
                            <th className="px-2 py-1">Item</th>
                            <th className="px-1.5 py-1 text-center">Qty</th>
                            <th className="px-1.5 py-1 text-right">Rate</th>
                            <th className="px-2 py-1 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle/50 font-mono text-[10px]">
                          {lastCompletedInvoice.items.map((item) => {
                            const matched = activeVariants?.find((v) => v.id === item.product_variant_id);
                            const prodName = item.product_name || matched?.product_name || 'Product';
                            const varName = item.variant_name || matched?.variant_name || '';
                            return (
                              <tr key={item.id} className="hover:bg-surface-hover/50">
                                <td className="px-2 py-1 font-sans font-extrabold text-text-primary text-[10px]">
                                  {prodName}
                                  {varName && varName !== 'Default' && varName !== 'Standard' && (
                                    <span className="text-[8px] font-normal text-text-muted block">
                                      ({varName})
                                    </span>
                                  )}
                                </td>
                              <td className="px-1.5 py-1 text-center text-text-secondary font-bold">
                                {item.quantity_grams
                                  ? `${(item.quantity_grams / 1000).toFixed(3)} kg`
                                  : `${item.quantity_units} pc`}
                              </td>
                              <td className="px-1.5 py-1 text-right text-text-secondary">
                                ₹{(item.rate_paise_snapshot / 100).toFixed(2)}
                              </td>
                              <td className="px-2 py-1 text-right font-extrabold text-brand-500">
                                ₹{(item.line_total_paise / 100).toFixed(2)}
                              </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Grand Total */}
                  <div className="border-t border-border-subtle pt-1.5 flex justify-between text-xs font-extrabold text-text-primary">
                    <span>Grand Total:</span>
                    <span className="font-mono text-brand-500 text-sm">
                      ₹{(lastCompletedInvoice.invoice.total_paise / 100).toFixed(2)}
                    </span>
                  </div>

                  {whatsAppFeedback && (
                    <div
                      className={`text-[10px] px-2 py-1 rounded border font-bold text-center flex items-center justify-center gap-1.5 ${
                        whatsAppFeedback.type === 'success'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : whatsAppFeedback.type === 'info'
                          ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300 animate-pulse'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      }`}
                    >
                      {whatsAppFeedback.type === 'info' && <Loader2 size={11} className="animate-spin" />}
                      <span>{whatsAppFeedback.text}</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="pt-2 pb-1 border-t border-border-subtle/60 grid grid-cols-4 gap-1.5">
                    <button
                      onClick={handleReprintClick}
                      className="py-1.5 px-1.5 bg-brand-500 hover:bg-brand-600 active:scale-95 text-white rounded-lg text-[10.5px] font-black transition-all flex items-center justify-center gap-1 shadow-subtle"
                    >
                      <Printer size={12} /> Reprint
                    </button>
                    <button
                      onClick={() => handleSendWhatsApp()}
                      disabled={isSendingWhatsApp}
                      className="py-1.5 px-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-[10.5px] font-black transition-all flex items-center justify-center gap-1 shadow-subtle disabled:opacity-50"
                      title="Send Bill via WhatsApp"
                    >
                      {isSendingWhatsApp ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />} WhatsApp
                    </button>
                    <button
                      onClick={() => {
                        setEditPassword('');
                        setEditError('');
                        setShowEditPasswordModal(true);
                      }}
                      disabled={lastCompletedInvoice.invoice.status === 'void'}
                      className="py-1.5 px-1.5 bg-surface-card hover:bg-amber-950/40 text-amber-400 border border-amber-800/40 active:scale-95 rounded-lg text-[10.5px] font-bold transition-all flex items-center justify-center gap-1 disabled:opacity-40"
                    >
                      <Edit3 size={12} /> Edit
                    </button>
                    <button
                      onClick={() => {
                        setVoidReason('');
                        setVoidError('');
                        setShowVoidConfirmModal(true);
                      }}
                      disabled={lastCompletedInvoice.invoice.status === 'void'}
                      className="py-1.5 px-1.5 bg-surface-card hover:bg-rose-950/40 text-rose-400 border border-rose-800/40 active:scale-95 rounded-lg text-[10.5px] font-bold transition-all flex items-center justify-center gap-1 disabled:opacity-40"
                    >
                      <Trash2 size={12} /> Void
                    </button>
                  </div>
                  <div className="pt-1 text-center">
                      <button
                        type="button"
                        onClick={() => handleSendTestHi()}
                        disabled={isSendingWhatsApp}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold inline-flex items-center gap-1 hover:underline transition-all"
                        title="Send sample test 'Hi' to customer to verify connectivity"
                      >
                        <Sparkles size={11} /> Send Sample &apos;Hi&apos; to Customer
                      </button>
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Modals */}
        {renderModals()}
      </>
    );
  }

  // Embedded view for Billing screen
  return (
    <div className="border-t border-border-subtle p-3 bg-surface-card/60 flex-shrink-0 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-extrabold text-text-primary">
          <CheckCircle2 size={15} className="text-brand-500" />
          <span>Last Bill Status</span>
        </div>
        {lastCompletedInvoice && (
          <span
            className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border ${
              lastCompletedInvoice.invoice.status === 'completed'
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-500'
                : 'bg-rose-500/10 border-rose-500/40 text-rose-400'
            }`}
          >
            {lastCompletedInvoice.invoice.status}
          </span>
        )}
      </div>

      {!lastCompletedInvoice ? (
        <div className="p-3 bg-surface-panel rounded-lg border border-border-subtle text-center text-text-muted text-xs">
          No completed bill recorded yet.
        </div>
      ) : (
        <div className="bg-surface-panel border border-border-subtle rounded-xl p-3 space-y-2.5 shadow-subtle">
          <div className="flex items-center justify-between border-b border-border-subtle/60 pb-2">
            <span className="text-[10px] uppercase font-mono tracking-wider text-text-muted">Completed Bill</span>
            <h4 className="text-xs font-extrabold text-brand-500 font-mono">
              #{lastCompletedInvoice.invoice.invoice_number?.split('_')[0] || lastCompletedInvoice.invoice.id}
            </h4>
          </div>

          {/* Bill Metadata Grid */}
          <div className="grid grid-cols-2 gap-2 text-[10px] bg-surface-card p-2 rounded-lg border border-border-subtle/50">
            <div>
              <span className="text-text-muted block text-[8px] uppercase font-bold">Date & Time</span>
              <span className="font-mono text-text-primary font-semibold">
                {new Date(lastCompletedInvoice.invoice.created_at).toLocaleDateString()}{' '}
                {new Date(lastCompletedInvoice.invoice.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div>
              <span className="text-text-muted block text-[8px] uppercase font-bold">Payment Mode</span>
              <span className="font-bold text-brand-500 uppercase font-mono">
                {lastCompletedInvoice.payments[0]?.method || 'CASH'}
              </span>
            </div>
            <div>
              <span className="text-text-muted block text-[8px] uppercase font-bold">Cashier</span>
              <span className="text-text-primary font-semibold">Admin</span>
            </div>
            <div>
              <span className="text-text-muted block text-[8px] uppercase font-bold">Customer</span>
              <span className="text-text-primary font-semibold truncate block">
                {lastCompletedInvoice.invoice.customer_id
                  ? `Customer #${lastCompletedInvoice.invoice.customer_id}`
                  : 'Walk-in'}
              </span>
            </div>
          </div>

          {/* Detailed Item List */}
          <div className="space-y-1">
            <span className="text-[9px] uppercase font-extrabold text-text-muted block tracking-wider">
              Itemized Breakdown
            </span>
            <div className="border border-border-subtle rounded-lg overflow-y-auto max-h-[160px] text-[10px]">
              <table className="w-full text-left relative">
                <thead className="bg-surface-card sticky top-0 z-10 text-[8px] uppercase font-extrabold text-text-muted border-b border-border-subtle shadow-sm">
                  <tr>
                    <th className="px-2 py-1">Item</th>
                    <th className="px-1.5 py-1 text-center">Qty</th>
                    <th className="px-1.5 py-1 text-right">Rate</th>
                    <th className="px-2 py-1 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle/50 font-mono text-[10px]">
                  {lastCompletedInvoice.items.map((item) => (
                    <tr key={item.id} className="hover:bg-surface-hover/50">
                      <td className="px-2 py-1 font-sans font-extrabold text-text-primary text-[10px]">
                        {item.product_name}
                        {item.variant_name && item.variant_name !== 'Default' && (
                          <span className="text-[8px] font-normal text-text-muted block">({item.variant_name})</span>
                        )}
                      </td>
                      <td className="px-1.5 py-1 text-center text-text-secondary font-bold">
                        {item.quantity_grams
                          ? `${(item.quantity_grams / 1000).toFixed(3)} kg`
                          : `${item.quantity_units} pc`}
                      </td>
                      <td className="px-1.5 py-1 text-right text-text-secondary">
                        ₹{(item.rate_paise_snapshot / 100).toFixed(2)}
                      </td>
                      <td className="px-2 py-1 text-right font-extrabold text-brand-500">
                        ₹{(item.line_total_paise / 100).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Net Amount Totals */}
          <div className="border-t border-border-subtle pt-1.5 flex justify-between text-xs font-extrabold text-text-primary">
            <span>Grand Total Net Amount:</span>
            <span className="font-mono text-brand-500 text-sm">
              ₹{(lastCompletedInvoice.invoice.total_paise / 100).toFixed(2)}
            </span>
          </div>

          {whatsAppFeedback && (
            <div
              className={`text-xs px-2.5 py-1.5 rounded-lg border font-bold text-center ${
                whatsAppFeedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}
            >
              {whatsAppFeedback.text}
            </div>
          )}

          {/* Action Buttons: Reprint, WhatsApp, Edit, Delete */}
          <div className="pt-2 pb-1 border-t border-border-subtle/60 grid grid-cols-4 gap-1.5">
            <button
              onClick={handleReprintClick}
              className="py-2 px-1.5 bg-brand-500 hover:bg-brand-600 active:scale-95 text-white rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1 shadow-subtle"
              title="Reprint Thermal Receipt"
            >
              <Printer size={13} />
              Reprint
            </button>
            <button
              onClick={() => handleSendWhatsApp()}
              disabled={isSendingWhatsApp}
              className="py-2 px-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1 shadow-subtle disabled:opacity-50"
              title="Send Bill to Customer via WhatsApp"
            >
              {isSendingWhatsApp ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />}
              WhatsApp
            </button>
            <button
              onClick={() => {
                setEditPassword('');
                setEditError('');
                setShowEditPasswordModal(true);
              }}
              disabled={lastCompletedInvoice.invoice.status === 'void'}
              className="py-2 px-1.5 bg-surface-card hover:bg-amber-950/40 text-amber-400 border border-amber-800/40 active:scale-95 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1 disabled:opacity-40"
              title="Edit Completed Bill (Requires Password)"
            >
              <Edit3 size={13} />
              Edit
            </button>
            <button
              onClick={() => {
                setVoidReason('');
                setVoidError('');
                setShowVoidConfirmModal(true);
              }}
              disabled={lastCompletedInvoice.invoice.status === 'void'}
              className="py-2 px-1.5 bg-surface-card hover:bg-rose-950/40 text-rose-400 border border-rose-800/40 active:scale-95 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1 disabled:opacity-40 shadow-sm"
              title="Void / Delete Completed Bill (Requires Confirmation)"
            >
              <Trash2 size={13} />
              Delete
            </button>
          </div>

          <div className="pt-1 pb-0.5 text-center">
            <button
              type="button"
              onClick={() => handleSendTestHi()}
              disabled={isSendingWhatsApp}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-bold inline-flex items-center gap-1.5 hover:underline transition-all"
              title="Send sample test 'Hi' to customer to verify connectivity"
            >
              <Sparkles size={12} /> Send Sample &apos;Hi&apos; to Customer
            </button>
          </div>
        </div>
      )}

      {renderModals()}
    </div>
  );

  function renderModals() {
    return (
      <>
        {/* Edit Password Modal */}
        {showEditPasswordModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-surface-panel border border-border-subtle rounded-xl p-6 w-full max-w-md shadow-2xl space-y-4">
              <div className="flex items-center gap-2 text-amber-400 border-b border-border-subtle pb-3">
                <Key size={18} />
                <h3 className="font-extrabold text-sm text-text-primary">Manager Password Authorization Required</h3>
              </div>
              <p className="text-xs text-text-muted">
                Enter Admin/Manager password to edit completed Bill{' '}
                <strong className="text-brand-500">
                  #{lastCompletedInvoice?.invoice.invoice_number?.split('_')[0] || lastCompletedInvoice?.invoice.id}
                </strong>
                . This will reopen the bill into the active cart sequence.
              </p>
              {editError && (
                <div className="p-2.5 bg-rose-950/40 border border-rose-800/40 rounded-lg text-xs font-semibold text-rose-400">
                  {editError}
                </div>
              )}
              <input
                type="password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEditBillConfirm()}
                placeholder="Enter password..."
                className="w-full bg-surface-card border border-border-subtle rounded-lg px-3 py-2 text-xs font-mono text-text-primary outline-none focus:border-brand-500"
                autoFocus
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowEditPasswordModal(false);
                    setEditPassword('');
                    setEditError('');
                  }}
                  className="btn-secondary text-xs px-4 py-2"
                >
                  Cancel
                </button>
                <button onClick={handleEditBillConfirm} className="btn-primary text-xs px-4 py-2 font-bold">
                  Authorize & Edit
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete / Void Confirmation Modal */}
        {showVoidConfirmModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-surface-panel border border-rose-900/40 rounded-xl p-6 w-full max-w-md shadow-2xl space-y-4">
              <div className="flex items-center gap-2 text-rose-400 border-b border-border-subtle pb-3">
                <AlertTriangle size={18} />
                <h3 className="font-extrabold text-sm text-text-primary">Confirm Voiding Completed Bill</h3>
              </div>
              <p className="text-xs text-text-muted">
                Are you sure you want to void/delete completed Bill{' '}
                <strong className="text-brand-500">
                  #{lastCompletedInvoice?.invoice.invoice_number?.split('_')[0] || lastCompletedInvoice?.invoice.id}
                </strong>{' '}
                (Total: ₹{((lastCompletedInvoice?.invoice.total_paise ?? 0) / 100).toFixed(2)})? This will reverse stock
                and accounting entries.
              </p>
              {voidError && (
                <div className="p-2.5 bg-rose-950/40 border border-rose-800/40 rounded-lg text-xs font-semibold text-rose-400">
                  {voidError}
                </div>
              )}
              <input
                type="text"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Reason for voiding (optional)..."
                className="w-full bg-surface-card border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-brand-500"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowVoidConfirmModal(false);
                    setVoidReason('');
                    setVoidError('');
                  }}
                  className="btn-secondary text-xs px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  onClick={handleVoidBillConfirm}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all shadow-subtle"
                >
                  Yes, Void Bill
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reprint Choice Modal */}
        {showReprintChoiceModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-surface-panel border border-border-subtle rounded-xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-center">
              <div className="w-12 h-12 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center mx-auto">
                <Printer size={24} />
              </div>
              <h3 className="font-extrabold text-base text-text-primary">Reprint Bill Option</h3>
              <p className="text-xs text-text-muted">
                Would you like to print the most recent completed bill or search for a past bill?
              </p>

              <div className="space-y-2 pt-2">
                <button
                  onClick={() => {
                    setShowReprintChoiceModal(false);
                    handlePrintLastReceipt();
                  }}
                  className="btn-primary w-full py-2.5 text-xs font-black shadow-subtle flex items-center justify-center gap-2"
                >
                  <Printer size={14} /> Print Last Bill (
                  {lastCompletedInvoice?.invoice.invoice_number?.split('_')[0] || `#${lastCompletedInvoice?.invoice.id}`})
                </button>
                <button
                  onClick={() => {
                    setShowReprintChoiceModal(false);
                    setShowReprintLookupModal(true);
                  }}
                  className="btn-secondary w-full py-2.5 text-xs font-bold flex items-center justify-center gap-2"
                >
                  <Search size={14} /> Find Another Bill
                </button>
              </div>

              <button
                onClick={() => setShowReprintChoiceModal(false)}
                className="text-[11px] text-text-muted hover:text-text-primary pt-2 block mx-auto font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Searchable Bill Lookup Modal */}
        {showReprintLookupModal && (
          <ReprintLookupModal
            onClose={() => setShowReprintLookupModal(false)}
            onPrintReceipt={handlePrintReceiptById}
          />
        )}

        {/* WhatsApp Phone Prompt Modal */}
        {lastCompletedInvoice && (
          <WhatsAppPhoneModal
            isOpen={showWhatsAppPhoneModal}
            invoiceId={lastCompletedInvoice.invoice.id}
            invoiceNumber={lastCompletedInvoice.invoice.invoice_number}
            customerId={lastCompletedInvoice.invoice.customer_id}
            customerName={lastCompletedInvoice.customer?.name}
            initialPhone={lastCompletedInvoice.customer?.whatsapp || lastCompletedInvoice.customer?.phone || ''}
            onClose={() => setShowWhatsAppPhoneModal(false)}
            onSuccess={() => {
              setWhatsAppFeedback({ type: 'success', text: '✓ Bill queued for WhatsApp delivery!' });
              setTimeout(() => setWhatsAppFeedback(null), 5000);
            }}
          />
        )}
      </>
    );
  }
}

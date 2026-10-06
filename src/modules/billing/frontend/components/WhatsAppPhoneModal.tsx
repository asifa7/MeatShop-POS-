import React, { useState, useEffect } from 'react';
import { Phone, X, Send, Check, Sparkles } from 'lucide-react';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';

export interface WhatsAppPhoneModalProps {
  isOpen: boolean;
  invoiceId: number;
  invoiceNumber?: string | null;
  customerId?: number | null;
  customerName?: string | null;
  initialPhone?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export const WhatsAppPhoneModal: React.FC<WhatsAppPhoneModalProps> = ({
  isOpen,
  invoiceId,
  invoiceNumber,
  customerId,
  customerName,
  initialPhone = '',
  onClose,
  onSuccess,
}) => {
  const [phone, setPhone] = useState(initialPhone);
  const [saveToProfile, setSaveToProfile] = useState(Boolean(customerId));
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testSuccessMessage, setTestSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPhone(initialPhone ? initialPhone.replace(/^91/, '') : '');
      setSaveToProfile(Boolean(customerId));
      setError(null);
      setTestSuccessMessage(null);
      setIsSending(false);
    }
  }, [isOpen, initialPhone, customerId]);

  if (!isOpen) return null;

  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const isValid = cleanPhone.length === 10;

  const handleSendTestHi = async () => {
    if (!isValid || isSending) return;
    setIsSending(true);
    setError(null);
    setTestSuccessMessage(null);

    try {
      const fullPhone = `91${cleanPhone}`;
      const res = await window.api.invoke(IPC_CHANNELS.WHATSAPP.SEND_MESSAGE, {
        phone: fullPhone,
        message: 'Hi! This is a test message from POS software. WhatsApp connectivity is working successfully! 👍',
      });

      if (res && res.success) {
        setTestSuccessMessage(`✓ Sample "Hi" message sent to +${fullPhone}!`);
      } else if (res && res.notLoggedIn) {
        setError('⚠️ WhatsApp is not linked. Please scan the QR code in the WhatsApp tab once.');
      } else {
        setError(res?.failureReason || 'Failed to send test message');
      }
    } catch (err: any) {
      setError(err?.message || 'Error sending test message');
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSending) return;

    setIsSending(true);
    setError(null);
    setTestSuccessMessage(null);

    try {
      const fullPhone = `91${cleanPhone}`;

      // Optionally save to customer profile if linked
      if (saveToProfile && customerId) {
        try {
          await window.api.invoke(IPC_CHANNELS.CUSTOMERS.UPDATE, {
            id: customerId,
            data: { phone: cleanPhone, whatsapp: fullPhone },
          });
        } catch (updateErr) {
          console.warn('Could not update customer profile with new phone', updateErr);
        }
      }

      // Send WhatsApp bill directly in background
      const result = await window.api.invoke(IPC_CHANNELS.BILLING.SEND_WHATSAPP_BILL, {
        invoice_id: invoiceId,
        customPhone: fullPhone,
      });

      if (!result?.success) {
        setError(result?.failureReason || 'Failed to send WhatsApp bill');
        setIsSending(false);
        return;
      }

      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error sending bill via WhatsApp');
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden p-6 text-white">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Send Bill via WhatsApp</h3>
              <p className="text-xs text-zinc-400">
                {invoiceNumber ? `Bill #${invoiceNumber}` : `Invoice #${invoiceId}`}
                {customerName ? ` • ${customerName}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Customer WhatsApp / Mobile Number
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-sm font-semibold text-zinc-400 select-none">
                +91
              </span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                placeholder="9876543210"
                autoFocus
                disabled={isSending}
                className="w-full pl-12 pr-4 py-2.5 bg-zinc-800/80 border border-zinc-700 rounded-xl text-white text-sm font-mono tracking-wider placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
              />
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-400">
              Enter 10-digit Indian mobile number. Receipt PNG and caption will be sent automatically.
            </p>
          </div>

          {Boolean(customerId) && (
            <label className="flex items-center gap-2.5 cursor-pointer select-none text-xs text-zinc-300 hover:text-white">
              <input
                type="checkbox"
                checked={saveToProfile}
                onChange={(e) => setSaveToProfile(e.target.checked)}
                disabled={isSending}
                className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-emerald-500/20"
              />
              <span>Save this mobile number to customer profile</span>
            </label>
          )}

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 font-medium">
              {error}
            </div>
          )}

          {testSuccessMessage && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 font-bold flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{testSuccessMessage}</span>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={!isValid || isSending}
              onClick={handleSendTestHi}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-400 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/60 disabled:opacity-50 disabled:pointer-events-none rounded-xl transition-colors"
              title="Send sample test 'Hi' message to verify connection first"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Send Test &apos;Hi&apos;
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSending}
                className="px-3.5 py-2 text-xs font-medium text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isValid || isSending}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 disabled:pointer-events-none rounded-xl transition-colors shadow-lg shadow-emerald-500/20"
              >
                {isSending ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Send Bill
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { Truck, X, ArrowRight, User, Phone, MapPin } from 'lucide-react';
import type { InvoiceDetail } from '../../../billing/types/billing.types';

interface HomeDeliveryPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: InvoiceDetail | null;
  onSaveTicket: (details: { customerName: string; customerPhone: string; address: string }) => void;
  onSkipTicket: () => void;
}

export const HomeDeliveryPromptModal: React.FC<HomeDeliveryPromptModalProps> = ({
  isOpen,
  onClose,
  invoice,
  onSaveTicket,
  onSkipTicket,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setPhone('');
      setAddress('');
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen || !invoice) return null;

  const invNo = invoice.invoice.invoice_number?.split('_')[0] || `#${invoice.invoice.id}`;
  const totalAmount = ((invoice.invoice.total_paise || 0) / 100).toFixed(2);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveTicket({
      customerName: name.trim(),
      customerPhone: phone.trim(),
      address: address.trim(),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-surface-panel border border-brand-500/30 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 bg-surface-card/80 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-500">
              <Truck size={17} />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-text-primary">
                Enter customer name + mobile for delivery
              </h3>
              <p className="text-[11px] text-text-muted">
                Bill <span className="text-brand-500 font-mono font-bold">{invNo}</span> • Total ₹{totalAmount}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text-primary rounded-lg hover:bg-surface-hover cursor-pointer"
            title="Cancel"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-4 space-y-3.5">
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-text-muted mb-1 flex items-center gap-1">
              <User size={11} /> Customer Name
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rahul Sharma"
              className="w-full bg-surface-app border border-border-subtle rounded-xl px-3 py-2 text-xs font-semibold text-text-primary outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-text-muted mb-1 flex items-center gap-1">
              <Phone size={11} /> Customer Mobile
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 9845012345"
              className="w-full bg-surface-app border border-border-subtle rounded-xl px-3 py-2 text-xs font-mono font-semibold text-text-primary outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-text-muted mb-1 flex items-center gap-1">
              <MapPin size={11} /> Delivery Address (if given)
            </label>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Door / Flat No, Street, Area, Landmark (optional)"
              className="w-full bg-surface-app border border-border-subtle rounded-xl px-3 py-2 text-xs font-semibold text-text-primary outline-none focus:border-brand-500 resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col gap-2">
            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-black transition-all shadow-subtle flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <Truck size={14} />
              <span>Save & Create Ticket</span>
            </button>

            <button
              type="button"
              onClick={onSkipTicket}
              className="w-full py-2 px-4 bg-surface-card hover:bg-surface-hover text-text-secondary hover:text-text-primary border border-border-subtle rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
              title="Skip contact details — ticket will still be created with blank details"
            >
              <span>Skip (I'll handle it myself)</span>
              <ArrowRight size={13} className="text-text-muted" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
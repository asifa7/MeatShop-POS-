import { useState, useEffect } from 'react';
import { X, AlertTriangle, Trash2, PowerOff } from 'lucide-react';
import type { AdminProduct, AdminProductVariant } from '../../types/products.types';

export type DeactivateTarget =
  | { type: 'product'; item: AdminProduct }
  | { type: 'variant'; item: AdminProductVariant }
  | { type: 'category'; category: string; count: number; activeCount?: number };

interface DeactivateConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  target: DeactivateTarget | null;
  onDeactivate: () => Promise<void>;
  onHardDelete: () => Promise<void>;
}

export default function DeactivateConfirmDialog({
  isOpen, onClose, target, onDeactivate, onHardDelete,
}: DeactivateConfirmDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setError(null);
  }, [isOpen]);

  if (!isOpen || !target) return null;

  const isCategory = target.type === 'category';
  const hasHistory = !isCategory && ('hasInvoiceHistory' in target.item ? target.item.hasInvoiceHistory : false);

  const title = isCategory
    ? `Manage Category: ${target.category}`
    : `Manage Product: ${target.type === 'product' ? target.item.name : target.item.variant_name}`;

  const handleDeactivate = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await onDeactivate();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHardDelete = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await onHardDelete();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-panel border border-border-subtle rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border-subtle bg-surface-card/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h2 className="font-extrabold text-sm text-text-primary">
                {title}
              </h2>
              <p className="text-[11px] text-text-muted mt-0.5">
                {isCategory
                  ? `Applies to all ${target.count} products in "${target.category}"`
                  : 'Choose between safe deactivation or permanent deletion'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-card text-text-muted hover:text-text-secondary transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {isCategory ? (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <PowerOff size={14} /> Option 1: Deactivate Category
                </p>
                <p className="text-text-secondary leading-relaxed">
                  Deactivates all <strong>{target.count}</strong> products in <strong>"{target.category}"</strong>. They will no longer appear on the billing screen, but all historical bills, inventory, and sales records are completely preserved.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <Trash2 size={14} /> Option 2: Delete Category Permanently
                </p>
                <p className="text-text-secondary leading-relaxed">
                  Permanently deletes all <strong>{target.count}</strong> products in <strong>"{target.category}"</strong> and purges their data. <strong className="text-rose-400">This action cannot be undone.</strong>
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-text-secondary leading-relaxed">
                You are managing{' '}
                <strong className="text-text-primary">
                  {target.type === 'product' ? target.item.name : target.item.variant_name}
                </strong>
                {target.type === 'product' && target.item.product_code && (
                  <span className="font-mono ml-1 text-brand-500 font-bold">
                    (#{target.item.product_code})
                  </span>
                )}.
              </p>

              {hasHistory ? (
                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/25 text-xs text-blue-300">
                  <p className="font-bold mb-1">Notice: Invoice History Present</p>
                  <p className="text-text-secondary leading-relaxed">
                    This product has recorded billing invoices. <strong>Deactivating</strong> is recommended to preserve accounting history, but you can also <strong>permanently delete</strong> it if you wish to purge this product and its records completely.
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-surface-card border border-border-subtle text-xs text-text-secondary">
                  This product has no billing history and can be safely deactivated or permanently removed.
                </div>
              )}

              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-400 font-medium">
                ⚠ Permanent deletion immediately removes this product and cannot be undone.
              </div>
            </div>
          )}

          {error && (
            <div className="px-3.5 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-400 font-medium">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border-subtle bg-surface-card/30 flex flex-wrap gap-2.5 justify-end">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl border border-border-subtle text-xs font-bold text-text-secondary hover:bg-surface-card transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            onClick={handleDeactivate}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all shadow-sm disabled:opacity-50"
          >
            <PowerOff size={14} />
            <span>{isCategory ? `Deactivate Category (${target.count})` : 'Deactivate'}</span>
          </button>

          {/* Delete Permanently is ALWAYS visible and functional */}
          <button
            onClick={handleHardDelete}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-sm disabled:opacity-50"
          >
            <Trash2 size={14} />
            <span>{isCategory ? `Delete Category Permanently` : 'Delete Permanently'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

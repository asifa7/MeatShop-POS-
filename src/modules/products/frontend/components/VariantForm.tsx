import { useState, useEffect } from 'react';
import { X, Tag, IndianRupee } from 'lucide-react';
import { rupeesToPaise } from '../../../../core/shared/math';
import { formatPaise } from '../../../billing/frontend/types/billing.types';
import type { AdminProduct, AdminProductVariant } from '../../types/products.types';
import { useCreateVariant, useUpdateVariantRate, useUpdateVariantName } from '../hooks/useProductMutations';

interface VariantFormProps {
  isOpen: boolean;
  onClose: () => void;
  parentProduct: AdminProduct | null;
  editTarget?: AdminProductVariant | null; // if set → rate-change mode
  allProducts?: AdminProduct[];
}

type Mode = 'create' | 'edit-name' | 'edit-rate';

export default function VariantForm({ isOpen, onClose, parentProduct, editTarget }: VariantFormProps) {
  const mode: Mode = !editTarget ? 'create' : 'edit-name';

  const createVariant = useCreateVariant();
  const updateRate = useUpdateVariantRate();
  const updateName = useUpdateVariantName();

  const [variantName, setVariantName] = useState('');
  const [rateRupees, setRateRupees] = useState('');
  const [costRupees, setCostRupees] = useState('');
  const [barcode, setBarcode] = useState('');
  const [activeMode, setActiveMode] = useState<Mode>(mode);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setConfirmed(false);
      setActiveMode(!editTarget ? 'create' : 'edit-name');
      if (editTarget) {
        setVariantName(editTarget.variant_name);
        setRateRupees((editTarget.current_rate_paise_per_unit / 100).toFixed(2));
        setCostRupees(editTarget.cost_price_paise_per_unit ? (editTarget.cost_price_paise_per_unit / 100).toFixed(2) : '');
        setBarcode(editTarget.barcode || '');
      } else {
        setVariantName('');
        setRateRupees('');
        setCostRupees('');
        setBarcode('');
      }
    }
  }, [isOpen, editTarget]);

  if (!isOpen || !parentProduct) return null;

  const isPending = createVariant.isPending || updateRate.isPending || updateName.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const rateFloat = parseFloat(rateRupees);
    if (activeMode !== 'edit-name' && (isNaN(rateFloat) || rateFloat <= 0)) {
      setError('Please enter a valid positive rate in Rupees.');
      return;
    }
    if (activeMode === 'edit-rate' && !confirmed) {
      setError('Please confirm the rate change before saving.');
      return;
    }

    const ratePaise = rupeesToPaise(rateFloat); // shared util — never inline multiply

    const costFloat = parseFloat(costRupees);
    const costPaise = !isNaN(costFloat) && costFloat >= 0 ? rupeesToPaise(costFloat) : 0;

    try {
      if (activeMode === 'create') {
        await createVariant.mutateAsync({
          product_id: parentProduct.id,
          variant_name: variantName,
          rate_paise: ratePaise,
          cost_price_paise: costPaise,
          barcode: barcode.trim() || undefined,
        });
      } else if (activeMode === 'edit-rate' && editTarget) {
        await updateRate.mutateAsync({ variant_id: editTarget.id, new_rate_paise: ratePaise });
      } else if (activeMode === 'edit-name' && editTarget) {
        await updateName.mutateAsync({ variant_id: editTarget.id, variant_name: variantName });
      }
      onClose();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const currentPaise = editTarget?.current_rate_paise_per_unit ?? 0;
  const newPaise = rupeesToPaise(parseFloat(rateRupees) || 0);
  const rateChanged = editTarget && newPaise !== currentPaise && rateRupees !== '';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-panel border border-border-subtle rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center">
              <Tag size={18} className="text-accent" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-text-secondary">
                {activeMode === 'create' ? 'Add Variant' : 'Edit Variant'}
              </h2>
              <p className="text-[11px] text-text-muted">{parentProduct.name} · {parentProduct.category}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-card text-text-muted hover:text-text-secondary transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Mode tabs — only for edit */}
        {editTarget && (
          <div className="flex gap-1 p-4 pb-0 overflow-x-auto hide-scrollbar">
            {(['edit-name', 'edit-rate'] as Mode[]).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { setActiveMode(m); setError(null); setConfirmed(false); }}
                className={`flex-none px-4 py-2 rounded-lg text-[11px] font-bold transition-colors border ${
                  activeMode === m
                    ? 'bg-accent/15 border-accent/40 text-accent'
                    : 'bg-surface-app border-border-subtle text-text-muted hover:text-text-secondary'
                }`}
              >
                {m === 'edit-name' ? 'Rename' : 'Rate'}
              </button>
            ))}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name field */}
          {(activeMode === 'create' || activeMode === 'edit-name') && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Variant Name *</label>
              <input
                type="text"
                value={variantName}
                onChange={e => setVariantName(e.target.value)}
                placeholder="e.g. With Skin, Boneless, Medium Size..."
                required={activeMode === 'create' || activeMode === 'edit-name'}
                className="w-full bg-surface-app border border-border-subtle rounded-xl px-3 py-2.5 text-xs font-semibold text-text-secondary placeholder-text-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
            </div>
          )}

          {/* Barcode / SKU Field */}
          {activeMode === 'create' && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Barcode / SKU (Optional)</label>
              <input
                type="text"
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                placeholder="e.g. 8901234567890 or SKU-VAR-001"
                className="w-full bg-surface-app border border-border-subtle rounded-xl px-3 py-2 text-xs font-mono font-semibold text-text-secondary placeholder-text-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
            </div>
          )}

          {/* Rate & Cost Price fields */}
          {(activeMode === 'create' || activeMode === 'edit-rate') && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                  {activeMode === 'edit-rate' ? 'Selling Rate (₹)' : 'Selling Rate (₹) *'}
                </label>
                <div className="relative">
                  <IndianRupee size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="number"
                    value={rateRupees}
                    onChange={e => { setRateRupees(e.target.value); setConfirmed(false); }}
                    placeholder="0.00"
                    step="0.01"
                    min="0.01"
                    required={activeMode === 'create' || activeMode === 'edit-rate'}
                    className="w-full bg-surface-app border border-border-subtle rounded-xl pl-8 pr-3 py-2.5 text-xs font-semibold text-text-secondary placeholder-text-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                  Initial Cost (₹) (Est.)
                </label>
                <div className="relative">
                  <IndianRupee size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="number"
                    value={costRupees}
                    onChange={e => setCostRupees(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="w-full bg-surface-app border border-border-subtle rounded-xl pl-8 pr-3 py-2.5 text-xs font-semibold text-text-secondary placeholder-text-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors font-mono"
                  />
                </div>
                <p className="text-[10px] text-text-muted">
                  Initial baseline before purchase history exists; auto-superseded by weighted average cost.
                </p>
              </div>
            </div>
          )}


          {/* Rate-change confirmation */}
          {activeMode === 'edit-rate' && rateChanged && (
            <label className="flex items-start gap-2.5 cursor-pointer p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                className="mt-0.5 accent-accent"
              />
              <span className="text-[11px] text-amber-300 font-medium leading-relaxed">
                I confirm changing the rate from <strong>{formatPaise(currentPaise)}</strong> to <strong>{formatPaise(newPaise)}</strong>.
                A new row will be written to rate history. Past invoices are unaffected.
              </span>
            </label>
          )}

          {error && (
            <div className="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/25 text-xs text-rose-400">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border-subtle text-xs font-semibold text-text-secondary hover:bg-surface-card transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || (activeMode === 'edit-rate' && !!rateChanged && !confirmed)}
              className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent/90 text-white text-xs font-bold transition-all disabled:opacity-50 shadow-lg shadow-accent/20"
            >
              {isPending ? 'Saving...' : activeMode === 'create' ? 'Add Variant' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

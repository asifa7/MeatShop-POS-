import React, { useState, useMemo } from 'react';
import { X, Snowflake, AlertCircle, CheckCircle2 } from 'lucide-react';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';
import { useActiveRates } from '../../../billing/frontend/hooks/useActiveRates';
import { useStockStatus } from '../hooks/useInventory';
import { formatPaise } from '../../../billing/frontend/types/billing.types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function MoveMuttonToFridgeModal({ isOpen, onClose, onSuccess }: Props) {
  const { data: variants = [] } = useActiveRates();
  const { data: stocks = [] } = useStockStatus();

  // Filter mutton / meat products
  const muttonVariants = useMemo(() => {
    return (variants || []).filter(v => {
      const name = `${v.product_name} ${v.variant_name} ${v.category || ''}`.toLowerCase();
      return name.includes('mutton') || name.includes('lamb') || name.includes('goat') || name.includes('meat');
    });
  }, [variants]);

  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [itemName, setItemName] = useState<string>('');
  const [itemType, setItemType] = useState<'leg' | 'brain' | 'head' | 'liver' | 'meat' | 'custom'>('meat');
  const [quantityKg, setQuantityKg] = useState<string>('');
  const [pieceCount, setPieceCount] = useState<string>('');
  const [sellingPricePerKg, setSellingPricePerKg] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedVariant = variants.find(v => v.id === selectedVariantId);
  const selectedStock = stocks.find(s => s.product_variant_id === selectedVariantId);

  // Auto-set default variant and name
  React.useEffect(() => {
    if (isOpen && muttonVariants.length > 0 && !selectedVariantId) {
      setSelectedVariantId(muttonVariants[0].id);
      setItemName(muttonVariants[0].product_name);
      setSellingPricePerKg(((muttonVariants[0].current_rate_paise_per_unit || 0) / 100).toFixed(2));
    }
  }, [isOpen, muttonVariants, selectedVariantId]);

  if (!isOpen) return null;

  const isWeight = selectedVariant?.unit_type !== 'piece';
  const availableStockKg = ((selectedStock?.quantity_grams || 0) / 1000);
  const availableStockUnits = selectedStock?.quantity_units || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedVariantId) {
      setError('Please select a sellable product variant.');
      return;
    }

    let qtyGrams: number | null = null;
    let countVal: number | null = null;

    if (isWeight) {
      const kg = parseFloat(quantityKg);
      if (isNaN(kg) || kg <= 0) {
        setError('Please enter a valid weight in kg greater than 0.');
        return;
      }
      qtyGrams = Math.round(kg * 1000);
      if (qtyGrams > (selectedStock?.quantity_grams || 0)) {
        setError(`Cannot transfer ${kg.toFixed(2)} kg. Current sellable stock is only ${availableStockKg.toFixed(2)} kg.`);
        return;
      }
    } else {
      const cnt = parseInt(pieceCount, 10);
      if (isNaN(cnt) || cnt <= 0) {
        setError('Please enter a valid piece count greater than 0.');
        return;
      }
      countVal = cnt;
      if (countVal > (selectedStock?.quantity_units || 0)) {
        setError(`Cannot transfer ${cnt} pcs. Current sellable stock is only ${availableStockUnits} pcs.`);
        return;
      }
    }

    const priceNum = parseFloat(sellingPricePerKg);
    const sellingPaise = !isNaN(priceNum) && priceNum >= 0 ? Math.round(priceNum * 100) : (selectedVariant?.current_rate_paise_per_unit || 0);

    try {
      setIsSubmitting(true);
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.MOVE_TO_REFRIGERATOR, {
        product_variant_id: selectedVariantId,
        item_name: itemName.trim() || selectedVariant?.product_name || 'Mutton Item',
        item_type: itemType,
        unit_type: isWeight ? 'weight' : 'piece',
        quantity_grams: qtyGrams,
        count: countVal,
        selling_rate_paise: sellingPaise,
        notes: notes.trim() || undefined,
      });

      if (!res.success) {
        throw new Error(res.error?.message || 'Failed to move to refrigerator');
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error transferring to refrigerator');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-surface-card border border-border-subtle rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-4 border-b border-border-subtle flex items-center justify-between bg-surface-panel">
          <div className="flex items-center gap-2 text-blue-400 font-bold">
            <Snowflake size={18} />
            <span>Move Mutton to Refrigerator Stock</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-surface-hover rounded-lg text-text-muted hover:text-text-primary cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-text-secondary uppercase mb-1">
              Source Sellable Mutton Product *
            </label>
            <select
              value={selectedVariantId || ''}
              onChange={e => {
                const id = Number(e.target.value);
                setSelectedVariantId(id);
                const found = variants.find(v => v.id === id);
                if (found) {
                  setItemName(found.product_name);
                  setSellingPricePerKg(((found.current_rate_paise_per_unit || 0) / 100).toFixed(2));
                }
              }}
              className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary outline-none focus:border-brand-500 font-semibold cursor-pointer"
              required
            >
              {muttonVariants.map(v => (
                <option key={v.id} value={v.id}>
                  {v.product_name} - {v.variant_name} ({formatPaise(v.current_rate_paise_per_unit)}/kg)
                </option>
              ))}
            </select>
          </div>

          <div className="bg-surface-panel p-3 rounded-xl border border-border-subtle flex items-center justify-between text-xs">
            <span className="text-text-muted font-bold">Available in Sellable Stock:</span>
            <span className="font-mono font-black text-emerald-400">
              {isWeight ? `${availableStockKg.toFixed(2)} kg` : `${availableStockUnits} pcs`}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-text-secondary uppercase mb-1">
                Custom Label / Name
              </label>
              <input
                type="text"
                value={itemName}
                onChange={e => setItemName(e.target.value)}
                placeholder="e.g. Mutton Leg Front"
                className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary outline-none focus:border-brand-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-text-secondary uppercase mb-1">
                Category / Type
              </label>
              <select
                value={itemType}
                onChange={e => setItemType(e.target.value as any)}
                className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary outline-none focus:border-brand-500 cursor-pointer"
              >
                <option value="leg">Leg / Paya</option>
                <option value="meat">Meat / Cuts</option>
                <option value="liver">Liver / Kaleji</option>
                <option value="brain">Brain / Bheja</option>
                <option value="head">Head / Mutton Head</option>
                <option value="custom">Custom Portion</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-text-secondary uppercase mb-1">
                {isWeight ? 'Weight to Freeze (kg) *' : 'Quantity (pcs) *'}
              </label>
              <input
                type="number"
                step={isWeight ? '0.01' : '1'}
                min="0.01"
                value={isWeight ? quantityKg : pieceCount}
                onChange={e => isWeight ? setQuantityKg(e.target.value) : setPieceCount(e.target.value)}
                placeholder={isWeight ? 'e.g. 5.50' : 'e.g. 2'}
                className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-sm font-mono font-bold text-text-primary outline-none focus:border-blue-500"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-text-secondary uppercase mb-1">
                Selling Rate (₹ / {isWeight ? 'kg' : 'pc'})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={sellingPricePerKg}
                onChange={e => setSellingPricePerKg(e.target.value)}
                placeholder="e.g. 850"
                className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-sm font-mono font-bold text-text-primary outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-text-secondary uppercase mb-1">
              Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Wrapped in tray, stored in deep freezer B"
              className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary outline-none focus:border-brand-500"
            />
          </div>

          {error && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/40 rounded-xl text-xs font-bold text-rose-300 flex items-start gap-2">
              <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-bold text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 transition-all shadow-subtle flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 size={14} />
              <span>{isSubmitting ? 'Transferring...' : 'Transfer to Fridge'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

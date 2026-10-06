import React, { useState, useMemo, useEffect } from 'react';
import { X, Zap, AlertCircle, CheckCircle2, Scale, Bird, DollarSign } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';
import { useActiveRates } from '../../../billing/frontend/hooks/useActiveRates';
import { formatPaise } from '../../../billing/frontend/types/billing.types';

export interface LiveChickenBatch {
  id: number;
  batch_number: string;
  supplier_id?: number | null;
  supplier_name?: string | null;
  purchase_date: string;
  cost_per_kg_paise: number;
  initial_weight_grams: number;
  initial_count: number;
  remaining_weight_grams: number;
  remaining_count: number;
  status: 'active' | 'exhausted' | 'adjusted';
  notes?: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  batch: LiveChickenBatch | null;
  onSuccess?: () => void;
}

export default function ProcessLiveChickenModal({ isOpen, onClose, batch, onSuccess }: Props) {
  const { data: variants = [] } = useActiveRates();

  // Load meat yield config
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => window.api.invoke(IPC_CHANNELS.CONFIG.GET).then((res: any) => res.data),
    enabled: isOpen,
  });

  const defaultRatio = config?.meatYield?.defaultChickenYieldRatio || 1.60;

  // Form State
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [processedWeightKg, setProcessedWeightKg] = useState<string>('');
  const [yieldRatio, setYieldRatio] = useState<string>(String(defaultRatio));
  const [birdCount, setBirdCount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setYieldRatio(String(defaultRatio));
      setProcessedWeightKg('');
      setBirdCount('');
      setNotes('');
      setError(null);
    }
  }, [isOpen, defaultRatio]);

  // Filter chicken variants that can receive processed meat
  const chickenVariants = useMemo(() => {
    return (variants || []).filter(v => {
      const name = `${v.product_name} ${v.variant_name} ${v.category || ''}`.toLowerCase();
      return name.includes('chicken') && v.unit_type !== 'live_dual';
    });
  }, [variants]);

  useEffect(() => {
    if (chickenVariants.length > 0 && !selectedVariantId) {
      setSelectedVariantId(chickenVariants[0].id);
    }
  }, [chickenVariants, selectedVariantId]);

  if (!isOpen || !batch) return null;

  // Single direction calculation:
  // User enters processed meat weight desired -> Live weight required is calculated
  const processedKg = parseFloat(processedWeightKg) || 0;
  const ratio = parseFloat(yieldRatio) || defaultRatio;
  const calculatedLiveKg = processedKg * ratio;
  const calculatedLiveGrams = Math.round(calculatedLiveKg * 1000);
  const processedGrams = Math.round(processedKg * 1000);

  // Cost calculation
  const liveCostPaise = batch.cost_per_kg_paise > 0
    ? Math.round((batch.cost_per_kg_paise / 1000) * calculatedLiveGrams)
    : 0;

  const costPerGramProcessed = processedGrams > 0 ? liveCostPaise / processedGrams : 0;
  const processedCostPerKgPaise = Math.round(costPerGramProcessed * 1000);

  // Insufficient check
  const isOverRemaining = calculatedLiveGrams > batch.remaining_weight_grams;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedVariantId) {
      setError('Please select a target processed chicken variant.');
      return;
    }

    if (processedKg <= 0) {
      setError('Please enter a valid processed output weight greater than 0.');
      return;
    }

    if (ratio <= 0) {
      setError('Yield ratio must be greater than 0.');
      return;
    }

    if (isOverRemaining) {
      setError(
        `Insufficient live bird stock. Processing requires ${(calculatedLiveGrams / 1000).toFixed(2)} kg, but batch #${batch.batch_number} only has ${(batch.remaining_weight_grams / 1000).toFixed(2)} kg remaining.`
      );
      return;
    }

    const countNum = parseInt(birdCount, 10);
    const finalCount = !isNaN(countNum) && countNum > 0 ? countNum : Math.max(1, Math.round(calculatedLiveKg / 1.6));

    if (finalCount > batch.remaining_count) {
      setError(`Cannot consume ${finalCount} birds. Batch only has ${batch.remaining_count} birds remaining.`);
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.PROCESS_LIVE_CHICKEN, {
        batch_id: batch.id,
        live_weight_grams: calculatedLiveGrams,
        live_count: finalCount,
        processed_variant_id: selectedVariantId,
        processed_weight_grams: processedGrams,
        yield_ratio_used: ratio,
        notes: notes || undefined,
      });

      if (!res.success) {
        throw new Error(res.error?.message || 'Failed to process live chicken');
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error processing live chicken');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-surface-card border border-border-subtle rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-border-subtle flex items-center justify-between bg-surface-panel">
          <div className="flex items-center gap-2 text-brand-500 font-bold">
            <Zap size={18} />
            <span>Process Live Chicken into Sellable Stock</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-surface-hover rounded-lg text-text-muted hover:text-text-primary cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Source Live Batch Info Box */}
          <div className="bg-surface-panel p-3.5 rounded-xl border border-border-subtle space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                <Bird size={14} className="text-amber-400" />
                <span>Live Batch #{batch.batch_number}</span>
              </span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-surface-card border border-border-subtle text-text-muted">
                Cost: {formatPaise(batch.cost_per_kg_paise)} / kg
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border-subtle/50">
              <div>
                <span className="text-[10px] text-text-muted uppercase font-bold block">Available Weight</span>
                <span className="text-emerald-400 font-bold font-mono text-sm">
                  {(batch.remaining_weight_grams / 1000).toFixed(2)} kg
                </span>
              </div>
              <div>
                <span className="text-[10px] text-text-muted uppercase font-bold block">Available Birds</span>
                <span className="text-emerald-400 font-bold font-mono text-sm">
                  {batch.remaining_count} birds
                </span>
              </div>
            </div>
          </div>

          {/* Target Variant Selection */}
          <div>
            <label className="block text-xs font-bold text-text-secondary uppercase mb-1">
              Target Sellable Cut / Product *
            </label>
            <select
              value={selectedVariantId || ''}
              onChange={e => setSelectedVariantId(Number(e.target.value))}
              className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary outline-none focus:border-brand-500 font-semibold cursor-pointer"
              required
            >
              {chickenVariants.map(v => (
                <option key={v.id} value={v.id}>
                  {v.product_name} - {v.variant_name} ({formatPaise(v.current_rate_paise_per_unit)}/kg)
                </option>
              ))}
            </select>
          </div>

          {/* Single-Direction Calculation Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-text-secondary uppercase mb-1">
                Processed Meat Output (kg) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={processedWeightKg}
                  onChange={e => setProcessedWeightKg(e.target.value)}
                  placeholder="e.g. 10.0"
                  className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-sm font-mono font-bold text-text-primary outline-none focus:border-brand-500"
                  required
                  autoFocus
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-text-muted">kg</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-text-secondary uppercase mb-1">
                Yield Ratio (Live/Processed)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.1"
                value={yieldRatio}
                onChange={e => setYieldRatio(e.target.value)}
                placeholder="1.60"
                className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-sm font-mono font-bold text-text-primary outline-none focus:border-brand-500"
                required
              />
            </div>
          </div>

          {/* Auto Calculated Live Weight & Cost Box */}
          <div className={`p-3.5 rounded-xl border space-y-2 transition-all ${
            isOverRemaining ? 'bg-rose-950/20 border-rose-800/50' : 'bg-surface-panel border-border-subtle'
          }`}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted font-bold flex items-center gap-1">
                <Scale size={13} className="text-brand-500" />
                <span>Calculated Live Bird Weight Required:</span>
              </span>
              <span className={`font-mono font-black text-sm ${isOverRemaining ? 'text-rose-400' : 'text-text-primary'}`}>
                {calculatedLiveKg.toFixed(2)} kg
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted font-bold flex items-center gap-1">
                <DollarSign size={13} className="text-emerald-400" />
                <span>Propagated Processed Cost:</span>
              </span>
              <span className="font-mono font-black text-sm text-emerald-400">
                {formatPaise(processedCostPerKgPaise)} / kg
              </span>
            </div>

            {isOverRemaining && (
              <p className="text-[11px] font-bold text-rose-400 flex items-center gap-1 pt-1">
                <AlertCircle size={12} />
                Exceeds remaining batch weight ({(batch.remaining_weight_grams / 1000).toFixed(2)} kg available)!
              </p>
            )}
          </div>

          {/* Birds Consumed & Notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-text-secondary uppercase mb-1">
                Birds Consumed (Count)
              </label>
              <input
                type="number"
                min="1"
                value={birdCount}
                onChange={e => setBirdCount(e.target.value)}
                placeholder={`Est. ${Math.max(1, Math.round(calculatedLiveKg / 1.6))}`}
                className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-sm font-mono font-bold text-text-primary outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-text-secondary uppercase mb-1">
                Notes (Optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Morning batch cutting"
                className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/40 rounded-xl text-xs font-bold text-rose-300 flex items-start gap-2">
              <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Footer Actions */}
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
              disabled={isSubmitting || isOverRemaining || processedKg <= 0}
              className="px-5 py-2.5 rounded-xl text-xs font-extrabold text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-40 transition-all shadow-subtle flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 size={14} />
              <span>{isSubmitting ? 'Processing...' : 'Complete Processing Run'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

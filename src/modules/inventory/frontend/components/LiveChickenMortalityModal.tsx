import React, { useState } from 'react';
import { X, Bird, AlertCircle, CheckCircle2 } from 'lucide-react';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';
import type { LiveChickenBatch } from './ProcessLiveChickenModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  batch: LiveChickenBatch | null;
  onSuccess?: () => void;
}

export default function LiveChickenMortalityModal({ isOpen, onClose, batch, onSuccess }: Props) {
  const [deadCount, setDeadCount] = useState<string>('');
  const [weightLossKg, setWeightLossKg] = useState<string>('');
  const [reason, setReason] = useState<string>('Transit / Pen Mortality');
  const [customReason, setCustomReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !batch) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const countNum = parseInt(deadCount, 10);
    const weightNum = parseFloat(weightLossKg);

    if (isNaN(countNum) || countNum <= 0) {
      setError('Please enter a valid dead bird count greater than 0.');
      return;
    }

    if (countNum > batch.remaining_count) {
      setError(`Cannot log ${countNum} dead birds. Only ${batch.remaining_count} birds remain in batch.`);
      return;
    }

    const estimatedWeightGrams = !isNaN(weightNum) && weightNum > 0
      ? Math.round(weightNum * 1000)
      : Math.round(countNum * ((batch.remaining_weight_grams || 1600) / (batch.remaining_count || 1)));

    if (estimatedWeightGrams > batch.remaining_weight_grams) {
      setError(
        `Weight loss (${(estimatedWeightGrams / 1000).toFixed(2)} kg) exceeds remaining batch weight (${(batch.remaining_weight_grams / 1000).toFixed(2)} kg).`
      );
      return;
    }

    const finalReason = reason === 'Other' ? customReason.trim() || 'Unspecified mortality' : reason;

    try {
      setIsSubmitting(true);
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.LOG_LIVE_CHICKEN_MORTALITY, {
        batch_id: batch.id,
        dead_count: countNum,
        weight_loss_grams: estimatedWeightGrams,
        reason: finalReason,
      });

      if (!res.success) {
        throw new Error(res.error?.message || 'Failed to log mortality');
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error recording mortality');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-surface-card border border-border-subtle rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-4 border-b border-border-subtle flex items-center justify-between bg-surface-panel">
          <div className="flex items-center gap-2 text-rose-400 font-bold">
            <Bird size={18} />
            <span>Log Live Bird Mortality / Loss</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-surface-hover rounded-lg text-text-muted hover:text-text-primary cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-surface-panel p-3 rounded-xl border border-border-subtle text-xs space-y-1">
            <span className="font-bold text-text-primary">Batch #{batch.batch_number}</span>
            <div className="flex items-center justify-between text-text-muted">
              <span>Available Birds: <strong className="text-emerald-400 font-mono">{batch.remaining_count} birds</strong></span>
              <span>Available Weight: <strong className="text-emerald-400 font-mono">{(batch.remaining_weight_grams / 1000).toFixed(2)} kg</strong></span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-text-secondary uppercase mb-1">
              Dead Bird Count *
            </label>
            <input
              type="number"
              min="1"
              max={batch.remaining_count}
              value={deadCount}
              onChange={e => {
                setDeadCount(e.target.value);
                const cnt = parseInt(e.target.value, 10);
                if (!isNaN(cnt) && cnt > 0 && batch.remaining_count > 0) {
                  const avgWeightGrams = batch.remaining_weight_grams / batch.remaining_count;
                  setWeightLossKg(((cnt * avgWeightGrams) / 1000).toFixed(2));
                }
              }}
              placeholder={`Max: ${batch.remaining_count}`}
              className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-text-primary outline-none focus:border-rose-500"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-text-secondary uppercase mb-1">
              Estimated Weight Loss (kg) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={weightLossKg}
              onChange={e => setWeightLossKg(e.target.value)}
              placeholder="e.g. 1.60"
              className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-text-primary outline-none focus:border-rose-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-text-secondary uppercase mb-1">
              Reason / Cause *
            </label>
            <select
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary outline-none focus:border-brand-500 mb-2 cursor-pointer"
            >
              <option value="Transit / Pen Mortality">Transit / Pen Mortality</option>
              <option value="Heat Stress / Suffocation">Heat Stress / Suffocation</option>
              <option value="Disease / Sickness">Disease / Sickness</option>
              <option value="Escaped / Missing">Escaped / Missing</option>
              <option value="Other">Other (Custom Note)</option>
            </select>

            {reason === 'Other' && (
              <input
                type="text"
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
                placeholder="Enter specific cause..."
                required
                className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary outline-none focus:border-brand-500"
              />
            )}
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
              className="px-5 py-2.5 rounded-xl text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40 transition-all shadow-subtle flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 size={14} />
              <span>{isSubmitting ? 'Recording...' : 'Record Mortality Loss'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { X, Edit3, AlertCircle, CheckCircle2 } from 'lucide-react';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';
import type { LiveChickenBatch } from './ProcessLiveChickenModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  batch: LiveChickenBatch | null;
  onSuccess?: () => void;
}

export default function EditLiveChickenBatchModal({ isOpen, onClose, batch, onSuccess }: Props) {
  const [weightKg, setWeightKg] = useState<string>('');
  const [count, setCount] = useState<string>('');
  const [costPerKg, setCostPerKg] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && batch) {
      setWeightKg(((batch.remaining_weight_grams || 0) / 1000).toFixed(2));
      setCount(String(batch.remaining_count || 0));
      setCostPerKg(((batch.cost_per_kg_paise || 0) / 100).toFixed(2));
      setNotes(batch.notes || '');
      setReason('');
      setError(null);
    }
  }, [isOpen, batch]);

  if (!isOpen || !batch) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const wtNum = parseFloat(weightKg);
    const countNum = parseInt(count, 10);
    const costNum = parseFloat(costPerKg);

    if (isNaN(wtNum) || wtNum < 0) {
      setError('Remaining weight must be a valid non-negative number.');
      return;
    }

    if (isNaN(countNum) || countNum < 0) {
      setError('Remaining count must be a valid non-negative integer.');
      return;
    }

    if (!reason.trim()) {
      setError('An audit reason is required for editing a live bird batch.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.EDIT_LIVE_CHICKEN_BATCH, {
        batch_id: batch.id,
        remaining_weight_grams: Math.round(wtNum * 1000),
        remaining_count: countNum,
        cost_per_kg_paise: !isNaN(costNum) && costNum >= 0 ? Math.round(costNum * 100) : undefined,
        notes: notes || undefined,
        reason: reason.trim(),
      });

      if (!res.success) {
        throw new Error(res.error?.message || 'Failed to edit live chicken batch');
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error updating batch');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-surface-card border border-border-subtle rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-4 border-b border-border-subtle flex items-center justify-between bg-surface-panel">
          <div className="flex items-center gap-2 text-text-primary font-bold">
            <Edit3 size={18} className="text-brand-500" />
            <span>Edit Live Bird Batch #{batch.batch_number}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-surface-hover rounded-lg text-text-muted hover:text-text-primary cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-text-secondary uppercase mb-1">
                Remaining Weight (kg) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={weightKg}
                onChange={e => setWeightKg(e.target.value)}
                className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-sm font-mono font-bold text-text-primary outline-none focus:border-brand-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-text-secondary uppercase mb-1">
                Remaining Count (Birds) *
              </label>
              <input
                type="number"
                min="0"
                value={count}
                onChange={e => setCount(e.target.value)}
                className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-sm font-mono font-bold text-text-primary outline-none focus:border-brand-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-text-secondary uppercase mb-1">
              Cost Rate (₹ / kg)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={costPerKg}
              onChange={e => setCostPerKg(e.target.value)}
              className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-sm font-mono font-bold text-text-primary outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-text-secondary uppercase mb-1">
              Audit Reason / Justification *
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Physical recount discrepancy, weighbridge adjustment"
              className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary outline-none focus:border-brand-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-text-secondary uppercase mb-1">
              Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes..."
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
              className="px-5 py-2.5 rounded-xl text-xs font-extrabold text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-40 transition-all shadow-subtle flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 size={14} />
              <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

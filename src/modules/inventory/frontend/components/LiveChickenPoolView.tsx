import { useState } from 'react';
import { Bird, Zap, Edit3, Skull, AlertCircle, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';
import { formatPaise } from '../../../billing/frontend/types/billing.types';
import ProcessLiveChickenModal, { LiveChickenBatch } from './ProcessLiveChickenModal';
import EditLiveChickenBatchModal from './EditLiveChickenBatchModal';
import LiveChickenMortalityModal from './LiveChickenMortalityModal';

export default function LiveChickenPoolView() {
  const [selectedBatch, setSelectedBatch] = useState<LiveChickenBatch | null>(null);
  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isMortalityModalOpen, setIsMortalityModalOpen] = useState(false);

  const { data: batches = [], isLoading, refetch } = useQuery<LiveChickenBatch[]>({
    queryKey: ['live-chicken-batches'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.LIST_LIVE_CHICKEN_BATCHES, {});
      if (!res.success) throw new Error(res.error?.message || 'Failed to load live chicken batches');
      return res.data || [];
    },
    refetchInterval: 15000,
  });

  const activeBatches = batches.filter(b => b.status === 'active' || b.remaining_weight_grams > 0);
  const totalBirds = activeBatches.reduce((acc, b) => acc + (b.remaining_count || 0), 0);
  const totalWeightKg = activeBatches.reduce((acc, b) => acc + ((b.remaining_weight_grams || 0) / 1000), 0);

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Metrics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-surface-card border border-border-subtle p-4 rounded-xl flex items-center gap-3 shadow-subtle">
          <div className="w-10 h-10 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center font-bold">
            <Bird size={20} />
          </div>
          <div>
            <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Live Birds in Shed</span>
            <div className="text-xl font-black font-mono text-amber-400">{totalBirds} birds</div>
          </div>
        </div>

        <div className="bg-surface-card border border-border-subtle p-4 rounded-xl flex items-center gap-3 shadow-subtle">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center font-bold">
            <Bird size={20} />
          </div>
          <div>
            <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Live Weight Available</span>
            <div className="text-xl font-black font-mono text-emerald-400">{totalWeightKg.toFixed(2)} kg</div>
          </div>
        </div>

        <div className="bg-surface-card border border-border-subtle p-4 rounded-xl flex items-center justify-between shadow-subtle">
          <div>
            <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Active Batches</span>
            <div className="text-xl font-black font-mono text-text-primary">{activeBatches.length} batch{activeBatches.length !== 1 ? 'es' : ''}</div>
          </div>
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg bg-surface-panel hover:bg-surface-hover text-text-muted hover:text-text-primary border border-border-subtle cursor-pointer transition-colors"
            title="Refresh Batches"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Batches Table Card */}
      <div className="flex-1 min-h-0 bg-surface-card border border-border-subtle rounded-xl flex flex-col shadow-subtle overflow-hidden">
        <div className="p-3.5 border-b border-border-subtle flex items-center justify-between bg-surface-panel flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bird size={16} className="text-amber-400" />
            <span className="text-xs font-black text-text-primary uppercase tracking-wider">Raw Material Batches (Live Poultry)</span>
          </div>
          <span className="text-[11px] text-text-muted font-bold">
            Live chicken raw inventory does not appear in retail billing until processed.
          </span>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-surface-panel sticky top-0 z-10 border-b border-border-subtle text-[10px] font-black uppercase text-text-muted tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Batch Number</th>
                <th className="py-2.5 px-3">Purchase Date</th>
                <th className="py-2.5 px-3 text-right">Initial Count / Weight</th>
                <th className="py-2.5 px-3 text-right">Available Birds</th>
                <th className="py-2.5 px-3 text-right">Available Weight</th>
                <th className="py-2.5 px-3 text-right">Cost / kg</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle/50 font-medium">
              {isLoading && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-text-muted">Loading live chicken batches...</td>
                </tr>
              )}

              {!isLoading && batches.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-text-muted">
                    <Bird size={28} className="mx-auto mb-2 opacity-30 text-amber-400" />
                    <p className="font-bold">No live chicken batches recorded.</p>
                    <p className="text-[11px] mt-0.5">Purchases of live chicken automatically create raw batches here.</p>
                  </td>
                </tr>
              )}

              {batches.map(batch => {
                const isExhausted = batch.status === 'exhausted' || (batch.remaining_weight_grams <= 0 && batch.remaining_count <= 0);
                const remainingKg = (batch.remaining_weight_grams / 1000).toFixed(2);
                const initialKg = (batch.initial_weight_grams / 1000).toFixed(2);

                return (
                  <tr key={batch.id} className={`hover:bg-surface-panel/60 transition-colors ${isExhausted ? 'opacity-50' : ''}`}>
                    <td className="py-3 px-3 font-mono font-bold text-text-primary">
                      {batch.batch_number}
                      {batch.notes && (
                        <span className="block text-[10px] font-normal text-text-muted truncate max-w-xs">{batch.notes}</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-text-secondary font-mono text-[11px]">
                      {batch.purchase_date}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-text-muted text-[11px]">
                      {batch.initial_count} birds / {initialKg} kg
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-amber-400">
                      {batch.remaining_count} birds
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-emerald-400 text-sm">
                      {remainingKg} kg
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-text-primary">
                      {formatPaise(batch.cost_per_kg_paise)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[9.5px] font-black uppercase tracking-wider ${
                        isExhausted
                          ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                          : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      }`}>
                        {isExhausted ? 'Exhausted' : 'Active'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {!isExhausted && (
                          <button
                            onClick={() => {
                              setSelectedBatch(batch);
                              setIsProcessModalOpen(true);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-brand-500/20 hover:bg-brand-500/30 text-brand-400 border border-brand-500/40 text-[11px] font-extrabold transition-all flex items-center gap-1 cursor-pointer"
                            title="Process Birds into Sellable Processed Stock"
                          >
                            <Zap size={12} />
                            <span>Process</span>
                          </button>
                        )}

                        <button
                          onClick={() => {
                            setSelectedBatch(batch);
                            setIsEditModalOpen(true);
                          }}
                          className="p-1 rounded-lg bg-surface-panel hover:bg-surface-hover text-text-muted hover:text-text-primary border border-border-subtle cursor-pointer transition-colors"
                          title="Edit Batch Quantities & Audit"
                        >
                          <Edit3 size={13} />
                        </button>

                        {!isExhausted && (
                          <button
                            onClick={() => {
                              setSelectedBatch(batch);
                              setIsMortalityModalOpen(true);
                            }}
                            className="p-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 cursor-pointer transition-colors"
                            title="Record Mortality Loss"
                          >
                            <Skull size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <ProcessLiveChickenModal
        isOpen={isProcessModalOpen}
        onClose={() => setIsProcessModalOpen(false)}
        batch={selectedBatch}
        onSuccess={() => refetch()}
      />

      <EditLiveChickenBatchModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        batch={selectedBatch}
        onSuccess={() => refetch()}
      />

      <LiveChickenMortalityModal
        isOpen={isMortalityModalOpen}
        onClose={() => setIsMortalityModalOpen(false)}
        batch={selectedBatch}
        onSuccess={() => refetch()}
      />
    </div>
  );
}

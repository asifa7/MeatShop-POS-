import React, { useState } from 'react';
import { Layers, History, Settings as AdjustIcon, RefreshCw, Scale, DollarSign, Zap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';
import { useStockStatus } from '../hooks/useInventory';
import { formatPaise } from '../../../billing/frontend/types/billing.types';
import StockAdjustmentModal from './StockAdjustmentModal';

export interface ProcessingEvent {
  id: number;
  event_number: string;
  batch_id: number;
  batch_number: string;
  live_weight_grams: number;
  live_count: number;
  processed_weight_grams: number;
  yield_ratio_used: number;
  processed_variant_id: number;
  variant_name?: string;
  product_name?: string;
  unit_cost_paise_per_kg: number;
  created_at: string;
  notes?: string | null;
}

export default function ProcessedChickenPoolView() {
  const [selectedVariantIdForAdjust, setSelectedVariantIdForAdjust] = useState<number | null>(null);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);

  // Load stock status
  const { data: allStocks = [], isLoading: isLoadingStocks, refetch: refetchStocks } = useStockStatus();

  // Filter processed chicken items (sellable cuts)
  const processedChickenStocks = (allStocks || []).filter(item => {
    const text = `${item.product_name} ${item.variant_name} ${item.category}`.toLowerCase();
    return text.includes('chicken') && item.unit_type !== 'live_dual';
  });

  // Load processing events history
  const { data: events = [], isLoading: isLoadingEvents, refetch: refetchEvents } = useQuery<ProcessingEvent[]>({
    queryKey: ['processing-events'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.LIST_PROCESSING_EVENTS, { limit: 100 });
      if (!res.success) throw new Error(res.error?.message || 'Failed to load processing events');
      return res.data || [];
    },
    refetchInterval: 15000,
  });

  const totalProcessedStockKg = processedChickenStocks.reduce(
    (acc, item) => acc + ((item.quantity_grams || 0) / 1000),
    0
  );

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Top Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-surface-card border border-border-subtle p-4 rounded-xl flex items-center gap-3 shadow-subtle">
          <div className="w-10 h-10 rounded-lg bg-orange-500/15 text-orange-400 flex items-center justify-center font-bold">
            <Layers size={20} />
          </div>
          <div>
            <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Sellable Processed Chicken</span>
            <div className="text-xl font-black font-mono text-orange-400">{totalProcessedStockKg.toFixed(2)} kg</div>
          </div>
        </div>

        <div className="bg-surface-card border border-border-subtle p-4 rounded-xl flex items-center gap-3 shadow-subtle">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center font-bold">
            <History size={20} />
          </div>
          <div>
            <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Processing Runs Logged</span>
            <div className="text-xl font-black font-mono text-emerald-400">{events.length} run{events.length !== 1 ? 's' : ''}</div>
          </div>
        </div>

        <div className="bg-surface-card border border-border-subtle p-4 rounded-xl flex items-center justify-between shadow-subtle">
          <div>
            <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Cuts / Variants Tracked</span>
            <div className="text-xl font-black font-mono text-text-primary">{processedChickenStocks.length} cuts</div>
          </div>
          <button
            onClick={() => {
              refetchStocks();
              refetchEvents();
            }}
            className="p-2 rounded-lg bg-surface-panel hover:bg-surface-hover text-text-muted hover:text-text-primary border border-border-subtle cursor-pointer transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
        {/* Left Col: Sellable Processed Chicken Stock Levels */}
        <div className="lg:col-span-5 bg-surface-card border border-border-subtle rounded-xl flex flex-col shadow-subtle overflow-hidden">
          <div className="p-3.5 border-b border-border-subtle flex items-center justify-between bg-surface-panel flex-shrink-0">
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-orange-400" />
              <span className="text-xs font-black text-text-primary uppercase tracking-wider">Sellable Chicken Stock Levels</span>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-surface-panel sticky top-0 z-10 border-b border-border-subtle text-[10px] font-black uppercase text-text-muted tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Product / Cut</th>
                  <th className="py-2.5 px-3 text-right">Current Stock</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/50 font-medium">
                {isLoadingStocks && (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-text-muted">Loading stock levels...</td>
                  </tr>
                )}

                {!isLoadingStocks && processedChickenStocks.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-text-muted font-bold">
                      No processed chicken items found in product catalog.
                    </td>
                  </tr>
                )}

                {processedChickenStocks.map(item => {
                  const stockKg = ((item.quantity_grams || 0) / 1000).toFixed(2);
                  const isLow = (item.quantity_grams || 0) <= (item.safety_threshold_grams || 5000);

                  return (
                    <tr key={item.product_variant_id} className="hover:bg-surface-panel/60 transition-colors">
                      <td className="py-3 px-3">
                        <span className="font-bold text-text-primary block">{item.product_name}</span>
                        <span className="text-[10px] font-mono text-text-muted">{item.variant_name} ({item.product_code || '-'})</span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span className={`font-mono font-black text-sm ${isLow ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {stockKg} kg
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => {
                            setSelectedVariantIdForAdjust(item.product_variant_id);
                            setIsAdjustModalOpen(true);
                          }}
                          className="px-2 py-1 rounded-lg bg-surface-panel hover:bg-surface-hover text-text-muted hover:text-text-primary border border-border-subtle text-[10.5px] font-bold cursor-pointer transition-colors"
                          title="Adjust Stock"
                        >
                          Adjust
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Col: Processing History */}
        <div className="lg:col-span-7 bg-surface-card border border-border-subtle rounded-xl flex flex-col shadow-subtle overflow-hidden">
          <div className="p-3.5 border-b border-border-subtle flex items-center justify-between bg-surface-panel flex-shrink-0">
            <div className="flex items-center gap-2">
              <History size={16} className="text-emerald-400" />
              <span className="text-xs font-black text-text-primary uppercase tracking-wider">Processing Runs Log</span>
            </div>
            <span className="text-[10px] text-text-muted font-bold font-mono">
              Increased ONLY via Live Bird Processing
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-surface-panel sticky top-0 z-10 border-b border-border-subtle text-[10px] font-black uppercase text-text-muted tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Run / Event #</th>
                  <th className="py-2.5 px-3">Live Batch</th>
                  <th className="py-2.5 px-3 text-right">Live Wt Used</th>
                  <th className="py-2.5 px-3 text-right">Meat Produced</th>
                  <th className="py-2.5 px-3 text-right">Yield Ratio</th>
                  <th className="py-2.5 px-3 text-right">Cost / kg</th>
                  <th className="py-2.5 px-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/50 font-medium">
                {isLoadingEvents && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-text-muted">Loading processing events...</td>
                  </tr>
                )}

                {!isLoadingEvents && events.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-text-muted">
                      <Zap size={24} className="mx-auto mb-2 opacity-30 text-amber-400" />
                      <p className="font-bold">No processing runs recorded yet.</p>
                      <p className="text-[11px] mt-0.5">Go to Live Chicken Stock and click "Process" to convert live birds into sellable cuts.</p>
                    </td>
                  </tr>
                )}

                {events.map(evt => {
                  const liveKg = (evt.live_weight_grams / 1000).toFixed(2);
                  const meatKg = (evt.processed_weight_grams / 1000).toFixed(2);

                  return (
                    <tr key={evt.id} className="hover:bg-surface-panel/60 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-brand-500">
                        {evt.event_number}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-text-secondary">
                        {evt.batch_number}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-400">
                        {liveKg} kg ({evt.live_count}b)
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                        {meatKg} kg
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-text-muted">
                        {evt.yield_ratio_used.toFixed(2)}x
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-text-primary">
                        {formatPaise(evt.unit_cost_paise_per_kg)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-text-muted font-mono text-[10px]">
                        {new Date(evt.created_at).toLocaleDateString()} {new Date(evt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <StockAdjustmentModal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        preselectedVariantId={selectedVariantIdForAdjust}
        onSuccess={() => refetchStocks()}
      />
    </div>
  );
}

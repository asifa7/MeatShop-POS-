import React, { useState } from 'react';
import { Package, Snowflake, Settings as AdjustIcon, RefreshCw } from 'lucide-react';
import { useStockStatus } from '../hooks/useInventory';
import { formatPaise } from '../../../billing/frontend/types/billing.types';
import MoveMuttonToFridgeModal from './MoveMuttonToFridgeModal';
import StockAdjustmentModal from './StockAdjustmentModal';

export default function MuttonPoolView() {
  const [isMoveToFridgeOpen, setIsMoveToFridgeOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedVariantIdForAdjust, setSelectedVariantIdForAdjust] = useState<number | null>(null);

  const { data: allStocks = [], isLoading, refetch } = useStockStatus();

  // Filter mutton items
  const muttonStocks = (allStocks || []).filter(item => {
    const text = `${item.product_name} ${item.variant_name} ${item.category}`.toLowerCase();
    return text.includes('mutton') || text.includes('lamb') || text.includes('goat');
  });

  const totalMuttonStockKg = muttonStocks.reduce(
    (acc, item) => acc + ((item.quantity_grams || 0) / 1000),
    0
  );

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Top Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-surface-card border border-border-subtle p-4 rounded-xl flex items-center gap-3 shadow-subtle">
          <div className="w-10 h-10 rounded-lg bg-red-500/15 text-red-400 flex items-center justify-center font-bold">
            <Package size={20} />
          </div>
          <div>
            <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Sellable Mutton on Display</span>
            <div className="text-xl font-black font-mono text-red-400">{totalMuttonStockKg.toFixed(2)} kg</div>
          </div>
        </div>

        <div className="bg-surface-card border border-border-subtle p-4 rounded-xl flex items-center gap-3 shadow-subtle">
          <div className="w-10 h-10 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center font-bold">
            <Snowflake size={20} />
          </div>
          <div>
            <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Cold Storage Separation</span>
            <div className="text-xs font-bold text-text-secondary mt-0.5">Separate from Refrigerator Stock</div>
          </div>
        </div>

        <div className="bg-surface-card border border-border-subtle p-4 rounded-xl flex items-center justify-between shadow-subtle">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMoveToFridgeOpen(true)}
              className="px-3 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/40 text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer shadow-subtle"
            >
              <Snowflake size={14} />
              <span>Move to Fridge</span>
            </button>
          </div>
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg bg-surface-panel hover:bg-surface-hover text-text-muted hover:text-text-primary border border-border-subtle cursor-pointer transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Mutton Items Table */}
      <div className="flex-1 min-h-0 bg-surface-card border border-border-subtle rounded-xl flex flex-col shadow-subtle overflow-hidden">
        <div className="p-3.5 border-b border-border-subtle flex items-center justify-between bg-surface-panel flex-shrink-0">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-red-400" />
            <span className="text-xs font-black text-text-primary uppercase tracking-wider">Sellable Mutton Stock (Front Counter)</span>
          </div>
          <span className="text-[11px] text-text-muted font-bold">
            Deducted strictly by retail POS billing.
          </span>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-surface-panel sticky top-0 z-10 border-b border-border-subtle text-[10px] font-black uppercase text-text-muted tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Product / Cut Name</th>
                <th className="py-2.5 px-3">Code</th>
                <th className="py-2.5 px-3 text-right">Current Available</th>
                <th className="py-2.5 px-3 text-right">Threshold</th>
                <th className="py-2.5 px-3 text-right">Rate / kg</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle/50 font-medium">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-text-muted">Loading mutton stock...</td>
                </tr>
              )}

              {!isLoading && muttonStocks.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-text-muted">
                    <Package size={28} className="mx-auto mb-2 opacity-30 text-red-400" />
                    <p className="font-bold">No mutton products found in catalog.</p>
                  </td>
                </tr>
              )}

              {muttonStocks.map(item => {
                const stockKg = ((item.quantity_grams || 0) / 1000).toFixed(2);
                const thresholdKg = ((item.safety_threshold_grams || 5000) / 1000).toFixed(1);
                const isLow = (item.quantity_grams || 0) <= (item.safety_threshold_grams || 5000);

                return (
                  <tr key={item.product_variant_id} className="hover:bg-surface-panel/60 transition-colors">
                    <td className="py-3 px-3">
                      <span className="font-bold text-text-primary block">{item.product_name}</span>
                      <span className="text-[10px] text-text-muted">{item.variant_name}</span>
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-text-secondary">
                      {item.product_code || '-'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className={`font-mono font-black text-sm ${isLow ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {stockKg} kg
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-text-muted text-[11px]">
                      {thresholdKg} kg
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-text-primary">
                      {formatPaise(item.current_rate_paise_per_unit || 0)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setIsMoveToFridgeOpen(true)}
                          className="px-2 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10.5px] font-bold cursor-pointer transition-colors flex items-center gap-1"
                          title="Move portion to Refrigerator"
                        >
                          <Snowflake size={11} />
                          <span>To Fridge</span>
                        </button>

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
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <MoveMuttonToFridgeModal
        isOpen={isMoveToFridgeOpen}
        onClose={() => setIsMoveToFridgeOpen(false)}
        onSuccess={() => refetch()}
      />

      <StockAdjustmentModal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        preselectedVariantId={selectedVariantIdForAdjust}
        onSuccess={() => refetch()}
      />
    </div>
  );
}

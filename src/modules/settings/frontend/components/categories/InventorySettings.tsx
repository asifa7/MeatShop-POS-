import React, { useState, useEffect, useMemo } from 'react';
import {
  Boxes, AlertTriangle, Scale, Trash2, CheckCircle2, RefreshCw,
  Layers, Package, Search, AlertOctagon, X, CheckSquare, Square
} from 'lucide-react';
import { SettingCard } from '../ui/SettingCard';
import { SettingRow } from '../ui/SettingRow';
import { SwitchControl } from '../ui/SwitchControl';
import { SegmentedControl } from '../ui/SegmentedControl';
import { NumberStepper } from '../ui/NumberStepper';
import { SelectControl } from '../ui/SelectControl';
import { useSettingsDraftStore } from '../../hooks/useSettingsDraftStore';
import { IPC_CHANNELS } from '../../../../../core/ipc/channels';

export const InventorySettings: React.FC = () => {
  const { draftConfig, updateDraftConfig } = useSettingsDraftStore();
  const inv = draftConfig.inventory;

  // Empty inventory state
  const [emptyScope, setEmptyScope] = useState<'all' | 'category' | 'products'>('category');
  const [selectedCategory, setSelectedCategory] = useState<string>('Chicken');
  const [selectedVariantIds, setSelectedVariantIds] = useState<number[]>([]);
  const [includeLiveBirds, setIncludeLiveBirds] = useState<boolean>(true);
  const [includeRefrigerator, setIncludeRefrigerator] = useState<boolean>(true);
  const [emptyReason, setEmptyReason] = useState<string>('Stock reset for fresh replenishment');
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isConfirmOpen, setIsConfirmOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadStock = async () => {
    try {
      if (window.api?.invoke) {
        const items = await window.api.invoke(IPC_CHANNELS.INVENTORY.GET_STOCK);
        if (Array.isArray(items)) {
          setStockItems(items);
          const cats = Array.from(
            new Set(items.map((i: any) => i.category).filter(Boolean))
          ) as string[];
          setCategories(cats);
          if (cats.length > 0 && !cats.includes(selectedCategory)) {
            setSelectedCategory(cats[0]);
          }
        }
      }
    } catch (err: any) {
      console.error('Failed to load stock for inventory empty tool:', err);
    }
  };

  useEffect(() => {
    loadStock();
  }, []);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return stockItems;
    return stockItems.filter(
      (p) =>
        (p.product_name && p.product_name.toLowerCase().includes(q)) ||
        (p.variant_name && p.variant_name.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
    );
  }, [stockItems, searchQuery]);

  const handleToggleProduct = (variantId: number) => {
    setSelectedVariantIds((prev) =>
      prev.includes(variantId) ? prev.filter((id) => id !== variantId) : [...prev, variantId]
    );
  };

  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredProducts.map((p) => p.product_variant_id);
    setSelectedVariantIds((prev) => Array.from(new Set([...prev, ...allFilteredIds])));
  };

  const handleExecuteEmptyInventory = async () => {
    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      const payload: any = {
        scope: emptyScope,
        includeLiveBirds,
        includeRefrigerator,
        reason: emptyReason,
      };

      if (emptyScope === 'category') {
        payload.category = selectedCategory;
      } else if (emptyScope === 'products') {
        payload.variantIds = selectedVariantIds;
      }

      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.EMPTY_INVENTORY, payload);
      if (res && res.success) {
        setStatusMessage({
          type: 'success',
          text: res.message || 'Inventory successfully emptied and reset to 0.',
        });
        setSelectedVariantIds([]);
        setIsConfirmOpen(false);
        await loadStock();
      } else {
        setStatusMessage({
          type: 'error',
          text: res?.error || 'Failed to empty inventory.',
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Error occurred while emptying inventory.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Stock Safeguards Card */}
      <SettingCard
        title="Stock Safeguards & Negative Selling"
        description="Safeguards to prevent checkout blockage while maintaining audit accuracy"
        icon={<Boxes size={16} />}
      >
        <SettingRow
          label="Enable Real-Time Inventory Tracking"
          description="Maintain real-time ledger entries on purchases, sales, and wastage"
        >
          <SwitchControl
            checked={inv?.trackingEnabled ?? true}
            onChange={(checked) =>
              updateDraftConfig((prev) => ({
                ...prev,
                inventory: { ...(prev.inventory || {}), trackingEnabled: checked },
              }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Allow Selling Past Zero Stock (Overselling)"
          description="Allows checkout without interruption during peak rush; automatically logs shortfall to oversold buffer"
          badge="SAFEGUARD"
        >
          <SwitchControl
            checked={inv?.allowNegativeStock ?? true}
            onChange={(checked) =>
              updateDraftConfig((prev) => ({
                ...prev,
                inventory: { ...(prev.inventory || {}), allowNegativeStock: checked },
              }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Alert on Low Stock"
          description="Display warning badges on product catalog tiles when quantity dips below threshold"
        >
          <SwitchControl
            checked={inv?.alertLowStock ?? true}
            onChange={(checked) =>
              updateDraftConfig((prev) => ({
                ...prev,
                inventory: { ...(prev.inventory || {}), alertLowStock: checked },
              }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Default Low Stock Threshold (kg/pcs)"
          description="Default quantity floor before low-stock alert triggers"
        >
          <NumberStepper
            value={inv?.defaultLowStockThreshold ?? 5}
            min={1}
            max={100}
            step={1}
            unit="kg"
            onChange={(val) =>
              updateDraftConfig((prev) => ({
                ...prev,
                inventory: { ...(prev.inventory || {}), defaultLowStockThreshold: val },
              }))
            }
          />
        </SettingRow>
      </SettingCard>

      {/* Valuation & Batch Management */}
      <SettingCard
        title="Valuation & Fresh Batch Tracking"
        description="Accounting valuation model and FIFO procurement queueing"
        icon={<Scale size={16} />}
      >
        <SettingRow
          label="Inventory Valuation Method"
          description="FIFO (First-In, First-Out) or Weighted Moving Average for Cost of Goods Sold (COGS)"
        >
          <SegmentedControl<'FIFO' | 'Weighted_Average'>
            value={inv?.valuationMethod || 'FIFO'}
            options={[
              { value: 'FIFO', label: 'FIFO (Perishable Batches)' },
              { value: 'Weighted_Average', label: 'Weighted Average' },
            ]}
            onChange={(val) =>
              updateDraftConfig((prev) => ({
                ...prev,
                inventory: { ...(prev.inventory || {}), valuationMethod: val },
              }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Batch & Procurement Lot Tracking"
          description="Track incoming supplier purchase lots, vehicle numbers, and live bird counts"
        >
          <SwitchControl
            checked={inv?.batchTracking ?? true}
            onChange={(checked) =>
              updateDraftConfig((prev) => ({
                ...prev,
                inventory: { ...(prev.inventory || {}), batchTracking: checked },
              }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Freshness & Expiry Alerts"
          description="Highlight batches approaching shelf-life limits in cold storage"
        >
          <SwitchControl
            checked={inv?.expiryTracking ?? true}
            onChange={(checked) =>
              updateDraftConfig((prev) => ({
                ...prev,
                inventory: { ...(prev.inventory || {}), expiryTracking: checked },
              }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Default Measurement Unit"
          description="Standard unit assigned when creating new catalog products"
        >
          <SelectControl
            value={inv?.defaultUnit || 'kg'}
            options={[
              { value: 'kg', label: 'Kilograms (kg)' },
              { value: 'g', label: 'Grams (g)' },
              { value: 'piece', label: 'Pieces (pcs)' },
              { value: 'pack', label: 'Packs (pkt)' },
            ]}
            onChange={(val) =>
              updateDraftConfig((prev) => ({
                ...prev,
                inventory: { ...(prev.inventory || {}), defaultUnit: val as any },
              }))
            }
            className="w-72"
          />
        </SettingRow>
      </SettingCard>

      {/* Empty & Reset Inventory Stock Card */}
      <SettingCard
        title="Empty & Reset Inventory Stock"
        description="Zero out physical stock and exhaust batches when preparing for fresh procurement or restocking"
        icon={<Trash2 size={16} className="text-red-500" />}
      >
        <div className="space-y-5 py-2">
          {/* Status feedback banner */}
          {statusMessage && (
            <div
              className={`p-3.5 rounded-xl border flex items-start gap-3 transition-all ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 size={18} className="text-emerald-400 mt-0.5 shrink-0" />
              ) : (
                <AlertOctagon size={18} className="text-red-400 mt-0.5 shrink-0" />
              )}
              <div className="text-sm flex-1 leading-snug">{statusMessage.text}</div>
              <button
                type="button"
                onClick={() => setStatusMessage(null)}
                className="text-white/40 hover:text-white/80 p-0.5"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Scope Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/50 mb-2">
              Choose Reset Scope
            </label>
            <div className="grid grid-cols-3 gap-2 p-1 bg-white/5 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => setEmptyScope('all')}
                className={`py-2 px-3 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  emptyScope === 'all'
                    ? 'bg-red-600/30 text-red-200 border border-red-500/40 shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Layers size={14} />
                Entire Inventory
              </button>
              <button
                type="button"
                onClick={() => setEmptyScope('category')}
                className={`py-2 px-3 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  emptyScope === 'category'
                    ? 'bg-red-600/30 text-red-200 border border-red-500/40 shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Boxes size={14} />
                By Category
              </button>
              <button
                type="button"
                onClick={() => setEmptyScope('products')}
                className={`py-2 px-3 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  emptyScope === 'products'
                    ? 'bg-red-600/30 text-red-200 border border-red-500/40 shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Package size={14} />
                Select Products
              </button>
            </div>
          </div>

          {/* Category Dropdown (Visible when scope === 'category') */}
          {emptyScope === 'category' && (
            <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-white/70">Select Target Category to Empty</label>
                <span className="text-[11px] text-white/40">
                  {categories.length} categories available
                </span>
              </div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500/50"
              >
                {categories.map((cat) => {
                  const count = stockItems.filter(
                    (p) => (p.category || '').toLowerCase() === cat.toLowerCase()
                  ).length;
                  return (
                    <option key={cat} value={cat} className="bg-neutral-900 text-white">
                      {cat} ({count} product{count === 1 ? '' : 's'})
                    </option>
                  );
                })}
              </select>
              <p className="text-[11px] text-white/50">
                All products belonging to category <strong className="text-white/80">"{selectedCategory}"</strong> will have their on-hand stock set to 0.
              </p>
            </div>
          )}

          {/* Product Multi-Select List (Visible when scope === 'products') */}
          {emptyScope === 'products' && (
            <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-2.5 text-white/40" />
                  <input
                    type="text"
                    placeholder="Search products by name or code..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-red-500/50"
                  />
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-[11px]"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedVariantIds([])}
                    className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-[11px]"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-white/50 flex justify-between px-1">
                <span>
                  {filteredProducts.length} matching products
                </span>
                <span className="text-red-400 font-medium">
                  {selectedVariantIds.length} selected for reset
                </span>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-1 pr-1 custom-scrollbar border border-white/5 rounded-lg p-1.5 bg-black/20">
                {filteredProducts.length === 0 ? (
                  <div className="py-6 text-center text-xs text-white/40">
                    No products match your search
                  </div>
                ) : (
                  filteredProducts.map((p) => {
                    const isSelected = selectedVariantIds.includes(p.product_variant_id);
                    const isWeight = p.unit_type === 'weight' || p.unit_type === 'live_dual';
                    const stockQty = isWeight
                      ? (p.quantity_grams ? (p.quantity_grams / 1000).toFixed(2) + ' kg' : '0.00 kg')
                      : `${p.quantity_units ?? 0} pcs`;
                    const hasNonZero = (p.quantity_grams && p.quantity_grams !== 0) || (p.quantity_units && p.quantity_units !== 0);

                    return (
                      <div
                        key={p.product_variant_id}
                        onClick={() => handleToggleProduct(p.product_variant_id)}
                        className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-red-500/15 border border-red-500/30 text-white'
                            : 'hover:bg-white/5 border border-transparent text-white/80'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          {isSelected ? (
                            <CheckSquare size={15} className="text-red-400 shrink-0" />
                          ) : (
                            <Square size={15} className="text-white/30 shrink-0" />
                          )}
                          <div className="truncate">
                            <span className="font-medium text-white">{p.product_name}</span>
                            {p.variant_name && p.variant_name !== p.product_name && (
                              <span className="text-white/40 ml-1.5">({p.variant_name})</span>
                            )}
                            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-white/10 text-white/60">
                              {p.category || 'General'}
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0 pl-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                              hasNonZero
                                ? 'bg-amber-500/20 text-amber-300 font-semibold'
                                : 'bg-white/5 text-white/40'
                            }`}
                          >
                            {stockQty}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Options & Safeguards */}
          <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-3">
            <div className="text-xs font-semibold text-white/70">Additional Stock Pools & Audit Notes</div>

            <div className="space-y-2.5">
              <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeLiveBirds}
                  onChange={(e) => setIncludeLiveBirds(e.target.checked)}
                  className="rounded border-white/20 bg-black/40 text-red-500 focus:ring-0"
                />
                <span>Include Live Chicken Batches (exhaust all active live bird procurement lots)</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeRefrigerator}
                  onChange={(e) => setIncludeRefrigerator(e.target.checked)}
                  className="rounded border-white/20 bg-black/40 text-red-500 focus:ring-0"
                />
                <span>Include Refrigerator Stock (mark active cold storage items as removed)</span>
              </label>
            </div>

            <div className="pt-2">
              <label className="block text-[11px] text-white/50 mb-1">Reason for stock reset (saved to audit trail):</label>
              <input
                type="text"
                value={emptyReason}
                onChange={(e) => setEmptyReason(e.target.value)}
                placeholder="e.g. Stock reset for fresh shipment"
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-red-500/50"
              />
            </div>
          </div>

          {/* Action Trigger Button */}
          <div className="flex items-center justify-between pt-2">
            <div className="text-[11px] text-white/40 flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-amber-400" />
              <span>Resets on-hand quantities to 0 and writes audit adjustments</span>
            </div>

            <button
              type="button"
              onClick={() => setIsConfirmOpen(true)}
              disabled={isSubmitting || (emptyScope === 'products' && selectedVariantIds.length === 0)}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600 text-white font-medium text-xs rounded-xl shadow-lg shadow-red-600/20 flex items-center gap-2 transition-all cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Emptying Stock...
                </>
              ) : (
                <>
                  <Trash2 size={14} />
                  {emptyScope === 'all'
                    ? 'Empty Entire Inventory (0 Stock)'
                    : emptyScope === 'category'
                    ? `Empty All "${selectedCategory}" Stock`
                    : `Empty Selected (${selectedVariantIds.length}) Products`}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Safe Confirmation Modal */}
        {isConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div className="bg-neutral-900 border border-red-500/30 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 shrink-0">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Confirm Empty Inventory Stock</h3>
                  <p className="text-xs text-white/60 mt-1">
                    This will immediately set on-hand stock balances to <strong className="text-red-400">0</strong> and mark procurement batches as exhausted.
                  </p>
                </div>
              </div>

              <div className="bg-black/40 border border-white/10 rounded-xl p-3.5 space-y-1.5 text-xs">
                <div className="text-white/50">Summary of action:</div>
                <div className="font-medium text-white flex items-center justify-between">
                  <span>Scope:</span>
                  <span className="text-red-300 font-semibold uppercase">
                    {emptyScope === 'all'
                      ? 'ALL PRODUCTS (Entire Catalog)'
                      : emptyScope === 'category'
                      ? `Category: ${selectedCategory}`
                      : `${selectedVariantIds.length} Selected Products`}
                  </span>
                </div>
                {includeLiveBirds && (
                  <div className="text-amber-300 text-[11px]">
                    • Active live chicken batches will be closed (exhausted).
                  </div>
                )}
                {includeRefrigerator && (
                  <div className="text-amber-300 text-[11px]">
                    • Cold storage refrigerator items will be cleared.
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsConfirmOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-xs font-medium transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteEmptyInventory}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-lg shadow-red-600/30 flex items-center gap-2 transition-all cursor-pointer"
                >
                  {isSubmitting ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Yes, Empty Stock Now
                </button>
              </div>
            </div>
          </div>
        )}
      </SettingCard>
    </div>
  );
};

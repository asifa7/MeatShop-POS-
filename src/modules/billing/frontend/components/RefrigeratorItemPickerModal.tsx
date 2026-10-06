import { useState, useMemo } from 'react';
import { Snowflake, X, ShoppingCart, Calendar, ShieldCheck, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';
import { useActiveRates } from '../hooks/useActiveRates';
import { useCart } from '../hooks/useCart';
import { formatPaise } from '../types/billing.types';

export interface RefrigeratorStockItem {
  id: number;
  item_name: string;
  item_type: 'leg' | 'brain' | 'head' | 'liver' | 'meat' | 'custom';
  unit_type: 'weight' | 'piece';
  initial_quantity_grams: number | null;
  initial_count: number | null;
  quantity_grams: number | null;
  count: number | null;
  cost_paise_per_unit: number;
  selling_rate_paise: number;
  date_added: string;
  age_days: number;
  notes: string | null;
  status: 'active' | 'removed';
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function RefrigeratorItemPickerModal({ isOpen, onClose }: Props) {
  const { addItem } = useCart();
  const { data: variants = [] } = useActiveRates();

  const { data: rawItems = [], isLoading, refetch } = useQuery<RefrigeratorStockItem[]>({
    queryKey: ['refrigerator-stock-picker'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.GET_REFRIGERATOR_STOCK, {});
      if (!res.success) throw new Error(res.error?.message || 'Failed to load refrigerator stock');
      return res.data || [];
    },
    enabled: isOpen,
  });

  const activeItems = useMemo(() => {
    return (rawItems || []).filter(item => {
      if (item.status !== 'active') return false;
      if (item.unit_type === 'weight') return (item.quantity_grams ?? 0) > 0;
      return (item.count ?? 0) > 0;
    });
  }, [rawItems]);

  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [sellingWeightKg, setSellingWeightKg] = useState<string>('');
  const [sellingCount, setSellingCount] = useState<string>('');
  const [ratePerUnit, setRatePerUnit] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const selectedItem = activeItems.find(i => i.id === selectedItemId);

  // When cashier selects an item
  const handleSelectItem = (item: RefrigeratorStockItem) => {
    setSelectedItemId(item.id);
    setErrorMsg('');

    if (item.unit_type === 'weight') {
      const kg = ((item.quantity_grams ?? 0) / 1000).toFixed(3);
      setSellingWeightKg(kg);
      setSellingCount('');
    } else {
      setSellingCount(String(item.count ?? 1));
      setSellingWeightKg('');
    }

    // Default rate
    if (item.selling_rate_paise > 0) {
      setRatePerUnit((item.selling_rate_paise / 100).toFixed(2));
    } else {
      // Find a matching mutton variant rate or first variant rate
      const match = variants.find(v =>
        v.product_name.toLowerCase().includes(item.item_name.toLowerCase()) ||
        v.variant_name.toLowerCase().includes(item.item_name.toLowerCase()) ||
        v.category?.toLowerCase().includes('mutton')
      );
      if (match) {
        setRatePerUnit((match.current_rate_paise_per_unit / 100).toFixed(2));
      } else {
        setRatePerUnit('600.00'); // Reasonable fallback ₹600/kg
      }
    }
  };

  const handleAddToCart = async () => {
    if (!selectedItem) return;
    setErrorMsg('');

    const isWeight = selectedItem.unit_type === 'weight';
    const ratePaise = Math.round((parseFloat(ratePerUnit) || 0) * 100);
    if (ratePaise <= 0) {
      setErrorMsg('Please enter a valid selling rate');
      return;
    }

    let qtyGrams: number | null = null;
    let qtyUnits: number | null = null;

    if (isWeight) {
      const kg = parseFloat(sellingWeightKg);
      if (!kg || kg <= 0) {
        setErrorMsg('Please enter a valid weight in kg');
        return;
      }
      qtyGrams = Math.round(kg * 1000);
      if (qtyGrams > (selectedItem.quantity_grams ?? 0)) {
        setErrorMsg(`Requested weight exceeds available in fridge (${((selectedItem.quantity_grams ?? 0) / 1000).toFixed(2)} kg)`);
        return;
      }
    } else {
      const cnt = parseInt(sellingCount, 10);
      if (!cnt || cnt <= 0) {
        setErrorMsg('Please enter a valid piece count');
        return;
      }
      qtyUnits = cnt;
      if (qtyUnits > (selectedItem.count ?? 0)) {
        setErrorMsg(`Requested count exceeds available in fridge (${selectedItem.count ?? 0} pcs)`);
        return;
      }
    }

    // Find closest variant or first variant to attach line item
    const matchedVariant = variants.find(v =>
      v.product_name.toLowerCase().includes(selectedItem.item_name.toLowerCase()) ||
      v.variant_name.toLowerCase().includes(selectedItem.item_name.toLowerCase()) ||
      v.category?.toLowerCase().includes('mutton')
    ) || variants[0];

    if (!matchedVariant) {
      setErrorMsg('No product variant available in catalog to bind to bill line.');
      return;
    }

    try {
      await addItem({
        product_variant_id: matchedVariant.id,
        quantity_grams: qtyGrams,
        quantity_units: qtyUnits,
        override_rate_paise: ratePaise,
        override_reason: `Sold from Refrigerator (#${selectedItem.id} ${selectedItem.item_name})`,
        stock_source: 'refrigerator',
        refrigerator_stock_id: selectedItem.id,
      });

      // Close and refresh
      onClose();
      refetch();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add refrigerator item to bill');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-panel border border-cyan-500/40 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-cyan-950/30 border-b border-cyan-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Snowflake size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <span>🧊 Sell from Refrigerator Stock</span>
                <span className="text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/30">
                  {activeItems.length} Available
                </span>
              </h3>
              <p className="text-[11px] text-text-muted">
                Items sold from here deduct directly from cold storage and will not touch sellable mutton ledger.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-surface-card text-text-muted hover:text-text-primary flex items-center justify-center transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 flex-1 overflow-y-auto space-y-4">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-text-muted">Loading refrigerator stock...</div>
          ) : activeItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-text-muted space-y-2">
              <Snowflake size={28} className="mx-auto text-text-muted/40" />
              <p>The refrigerator has no active items currently.</p>
              <p className="text-[10px] text-text-muted/60">Move mutton cuts into the refrigerator from the Inventory screen first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* List of Refrigerator items */}
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                <span className="text-[10px] uppercase font-bold text-text-muted block">Select Item from Fridge</span>
                {activeItems.map((item) => {
                  const isSelected = item.id === selectedItemId;
                  const isWeight = item.unit_type === 'weight';
                  const qtyDisplay = isWeight
                    ? `${((item.quantity_grams ?? 0) / 1000).toFixed(2)} kg`
                    : `${item.count ?? 0} pcs`;

                  // Color code age
                  const ageColor = item.age_days >= 5
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : item.age_days >= 2
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectItem(item)}
                      className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-cyan-500/10 border-cyan-500 text-text-primary shadow-sm'
                          : 'bg-surface-card border-border-subtle hover:border-cyan-500/40 text-text-secondary'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-xs flex items-center gap-1.5 text-text-primary">
                          <span>{item.item_name}</span>
                          <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-surface-panel border border-border-subtle font-mono text-text-muted">
                            {item.item_type}
                          </span>
                        </div>
                        <div className="text-[10px] text-text-muted mt-1 flex items-center gap-2">
                          <span>Added: {item.date_added}</span>
                          {item.notes && <span className="italic truncate max-w-[120px]">({item.notes})</span>}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <div className="font-mono font-bold text-xs text-brand-400">{qtyDisplay}</div>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border inline-block mt-1 ${ageColor}`}>
                          {item.age_days === 0 ? 'Today' : `${item.age_days}d in fridge`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Configure selling parameters */}
              <div className="bg-surface-card border border-border-subtle rounded-xl p-4 flex flex-col justify-between">
                {!selectedItem ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-text-muted text-xs p-6 space-y-2">
                    <ShoppingCart size={24} className="text-text-muted/40" />
                    <span>Select an item on the left to configure selling quantity and rate.</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="border-b border-border-subtle pb-2">
                      <span className="text-[10px] uppercase font-bold text-cyan-400 block">Selling Config</span>
                      <h4 className="text-sm font-extrabold text-text-primary">{selectedItem.item_name}</h4>
                      <p className="text-[10px] text-text-muted">
                        Remaining in fridge: {selectedItem.unit_type === 'weight'
                          ? `${((selectedItem.quantity_grams ?? 0) / 1000).toFixed(3)} kg`
                          : `${selectedItem.count ?? 0} pcs`}
                      </p>
                    </div>

                    {selectedItem.unit_type === 'weight' ? (
                      <div>
                        <label className="block text-[11px] font-bold text-text-secondary mb-1">
                          Selling Weight (kg)
                        </label>
                        <input
                          type="number"
                          step="0.001"
                          value={sellingWeightKg}
                          onChange={e => setSellingWeightKg(e.target.value)}
                          className="w-full bg-surface-panel border border-border-subtle rounded-lg px-3 py-2 text-sm font-mono font-bold text-text-primary focus:border-cyan-500 outline-none"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[11px] font-bold text-text-secondary mb-1">
                          Selling Pieces (count)
                        </label>
                        <input
                          type="number"
                          step="1"
                          value={sellingCount}
                          onChange={e => setSellingCount(e.target.value)}
                          className="w-full bg-surface-panel border border-border-subtle rounded-lg px-3 py-2 text-sm font-mono font-bold text-text-primary focus:border-cyan-500 outline-none"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-[11px] font-bold text-text-secondary mb-1">
                        Selling Rate (₹ {selectedItem.unit_type === 'weight' ? 'per kg' : 'per piece'})
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={ratePerUnit}
                        onChange={e => setRatePerUnit(e.target.value)}
                        className="w-full bg-surface-panel border border-border-subtle rounded-lg px-3 py-2 text-sm font-mono font-bold text-text-primary focus:border-cyan-500 outline-none"
                      />
                    </div>

                    {/* Total preview */}
                    <div className="bg-surface-panel p-2.5 rounded-lg border border-border-subtle flex items-center justify-between">
                      <span className="text-xs text-text-muted font-bold">Line Total:</span>
                      <span className="text-sm font-mono font-extrabold text-cyan-300">
                        ₹{selectedItem.unit_type === 'weight'
                          ? ((parseFloat(sellingWeightKg) || 0) * (parseFloat(ratePerUnit) || 0)).toFixed(2)
                          : ((parseInt(sellingCount, 10) || 0) * (parseFloat(ratePerUnit) || 0)).toFixed(2)}
                      </span>
                    </div>

                    {errorMsg && (
                      <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-2 flex items-center gap-2 text-xs text-rose-300">
                        <AlertCircle size={14} className="flex-shrink-0" />
                        <span>{errorMsg}</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleAddToCart}
                      className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm"
                    >
                      <ShoppingCart size={15} />
                      <span>Add Fridge Item to Bill</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useState, useMemo } from 'react';
import { 
  DollarSign, 
  Package, 
  Search, 
  Plus, 
  Edit2, 
  Trash2, 
  RefreshCw, 
  ChevronDown, 
  ChevronRight, 
  Building2,
  Wrench,
  Sparkles
} from 'lucide-react';
import { useInventoryValuationReport } from '../hooks/useInventoryLedger';
import { useAssets, useAssetSummary, useDeleteAsset, AssetItem } from '../hooks/useAssets';
import AssetManagementModal from './AssetManagementModal';
import AssetReplacementModal from './AssetReplacementModal';

export default function StockValuationView() {
  const [activeTab, setActiveTab] = useState<'products' | 'assets'>('products');

  // Product Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Asset Filters
  const [assetCategoryFilter, setAssetCategoryFilter] = useState('all');
  const [assetStatusFilter, setAssetStatusFilter] = useState('all');
  const [expandedAssetId, setExpandedAssetId] = useState<number | null>(null);

  // Asset Modals
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [assetToEdit, setAssetToEdit] = useState<AssetItem | null>(null);
  const [replacementAsset, setReplacementAsset] = useState<AssetItem | null>(null);

  // Queries
  const { data: valuationData, isLoading: isValuationLoading } = useInventoryValuationReport({});
  const { data: assets, isLoading: isAssetsLoading } = useAssets({
    category: assetCategoryFilter,
    status: assetStatusFilter,
  });
  const { data: assetSummary } = useAssetSummary();
  const deleteAsset = useDeleteAsset();

  // Filtered Product Valuation Items
  const filteredProductItems = useMemo(() => {
    if (!valuationData?.items) return [];
    return valuationData.items.filter(item => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        item.product_name.toLowerCase().includes(q) ||
        item.variant_name.toLowerCase().includes(q) ||
        item.product_code.toLowerCase().includes(q);
      
      const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;

      return matchesSearch && matchesCat;
    });
  }, [valuationData, searchQuery, selectedCategory]);

  // Categories list
  const categories = useMemo(() => {
    if (!valuationData?.items) return [];
    const set = new Set(valuationData.items.map(i => i.category));
    return Array.from(set);
  }, [valuationData]);

  // Computed Totals for filtered product items
  const filteredTotals = useMemo(() => {
    return filteredProductItems.reduce((acc, item) => {
      acc.totalBuyingPaise += item.total_buying_paise;
      acc.totalSellingPaise += item.total_selling_paise;
      acc.potentialProfitPaise += item.potential_profit_paise;
      return acc;
    }, { totalBuyingPaise: 0, totalSellingPaise: 0, potentialProfitPaise: 0 });
  }, [filteredProductItems]);

  const totalStockBuyingValuationRupees = (valuationData?.summary?.totalBuyingValuePaise || 0) / 100;
  const totalActiveAssetValuationRupees = (assetSummary?.totalActiveCostPaise || 0) / 100;
  const combinedBusinessValuationRupees = totalStockBuyingValuationRupees + totalActiveAssetValuationRupees;

  const handleDeleteAsset = async (asset: AssetItem) => {
    if (!window.confirm(`Are you sure you want to delete asset "${asset.name}"?`)) return;
    try {
      await deleteAsset.mutateAsync(asset.id);
    } catch (err: any) {
      alert(err.message || 'Failed to delete asset');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Tabs Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">Stock Valuation & Assets</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Real-time product inventory valuation, equipment asset tracking, and combined business net worth.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center p-1 bg-surface-card border border-border-subtle rounded-2xl">
          <button
            onClick={() => setActiveTab('products')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'products'
                ? 'bg-brand-500 text-white shadow-md'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <Package size={15} />
            <span>Product Inventory Valuation</span>
          </button>
          <button
            onClick={() => setActiveTab('assets')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'assets'
                ? 'bg-brand-500 text-white shadow-md'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <Building2 size={15} />
            <span>Shop Assets & Equipment</span>
          </button>
        </div>
      </div>

      {/* Combined Valuation Summary Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-surface-card border border-border-subtle rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-xs text-text-muted mb-1">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Product Stock Valuation (Buying)</span>
            <Package size={16} className="text-brand-400" />
          </div>
          <div className="text-2xl font-bold text-text-primary font-mono">
            ₹{totalStockBuyingValuationRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-text-muted mt-1">
            Based on Last Purchase Cost across active inventory
          </div>
        </div>

        <div className="p-4 bg-surface-card border border-border-subtle rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-xs text-text-muted mb-1">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Total Active Asset Valuation</span>
            <Wrench size={16} className="text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-cyan-400 font-mono">
            ₹{totalActiveAssetValuationRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-text-muted mt-1">
            {assetSummary?.activeCount || 0} active physical tools & refrigeration units
          </div>
        </div>

        <div className="p-4 bg-brand-500/10 border border-brand-500/30 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-brand-300 mb-1">
            <span className="font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Sparkles size={13} className="text-brand-400" /> Combined Business Valuation
            </span>
            <DollarSign size={16} className="text-brand-400" />
          </div>
          <div className="text-2xl font-bold text-brand-400 font-mono">
            ₹{combinedBusinessValuationRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-text-muted mt-1">
            Total Inventory Value + Total Active Shop Equipment
          </div>
        </div>
      </div>

      {/* Tab 1: Product Stock Valuation */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          {/* Secondary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 bg-surface-card/60 border border-border-subtle rounded-xl">
              <span className="text-[11px] font-semibold text-text-muted block">Items in Stock</span>
              <span className="text-lg font-bold text-text-primary font-mono">{filteredProductItems.length}</span>
            </div>
            <div className="p-3.5 bg-surface-card/60 border border-border-subtle rounded-xl">
              <span className="text-[11px] font-semibold text-text-muted block">Total Potential Selling Value</span>
              <span className="text-lg font-bold text-text-primary font-mono">
                ₹{((filteredTotals.totalSellingPaise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="p-3.5 bg-surface-card/60 border border-border-subtle rounded-xl">
              <span className="text-[11px] font-semibold text-text-muted block">Potential Gross Profit</span>
              <span className="text-lg font-bold text-emerald-400 font-mono">
                ₹{((filteredTotals.potentialProfitPaise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="p-3.5 bg-surface-card/60 border border-border-subtle rounded-xl">
              <span className="text-[11px] font-semibold text-text-muted block">Estimated Gross Margin</span>
              <span className="text-lg font-bold text-brand-400 font-mono">
                {filteredTotals.totalSellingPaise > 0 
                  ? ((filteredTotals.potentialProfitPaise / filteredTotals.totalSellingPaise) * 100).toFixed(1)
                  : '0'}%
              </span>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="p-3.5 bg-surface-card border border-border-subtle rounded-2xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  placeholder="Filter product name or code..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-surface-panel border border-border-subtle rounded-xl pl-8 pr-3 py-1.5 text-xs text-text-primary outline-none focus:border-brand-500"
                />
              </div>

              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="bg-surface-panel border border-border-subtle rounded-xl px-3 py-1.5 text-xs text-text-primary outline-none focus:border-brand-500"
              >
                <option value="all">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Product Valuation Table */}
          <div className="bg-surface-card border border-border-subtle rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border-subtle bg-surface-app text-text-muted font-bold uppercase text-[10px]">
                    <th className="py-3 px-4">Item & Code</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3 text-right">In-Stock Qty</th>
                    <th className="py-3 px-3 text-right">Buying Cost (₹)</th>
                    <th className="py-3 px-3 text-right">Selling Price (₹)</th>
                    <th className="py-3 px-3 text-right">Total Buying (₹)</th>
                    <th className="py-3 px-3 text-right">Total Potential Selling (₹)</th>
                    <th className="py-3 px-4 text-right">Potential Profit (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y border-subtle/50">
                  {isValuationLoading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-text-muted">
                        <RefreshCw className="animate-spin text-brand-500 mx-auto mb-2" size={18} />
                        Calculating live stock valuation...
                      </td>
                    </tr>
                  ) : filteredProductItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-text-muted">
                        No product stock matches the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredProductItems.map(item => (
                      <tr key={item.variant_id} className="hover:bg-surface-panel/40 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-text-primary">{item.product_name}</div>
                          <div className="text-[11px] text-text-muted">{item.variant_name} <span className="font-mono">[{item.product_code}]</span></div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded-md font-semibold text-[10px] uppercase bg-surface-app text-text-secondary border border-border-subtle">
                            {item.category}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-text-primary">
                          {item.quantity.toFixed(2)} {item.unit_label}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-text-muted">
                          ₹{(item.buying_cost_paise / 100).toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-text-primary">
                          ₹{(item.selling_price_paise / 100).toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-text-primary">
                          ₹{(item.total_buying_paise / 100).toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-brand-400">
                          ₹{(item.total_selling_paise / 100).toFixed(2)}
                        </td>
                        <td className={`py-3 px-4 text-right font-mono font-bold ${
                          item.potential_profit_paise >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          ₹{(item.potential_profit_paise / 100).toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>

                {/* Sticky Grand Total Footer */}
                {filteredProductItems.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-border-subtle bg-surface-app font-bold text-xs">
                      <td colSpan={5} className="py-3.5 px-4 text-text-primary uppercase tracking-wider text-[11px]">
                        Grand Totals ({filteredProductItems.length} Products)
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-text-primary">
                        ₹{(filteredTotals.totalBuyingPaise / 100).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-brand-400">
                        ₹{(filteredTotals.totalSellingPaise / 100).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-emerald-400">
                        ₹{(filteredTotals.potentialProfitPaise / 100).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Assets Management & Shop Valuation */}
      {activeTab === 'assets' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="p-3.5 bg-surface-card border border-border-subtle rounded-2xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={assetCategoryFilter}
                onChange={e => setAssetCategoryFilter(e.target.value)}
                className="bg-surface-panel border border-border-subtle rounded-xl px-3 py-1.5 text-xs text-text-primary outline-none focus:border-brand-500"
              >
                <option value="all">All Asset Categories</option>
                <option value="Refrigeration">Refrigeration</option>
                <option value="Lighting">Lighting</option>
                <option value="Furniture">Furniture</option>
                <option value="Equipment">Equipment</option>
                <option value="Weighing Scales">Weighing Scales</option>
                <option value="Cutlery & Knives">Cutlery & Knives</option>
                <option value="Other">Other</option>
              </select>

              <select
                value={assetStatusFilter}
                onChange={e => setAssetStatusFilter(e.target.value)}
                className="bg-surface-panel border border-border-subtle rounded-xl px-3 py-1.5 text-xs text-text-primary outline-none focus:border-brand-500"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="replaced">Replaced</option>
                <option value="damaged">Damaged</option>
                <option value="disposed">Disposed</option>
              </select>
            </div>

            <button
              onClick={() => {
                setAssetToEdit(null);
                setIsAssetModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
            >
              <Plus size={15} /> Add Equipment / Asset
            </button>
          </div>

          {/* Assets Grid / Table */}
          <div className="bg-surface-card border border-border-subtle rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border-subtle bg-surface-app text-text-muted font-bold uppercase text-[10px]">
                    <th className="py-3 px-4 w-8"></th>
                    <th className="py-3 px-3">Asset Item</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Branch</th>
                    <th className="py-3 px-3 text-right">Purchase Cost (₹)</th>
                    <th className="py-3 px-3">Purchase Date</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-3 text-center">Replacements</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle/50">
                  {isAssetsLoading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-text-muted">
                        <RefreshCw className="animate-spin text-brand-500 mx-auto mb-2" size={18} />
                        Loading assets inventory...
                      </td>
                    </tr>
                  ) : (assets || []).length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-text-muted">
                        No equipment assets registered. Click "Add Equipment / Asset" to add shop assets.
                      </td>
                    </tr>
                  ) : (
                    (assets || []).map(asset => {
                      const isExpanded = expandedAssetId === asset.id;
                      const hasReplacements = asset.replacements && asset.replacements.length > 0;

                      return (
                        <React.Fragment key={asset.id}>
                          <tr className="hover:bg-surface-panel/40 transition-colors">
                            <td className="py-3 px-4 text-center">
                              {hasReplacements && (
                                <button
                                  onClick={() => setExpandedAssetId(isExpanded ? null : asset.id)}
                                  className="p-1 rounded hover:bg-surface-panel text-text-muted hover:text-text-primary"
                                  title="View replacement history"
                                >
                                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <div className="font-semibold text-text-primary">{asset.name}</div>
                              {asset.notes && <div className="text-[11px] text-text-muted line-clamp-1">{asset.notes}</div>}
                            </td>
                            <td className="py-3 px-3">
                              <span className="px-2 py-0.5 rounded-md bg-surface-app border border-border-subtle text-text-muted text-[11px] font-medium">
                                {asset.category}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-text-muted font-medium text-[11px]">
                              {asset.branch_name || 'Main Store'}
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-text-primary">
                              ₹{(asset.purchase_cost_paise / 100).toFixed(2)}
                            </td>
                            <td className="py-3 px-3 text-text-muted font-mono text-[11px]">
                              {asset.purchase_date}
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className={`px-2.5 py-0.5 rounded-md font-bold text-[10px] uppercase ${
                                asset.status === 'active'
                                  ? 'bg-emerald-500/15 text-emerald-400'
                                  : asset.status === 'damaged'
                                  ? 'bg-rose-500/15 text-rose-400'
                                  : asset.status === 'replaced'
                                  ? 'bg-amber-500/15 text-amber-400'
                                  : 'bg-surface-app text-text-muted'
                              }`}>
                                {asset.status}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className={`font-mono text-xs px-2 py-0.5 rounded-md ${
                                asset.times_replaced > 0 ? 'bg-amber-500/15 text-amber-400 font-bold' : 'text-text-muted'
                              }`}>
                                {asset.times_replaced}x
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => setReplacementAsset(asset)}
                                  className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1"
                                  title="Record replacement"
                                >
                                  <RefreshCw size={12} /> Replace
                                </button>
                                <button
                                  onClick={() => {
                                    setAssetToEdit(asset);
                                    setIsAssetModalOpen(true);
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-surface-panel text-text-muted hover:text-text-primary transition-colors"
                                  title="Edit asset"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  onClick={() => handleDeleteAsset(asset)}
                                  className="p-1.5 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors"
                                  title="Delete asset"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Expandable Replacement History Log */}
                          {isExpanded && hasReplacements && (
                            <tr>
                              <td colSpan={9} className="bg-surface-app/60 p-4 border-t border-b border-border-subtle/80">
                                <div className="space-y-2">
                                  <h4 className="font-bold text-[11px] uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                                    <RefreshCw size={12} className="text-amber-400" /> Replacement & Service History ({asset.replacements!.length} events)
                                  </h4>
                                  <div className="grid grid-cols-1 gap-2">
                                    {asset.replacements!.map(log => (
                                      <div key={log.id} className="p-3 bg-surface-panel rounded-xl border border-border-subtle flex items-start justify-between gap-4">
                                        <div>
                                          <div className="flex items-center gap-2">
                                            <span className="font-bold text-xs text-text-primary">{log.reason}</span>
                                            <span className="font-mono text-[11px] text-text-muted">({log.replacement_date})</span>
                                          </div>
                                          {log.notes && <p className="text-xs text-text-muted mt-1">{log.notes}</p>}
                                        </div>
                                        <div className="text-right">
                                          <span className="font-mono font-bold text-xs text-amber-400">
                                            ₹{(log.replacement_cost_paise / 100).toFixed(2)}
                                          </span>
                                          {log.logged_by_name && (
                                            <div className="text-[10px] text-text-muted mt-0.5">By {log.logged_by_name}</div>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Asset Modals */}
      <AssetManagementModal
        isOpen={isAssetModalOpen}
        onClose={() => setIsAssetModalOpen(false)}
        assetToEdit={assetToEdit}
      />

      <AssetReplacementModal
        isOpen={!!replacementAsset}
        onClose={() => setReplacementAsset(null)}
        asset={replacementAsset}
      />
    </div>
  );
}

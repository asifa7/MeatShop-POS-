import { useState, useMemo } from 'react';
import {
  Plus, Package, Power, PowerOff, Edit2, Clock, AlertCircle,
  RefreshCw, Search, FileSpreadsheet, Trash2, Eye, EyeOff, Filter,
  Archive
} from 'lucide-react';
import { useAdminProducts, useProductRateHistory } from '../hooks/useProducts';
import { useSession } from '../../../auth/frontend/hooks/useAuth';
import {
  useDeactivateProduct, useReactivateProduct, useDeleteProduct,
  useDeactivateCategory, useReactivateCategory, useDeleteCategory,
} from '../hooks/useProductMutations';
import { formatPaise } from '../../../billing/frontend/types/billing.types';
import { FIXED_CATEGORIES } from '../../types/products.types';
import type { AdminProduct } from '../../types/products.types';
import ProductForm from './ProductForm';
import RateHistoryPanel from './RateHistoryPanel';
import DeactivateConfirmDialog, { DeactivateTarget } from './DeactivateConfirmDialog';
import BulkProductSheetModal from './BulkProductSheetModal';
import DeletedProductsModal from './DeletedProductsModal';

// ─── Rate History Modal Wrapper ────────────────────────────────────────────────
function RateHistoryWrapper({ product, onClose }: { product: AdminProduct; onClose: () => void }) {
  const { data: history = [], isLoading } = useProductRateHistory(product.id);
  return (
    <RateHistoryPanel
      isOpen
      onClose={onClose}
      variantName={`${product.name} (${product.product_code})`}
      history={history}
      isLoading={isLoading}
    />
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  Chicken: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  Mutton:  'text-rose-400 bg-rose-500/10 border-rose-500/30',
  Seafood: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  Eggs:    'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
};

export default function ProductManagementView() {
  const { data: products = [], isLoading, error, refetch } = useAdminProducts();
  const { data: session } = useSession();

  const deactivateProduct = useDeactivateProduct();
  const reactivateProduct = useReactivateProduct();
  const deleteProduct = useDeleteProduct();
  const deactivateCategory = useDeactivateCategory();
  const reactivateCategory = useReactivateCategory();
  const deleteCategory = useDeleteCategory();

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [showInactive, setShowInactive] = useState(false);

  // Modal State
  const [showProductForm, setShowProductForm] = useState(false);
  const [editProduct, setEditProduct] = useState<AdminProduct | null>(null);
  const [showBulkSheet, setShowBulkSheet] = useState(false);
  const [historyProduct, setHistoryProduct] = useState<AdminProduct | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<DeactivateTarget | null>(null);
  const [showDeletedModal, setShowDeletedModal] = useState(false);

  const isAdmin = session?.role === 'ADMIN' || session?.role === 'MANAGER';

  // Dynamic Categories from Data
  const allCategories = useMemo(() => {
    const set = new Set<string>(FIXED_CATEGORIES);
    products.forEach(p => {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    });
    return Array.from(set);
  }, [products]);

  // Per-category counts & stats
  const categoryStats = useMemo(() => {
    const stats: Record<string, { total: number; active: number; inactive: number }> = {};
    for (const cat of allCategories) {
      stats[cat] = { total: 0, active: 0, inactive: 0 };
    }
    for (const p of products) {
      const cat = p.category?.trim();
      if (cat) {
        if (!stats[cat]) stats[cat] = { total: 0, active: 0, inactive: 0 };
        stats[cat].total += 1;
        if (p.is_active === 1) stats[cat].active += 1;
        else stats[cat].inactive += 1;
      }
    }
    return stats;
  }, [allCategories, products]);

  // Filtered Products (Flat List)
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesActive = showInactive ? true : p.is_active === 1;
      const matchesCategory = selectedCategory === 'ALL' || p.category?.toLowerCase() === selectedCategory.toLowerCase();
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch = !term ||
        p.name?.toLowerCase().includes(term) ||
        p.product_code?.toLowerCase().includes(term) ||
        p.type?.toLowerCase().includes(term) ||
        p.category?.toLowerCase().includes(term);

      return matchesActive && matchesCategory && matchesSearch;
    });
  }, [products, showInactive, selectedCategory, searchTerm]);

  const totalProducts = products.length;
  const activeProductsCount = products.filter(p => p.is_active === 1).length;
  const inactiveProductsCount = totalProducts - activeProductsCount;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted select-none gap-3">
        <div className="w-8 h-8 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
        <span className="text-xs font-semibold text-text-secondary">Loading product catalogue...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted select-none gap-3">
        <AlertCircle size={32} className="text-rose-400" />
        <p className="text-sm font-bold text-text-primary">Failed to load products</p>
        <p className="text-xs text-rose-400">{(error as Error).message}</p>
        <button onClick={() => refetch()} className="btn-primary text-xs font-bold flex items-center gap-2">
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface-app text-text-primary overflow-hidden">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between px-6 py-4 bg-surface-panel border-b border-border-subtle gap-3 flex-shrink-0">
        <div>
          <h1 className="text-base font-extrabold text-text-primary flex items-center gap-2">
            <Package size={18} className="text-brand-500" />
            Product Catalogue
          </h1>
          <p className="text-[11px] text-text-muted mt-0.5">
            Flat, unified sellable item catalogue · {activeProductsCount} active items ({inactiveProductsCount} inactive)
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowDeletedModal(true)}
              className="px-3.5 py-2 rounded-xl border border-border-subtle bg-surface-card hover:bg-surface-app text-xs font-bold text-text-secondary hover:text-text-primary transition-all flex items-center gap-2 shadow-sm"
              title="View audit archive of deleted products and restore them"
            >
              <Archive size={15} className="text-brand-500" />
              <span>Deleted Items</span>
            </button>
            <button
              onClick={() => setShowBulkSheet(true)}
              className="px-4 py-2 rounded-xl border border-brand-500/30 bg-brand-500/10 text-xs font-bold text-brand-500 hover:bg-brand-500/20 hover:border-brand-500/50 transition-all flex items-center gap-2 shadow-sm"
            >
              <FileSpreadsheet size={15} className="text-brand-500" />
              <span>Bulk Add Products</span>
            </button>
            <button
              onClick={() => { setEditProduct(null); setShowProductForm(true); }}
              className="btn-primary text-xs font-bold flex items-center gap-2 px-4 py-2 shadow-subtle"
            >
              <Plus size={15} />
              <span>Add Product</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="px-6 py-3 bg-surface-card border-b border-border-subtle flex flex-col md:flex-row md:items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3 flex-1 max-w-xl">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search product name, code, type..."
              className="w-full bg-surface-app border border-border-subtle rounded-xl pl-9 pr-3 py-1.5 text-xs font-semibold text-text-primary placeholder-text-muted outline-none focus:border-brand-500"
            />
          </div>
        </div>

        {/* Show Inactive Toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowInactive(!showInactive)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
              showInactive
                ? 'bg-brand-500/10 border-brand-500 text-brand-500 shadow-sm'
                : 'bg-surface-app border-border-subtle text-text-muted hover:text-text-primary'
            }`}
          >
            {showInactive ? <Eye size={14} /> : <EyeOff size={14} />}
            <span>Show Inactive ({inactiveProductsCount})</span>
          </button>
        </div>
      </div>

      {/* Category Pills Bar */}
      <div className="px-6 py-2.5 bg-surface-panel border-b border-border-subtle flex items-center gap-2 overflow-x-auto no-scrollbar flex-shrink-0">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-text-muted flex items-center gap-1.5 mr-1 shrink-0">
          <Filter size={13} /> Categories:
        </span>

        <button
          onClick={() => setSelectedCategory('ALL')}
          className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all shrink-0 flex items-center gap-2 border ${
            selectedCategory === 'ALL'
              ? 'bg-brand-500 border-brand-500 text-white shadow-sm'
              : 'bg-surface-card border-border-subtle text-text-secondary hover:text-text-primary hover:border-brand-500/40'
          }`}
        >
          <span>All Products</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
            selectedCategory === 'ALL' ? 'bg-black/25 text-white' : 'bg-surface-app text-text-muted'
          }`}>
            {totalProducts}
          </span>
        </button>

        {allCategories.map(cat => {
          const isSel = selectedCategory.toLowerCase() === cat.toLowerCase();
          const count = categoryStats[cat]?.total || 0;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all shrink-0 flex items-center gap-2 border ${
                isSel
                  ? 'bg-brand-500 border-brand-500 text-white shadow-sm'
                  : 'bg-surface-card border-border-subtle text-text-secondary hover:text-text-primary hover:border-brand-500/40'
              }`}
            >
              <span>{cat}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                isSel ? 'bg-black/25 text-white' : 'bg-surface-app text-text-muted'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Category Action Bar (When a specific category is selected) */}
      {selectedCategory !== 'ALL' && (
        <div className="px-6 py-2.5 bg-surface-card/70 border-b border-border-subtle flex flex-wrap items-center justify-between gap-3 flex-shrink-0 animate-in fade-in duration-150">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-brand-500" />
            <span className="text-xs font-extrabold text-text-primary">
              Category: <span className="text-brand-500">{selectedCategory}</span>
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-surface-panel border border-border-subtle text-text-secondary">
              {categoryStats[selectedCategory]?.total || 0} products
            </span>
            <span className="text-[11px] font-semibold text-text-muted">
              ({categoryStats[selectedCategory]?.active || 0} active, {categoryStats[selectedCategory]?.inactive || 0} inactive)
            </span>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2">
              {(categoryStats[selectedCategory]?.inactive || 0) > 0 && (
                <button
                  onClick={() => reactivateCategory.mutate(selectedCategory)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold transition-all flex items-center gap-1.5"
                  title={`Reactivate all products in ${selectedCategory}`}
                >
                  <Power size={13} />
                  <span>Reactivate Category</span>
                </button>
              )}

              <button
                onClick={() => {
                  setDeactivateTarget({
                    type: 'category',
                    category: selectedCategory,
                    count: categoryStats[selectedCategory]?.total || 0,
                    activeCount: categoryStats[selectedCategory]?.active || 0,
                  });
                }}
                className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 text-xs font-bold transition-all flex items-center gap-1.5"
                title={`Deactivate all products in ${selectedCategory}`}
              >
                <PowerOff size={13} />
                <span>Deactivate Category</span>
              </button>

              <button
                onClick={() => {
                  setDeactivateTarget({
                    type: 'category',
                    category: selectedCategory,
                    count: categoryStats[selectedCategory]?.total || 0,
                    activeCount: categoryStats[selectedCategory]?.active || 0,
                  });
                }}
                className="px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 text-xs font-bold transition-all flex items-center gap-1.5"
                title={`Permanently delete all products in ${selectedCategory}`}
              >
                <Trash2 size={13} />
                <span>Delete Category Permanently</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Flat Product Table View */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center select-none">
            <div className="w-14 h-14 rounded-2xl bg-surface-panel border border-border-subtle flex items-center justify-center mb-3">
              <Package size={24} className="text-brand-500" />
            </div>
            <p className="text-sm font-bold text-text-primary">No products found</p>
            <p className="text-xs text-text-muted max-w-[280px] mt-1 mb-4">
              {totalProducts === 0 ? 'Create your first product to start building your catalogue.' : 'No products match the active filters.'}
            </p>
            {isAdmin && totalProducts === 0 && (
              <button
                onClick={() => { setEditProduct(null); setShowProductForm(true); }}
                className="btn-primary text-xs font-bold flex items-center gap-2 px-5 py-2.5"
              >
                <Plus size={14} /> Add First Product
              </button>
            )}
          </div>
        ) : (
          <div className="border border-border-subtle rounded-2xl overflow-hidden bg-surface-panel shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-card/70 border-b border-border-subtle text-[10px] uppercase font-extrabold text-text-muted tracking-wider">
                  <th className="px-5 py-3.5">Product Name</th>
                  <th className="px-4 py-3.5">Bill No. / Code</th>
                  <th className="px-4 py-3.5">Category</th>
                  <th className="px-4 py-3.5">Type</th>
                  <th className="px-4 py-3.5">Unit Type</th>
                  <th className="px-4 py-3.5 text-right">Buying Rate</th>
                  <th className="px-4 py-3.5 text-right">Selling Rate</th>
                  <th className="px-4 py-3.5 text-center">Inv. Track</th>
                  <th className="px-4 py-3.5 text-center">Rate History</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/50 text-xs">
                {filteredProducts.map(product => {
                  const isActive = product.is_active === 1;
                  const currentCostPaise = product.cost_price_paise_per_unit || product.buying_rate_paise || product.last_purchase_cost_paise || product.variants?.[0]?.cost_price_paise_per_unit || 0;
                  const currentRatePaise = product.current_rate_paise_per_unit || product.variants?.[0]?.current_rate_paise_per_unit || 0;
                  const isTracked = product.track_in_inventory === 1 || product.is_processed_cut === 0;
                  const categoryBadgeStyle = CATEGORY_COLORS[product.category] || 'text-text-muted bg-surface-card border-border-subtle';
                  const rateChangeCount = (product.rateHistory?.length || product.variants?.[0]?.rateHistory?.length || 1);

                  return (
                    <tr
                      key={product.id}
                      className={`hover:bg-surface-card/40 transition-colors ${!isActive ? 'opacity-50 bg-surface-app/40' : ''}`}
                    >
                      {/* Product Name */}
                      <td className="px-5 py-3.5 font-bold text-text-primary">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-brand-500 shadow-sm shadow-brand-500/50' : 'bg-text-muted'}`} />
                          <span className="font-extrabold text-sm text-text-primary">{product.name}</span>
                          {product.hasInvoiceHistory && (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-400">
                              Invoiced
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Product Code / Bill Number */}
                      <td className="px-4 py-3.5 font-mono text-xs font-bold text-text-secondary">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-card border border-border-subtle shadow-xs">
                          <span className="text-[10px] font-extrabold text-brand-500">#</span>
                          <span className="font-mono font-extrabold text-xs text-text-primary">
                            {product.product_code || String(product.id)}
                          </span>
                        </span>
                      </td>

                      {/* Category Badge */}
                      <td className="px-4 py-3.5">
                        <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${categoryBadgeStyle}`}>
                          {product.category || 'General'}
                        </span>
                      </td>

                      {/* Type Badge */}
                      <td className="px-4 py-3.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-surface-card border border-border-subtle text-text-secondary">
                          {product.type || (product.is_processed_cut === 1 ? 'Processed (Cut/Minced)' : 'Unprocessed (Raw)')}
                        </span>
                      </td>

                      {/* Unit Type */}
                      <td className="px-4 py-3.5 font-medium text-text-secondary">
                        <span className="text-xs">
                          {product.unit_type === 'weight' ? '⚖ Weight (kg)' : product.unit_type === 'piece' ? '🔢 Piece / Unit' : product.unit_type === 'live_dual' ? '🐔 Live Dual' : product.unit_type}
                        </span>
                      </td>

                      {/* Buying Rate */}
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-xs text-text-secondary">
                        {currentCostPaise > 0 ? (
                          <>
                            {formatPaise(currentCostPaise)}
                            <span className="text-[9.5px] text-text-muted font-normal ml-0.5">
                              /{product.unit_type === 'weight' ? 'kg' : 'unit'}
                            </span>
                          </>
                        ) : (
                          <span className="text-text-muted text-[11px]">—</span>
                        )}
                      </td>

                      {/* Selling Rate */}
                      <td className="px-4 py-3.5 text-right font-mono font-extrabold text-sm text-brand-500">
                        {formatPaise(currentRatePaise)}
                        <span className="text-[10px] text-text-muted font-normal ml-1">
                          /{product.unit_type === 'weight' ? 'kg' : 'unit'}
                        </span>
                      </td>

                      {/* Inventory Tracking Badge */}
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={`text-[9.5px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${
                            isTracked
                              ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                              : 'bg-surface-card border-border-subtle text-text-muted'
                          }`}
                        >
                          {isTracked ? 'Tracked' : 'Off'}
                        </span>
                      </td>

                      {/* Rate Change History Button */}
                      <td className="px-4 py-3.5 text-center">
                        <button
                          onClick={() => setHistoryProduct(product)}
                          className="px-2.5 py-1 rounded-lg hover:bg-surface-card text-text-muted hover:text-brand-500 border border-transparent hover:border-border-subtle transition-all text-xs font-bold inline-flex items-center gap-1.5"
                          title="View Rate History Log"
                        >
                          <Clock size={13} className="text-brand-500" />
                          <span>{rateChangeCount} change{rateChangeCount !== 1 ? 's' : ''}</span>
                        </button>
                      </td>

                      {/* Status Toggle / Badge */}
                      <td className="px-4 py-3.5 text-center">
                        {isAdmin ? (
                          <button
                            onClick={() => {
                              if (isActive) {
                                setDeactivateTarget({ type: 'product', item: product });
                              } else {
                                reactivateProduct.mutate(product.id);
                              }
                            }}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase transition-all inline-flex items-center gap-1 border ${
                              isActive
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-400'
                                : 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-400'
                            }`}
                            title={isActive ? 'Click to deactivate' : 'Click to reactivate'}
                          >
                            {isActive ? <Power size={11} /> : <PowerOff size={11} />}
                            <span>{isActive ? 'Active' : 'Inactive'}</span>
                          </button>
                        ) : (
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                            isActive ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                          }`}>
                            {isActive ? 'Active' : 'Inactive'}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isAdmin && (
                            <>
                              <button
                                onClick={() => { setEditProduct(product); setShowProductForm(true); }}
                                className="p-1.5 rounded-lg hover:bg-surface-card text-text-muted hover:text-text-primary transition-colors"
                                title="Edit Product"
                              >
                                <Edit2 size={14} />
                              </button>

                              <button
                                onClick={() => setDeactivateTarget({ type: 'product', item: product })}
                                className="p-1.5 rounded-lg hover:bg-rose-500/15 text-text-muted hover:text-rose-400 transition-colors"
                                title={isActive ? 'Soft Delete / Deactivate' : 'Delete / Manage'}
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Product Form Modal */}
      <ProductForm
        isOpen={showProductForm}
        onClose={() => { setShowProductForm(false); setEditProduct(null); }}
        editTarget={editProduct}
      />

      {/* Rate History Modal */}
      {historyProduct && (
        <RateHistoryWrapper
          product={historyProduct}
          onClose={() => setHistoryProduct(null)}
        />
      )}

      {/* Deactivate & Safe Delete Confirmation Dialog */}
      <DeactivateConfirmDialog
        isOpen={deactivateTarget !== null}
        onClose={() => setDeactivateTarget(null)}
        target={deactivateTarget}
        onDeactivate={async () => {
          if (!deactivateTarget) return;
          if (deactivateTarget.type === 'category') {
            await deactivateCategory.mutateAsync(deactivateTarget.category);
          } else if (deactivateTarget.type === 'product') {
            await deactivateProduct.mutateAsync(deactivateTarget.item.id);
          }
        }}
        onHardDelete={async () => {
          if (!deactivateTarget) return;
          if (deactivateTarget.type === 'category') {
            await deleteCategory.mutateAsync(deactivateTarget.category);
            setSelectedCategory('ALL');
          } else if (deactivateTarget.type === 'product') {
            await deleteProduct.mutateAsync(deactivateTarget.item.id);
          }
        }}
      />

      {/* Bulk Product Sheet Modal */}
      <BulkProductSheetModal
        isOpen={showBulkSheet}
        onClose={() => {
          setShowBulkSheet(false);
          refetch();
        }}
      />

      {/* Deleted Products Archive Modal */}
      <DeletedProductsModal
        isOpen={showDeletedModal}
        onClose={() => {
          setShowDeletedModal(false);
          refetch();
        }}
      />
    </div>
  );
}

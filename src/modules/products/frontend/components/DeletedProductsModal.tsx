import { useState, useMemo } from 'react';
import { X, Archive, RotateCcw, Search, AlertCircle, CheckCircle2, Clock, User } from 'lucide-react';
import { useDeletedProductsArchive, DeletedProductArchiveItem } from '../hooks/useProducts';
import { useRestoreDeletedProduct } from '../hooks/useProductMutations';
import { formatPaise } from '../../../billing/frontend/types/billing.types';

interface DeletedProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DeletedProductsModal({ isOpen, onClose }: DeletedProductsModalProps) {
  const { data: archives = [], isLoading, error, refetch } = useDeletedProductsArchive();
  const restoreProduct = useRestoreDeletedProduct();
  const [searchTerm, setSearchTerm] = useState('');
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return archives;
    return archives.filter(item =>
      item.name.toLowerCase().includes(term) ||
      (item.product_code && item.product_code.toLowerCase().includes(term)) ||
      (item.category && item.category.toLowerCase().includes(term))
    );
  }, [archives, searchTerm]);

  if (!isOpen) return null;

  const handleRestore = async (item: DeletedProductArchiveItem) => {
    setRestoringId(item.id);
    setSuccessMsg(null);
    try {
      await restoreProduct.mutateAsync(item.id);
      setSuccessMsg(`Successfully restored "${item.name}" back into active catalogue!`);
      refetch();
    } catch (e: any) {
      alert(e.message || 'Failed to restore product');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-panel border border-border-subtle rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border-subtle bg-surface-card/40 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-500">
              <Archive size={20} />
            </div>
            <div>
              <h2 className="font-extrabold text-sm text-text-primary flex items-center gap-2">
                <span>Deleted Items Archive</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-500">
                  {archives.length} logged
                </span>
              </h2>
              <p className="text-[11px] text-text-muted mt-0.5">
                Full snapshot audit log of deleted products. Items can be retrieved and restored at any time.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-card text-text-muted hover:text-text-secondary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-3 bg-surface-card border-b border-border-subtle flex items-center justify-between gap-3 flex-shrink-0">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search deleted item by name, code, category..."
              className="w-full bg-surface-app border border-border-subtle rounded-xl pl-9 pr-3 py-1.5 text-xs font-semibold text-text-primary placeholder-text-muted outline-none focus:border-brand-500"
            />
          </div>

          {successMsg && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-bold text-emerald-400 animate-in fade-in">
              <CheckCircle2 size={13} />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-48 text-text-muted gap-2">
              <div className="w-6 h-6 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
              <span className="text-xs font-semibold">Loading deleted items archive...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-48 text-rose-400 gap-2">
              <AlertCircle size={24} />
              <span className="text-xs font-bold">Failed to load archive: {(error as Error).message}</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-text-muted text-center">
              <Archive size={32} className="text-text-muted/40 mb-2" />
              <p className="text-xs font-bold text-text-secondary">No deleted items in archive</p>
              <p className="text-[11px] text-text-muted mt-0.5">
                {archives.length === 0
                  ? 'Items permanently deleted from the catalogue will automatically appear here.'
                  : 'No items match your search filter.'}
              </p>
            </div>
          ) : (
            <div className="border border-border-subtle rounded-2xl overflow-hidden bg-surface-panel shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-card/70 border-b border-border-subtle text-[10px] uppercase font-extrabold text-text-muted tracking-wider">
                    <th className="px-5 py-3">Product / Variant Name</th>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Selling Rate</th>
                    <th className="px-4 py-3">Deleted Date & Time</th>
                    <th className="px-4 py-3">Deleted By</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle/50 text-xs">
                  {filtered.map(item => {
                    const isRestored = !!item.restored_at;
                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-surface-card/40 transition-colors"
                      >
                        {/* Name */}
                        <td className="px-5 py-3.5 font-bold text-text-primary">
                          <div>
                            <span className="font-extrabold text-sm text-text-primary">{item.name}</span>
                            <span className="text-[10px] text-text-muted block mt-0.5">
                              {item.unit_type === 'weight' ? '⚖ Weight (kg)' : '🔢 Piece / Unit'}
                            </span>
                          </div>
                        </td>

                        {/* Product Code */}
                        <td className="px-4 py-3.5 font-mono text-xs font-bold text-text-secondary">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-card border border-border-subtle">
                            <span className="text-[9px] text-brand-500 font-extrabold">#</span>
                            <span className="font-extrabold">{item.product_code || String(item.original_id)}</span>
                          </span>
                        </td>

                        {/* Category */}
                        <td className="px-4 py-3.5">
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-surface-card border border-border-subtle text-text-secondary">
                            {item.category || 'General'}
                          </span>
                        </td>

                        {/* Selling Rate */}
                        <td className="px-4 py-3.5 text-right font-mono font-extrabold text-brand-500">
                          {formatPaise(item.current_rate_paise)}
                        </td>

                        {/* Deleted Date */}
                        <td className="px-4 py-3.5 text-text-secondary text-[11px] font-medium">
                          <div className="flex items-center gap-1">
                            <Clock size={12} className="text-text-muted shrink-0" />
                            <span>{new Date(item.deleted_at).toLocaleString()}</span>
                          </div>
                        </td>

                        {/* Deleted By */}
                        <td className="px-4 py-3.5 text-text-secondary text-[11px]">
                          <div className="flex items-center gap-1">
                            <User size={12} className="text-text-muted shrink-0" />
                            <span className="font-bold">{item.deleted_by_username || 'Admin'}</span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5 text-center">
                          {isRestored ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                              Restored
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-rose-500/10 border border-rose-500/30 text-rose-400">
                              Deleted
                            </span>
                          )}
                        </td>

                        {/* Action: Retrieve / Restore */}
                        <td className="px-5 py-3.5 text-right">
                          {isRestored ? (
                            <span className="text-[10px] font-semibold text-text-muted">
                              Already in catalogue
                            </span>
                          ) : (
                            <button
                              onClick={() => handleRestore(item)}
                              disabled={restoringId === item.id}
                              className="px-3 py-1.5 rounded-xl bg-brand-500/10 border border-brand-500/30 text-brand-500 hover:bg-brand-500/20 text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                              title="Restore product back to active catalogue"
                            >
                              <RotateCcw size={12} className={restoringId === item.id ? 'animate-spin' : ''} />
                              <span>{restoringId === item.id ? 'Restoring...' : 'Restore Item'}</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border-subtle bg-surface-card/30 flex justify-between items-center flex-shrink-0">
          <p className="text-[11px] text-text-muted">
            Restoring recreates the product and variant in your active catalogue with its original pricing and properties.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-border-subtle text-xs font-bold text-text-secondary hover:bg-surface-card transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

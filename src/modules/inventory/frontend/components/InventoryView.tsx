import { useState } from 'react';
import { 
  Package, 
  AlertTriangle, 
  History, 
  Settings as AdjustIcon, 
  Search,
  Plus,
  DollarSign,
  FileSpreadsheet,
  Box,
  BarChart3,
  ClipboardCheck,
  Calendar,
  Layers,
  Bird,
  QrCode,
  MapPin,
  Upload,
  Download,
  ArrowRightLeft,
  Snowflake
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';
import { exportToCSV } from '../../../../core/shared/csv_exporter';
import { useQrScanner } from '../hooks/useQrScanner';
import { 
  useStockStatus, 
  useStockAdjustments, 
  useLastPhysicalCount
} from '../hooks/useInventory';
import type { StockStatus } from '../types/inventory.types';

// Components
import ProductForm from '../../../products/frontend/components/ProductForm';
import { useSession } from '../../../auth/frontend/hooks/useAuth';

// Phase 1, 2, 3 & 4 Core Components
import StockSidebarPanel from './StockSidebarPanel';
import StockAdjustmentModal from './StockAdjustmentModal';
import PhysicalStockCountModal from './PhysicalStockCountModal';
import BatchExplorerModal from './BatchExplorerModal';
import LivestockLossModal from './LivestockLossModal';
import StockTransfersView from './StockTransfersView';
import QrLabelGeneratorModal from './QrLabelGeneratorModal';
import BulkProductImportModal from './BulkProductImportModal';
import StockValuationView from './StockValuationView';
import InventoryReportsView from './InventoryReportsView';
import InventoryStockReportView from './InventoryStockReportView';
import RefrigeratorStockView from './RefrigeratorStockView';

type PrimaryTab = 'stock' | 'valuation' | 'reports';

export default function InventoryView() {
  const { data: session } = useSession();
  const isCashier = session?.role?.toLowerCase() === 'cashier';

  // Navigation State
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>('stock');
  const [subTab, setSubTab] = useState<string>('status'); // default for stock is 'status' (All Stock Levels)

  // Location Filter State
  const [selectedLocationId, setSelectedLocationId] = useState<string>('all');

  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isPhysicalCountOpen, setIsPhysicalCountOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isLivestockModalOpen, setIsLivestockModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [batchVariantId, setBatchVariantId] = useState<number | null>(null);
  const [batchVariantName, setBatchVariantName] = useState<string>('');
  const [adjustTargetVariantId, setAdjustTargetVariantId] = useState<number | null>(null);

  // Queries
  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.GET_LOCATIONS, {});
      if (!res.success) return [];
      return res.data || [];
    },
  });

  // Queries
  const { data: stocks, refetch } = useStockStatus();
  const { data: adjs } = useStockAdjustments();
  const { data: lastPhysicalCountDate } = useLastPhysicalCount();

  // Search & Filters for Stock Status
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterStockStatus, setFilterStockStatus] = useState<'all' | 'low' | 'good'>('all');
  const [isProductFormOpen, setIsProductFormOpen] = useState(false);

  // Hardware HID QR Scanner Listener
  useQrScanner((code) => {
    setSearchTerm(code);
    setPrimaryTab('stock');
    setSubTab('status');
  });

  const categories = ['All', ...new Set((stocks || []).map(s => s.category))];

  const filteredStocks = (stocks || []).filter(item => {
    const matchesSearch = searchTerm === '' ||
      item.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.variant_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.product_code.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = filterCategory === 'All' || item.category === filterCategory;

    const isLow = item.unit_type === 'weight' || item.unit_type === 'live_dual'
      ? (item.quantity_grams ?? 0) <= (item.safety_threshold_grams ?? 0)
      : (item.quantity_units ?? 0) <= (item.safety_threshold_units ?? 0);

    const matchesStatus = filterStockStatus === 'all' ||
      (filterStockStatus === 'low' && isLow) ||
      (filterStockStatus === 'good' && !isLow);

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const handlePrimaryTabChange = (tab: PrimaryTab) => {
    setPrimaryTab(tab);
    if (tab === 'stock') setSubTab('status');
    else if (tab === 'reports') setSubTab('activity');
  };

  const handleSubTabClick = (key: string) => {
    if (key === 'adjust') {
      setAdjustTargetVariantId(null);
      setIsAdjustModalOpen(true);
    } else if (key === 'physical_count') {
      setIsPhysicalCountOpen(true);
    } else {
      setSubTab(key);
    }
  };

  const formatStockQty = (item: StockStatus) => {
    if (item.unit_type === 'live_dual') {
      return `${item.quantity_count ?? 0} pcs / ${((item.quantity_grams ?? 0) / 1000).toFixed(3)} kg`;
    }
    if (item.unit_type === 'weight') {
      return ((item.quantity_grams ?? 0) / 1000).toFixed(3) + ' kg';
    }
    return (item.quantity_units ?? 0) + ' pcs';
  };

  const formatThresholdQty = (item: StockStatus) => {
    if (item.unit_type === 'live_dual') {
      return `${item.safety_threshold_count ?? 5} pcs / ${((item.safety_threshold_grams ?? 5000) / 1000).toFixed(1)} kg`;
    }
    if (item.unit_type === 'weight') {
      return ((item.safety_threshold_grams ?? 0) / 1000).toFixed(1) + ' kg';
    }
    return (item.safety_threshold_units ?? 0) + ' pcs';
  };

  const isLowStock = (item: StockStatus) => {
    if (item.unit_type === 'live_dual') {
      return (item.quantity_count ?? 0) <= (item.safety_threshold_count ?? 5) || (item.quantity_grams ?? 0) <= (item.safety_threshold_grams ?? 5000);
    }
    if (item.unit_type === 'weight') {
      return (item.quantity_grams ?? 0) <= (item.safety_threshold_grams ?? 5000);
    }
    return (item.quantity_units ?? 0) <= (item.safety_threshold_units ?? 10);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden p-6 space-y-5 bg-surface-app text-text-primary">
      {/* Header & Primary Tabs */}
      <div className="border-b border-border-subtle pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-outfit text-text-primary flex items-center gap-2">
            <Package className="text-brand-500" />
            <span>Meat Shop Inventory & Supply Chain</span>
          </h2>
          <p className="text-text-muted text-xs mt-1">Audit stock levels, manage supplier networks, raise POs, and log physical stock counts.</p>
        </div>

        {/* 3 Primary Nav Tabs */}
        <div className="flex bg-surface-panel border border-border-subtle p-1.5 rounded-xl self-start gap-1.5 shadow-sm">
          <button
            onClick={() => handlePrimaryTabChange('stock')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              primaryTab === 'stock'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <Box size={15} /> Stock
          </button>

          {!isCashier && (
            <button
              onClick={() => handlePrimaryTabChange('valuation')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                primaryTab === 'valuation'
                  ? 'bg-brand-500 text-white shadow-subtle'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <DollarSign size={15} /> Stock Valuation
            </button>
          )}

          <button
            onClick={() => handlePrimaryTabChange('reports')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              primaryTab === 'reports'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <BarChart3 size={15} /> Reports
          </button>
        </div>
      </div>

      {/* Sub-Navigation Row */}
      <div className="flex items-center justify-between bg-surface-panel border border-border-subtle p-2 rounded-xl">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {primaryTab === 'stock' && (
            <>
              <button
                onClick={() => handleSubTabClick('status')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  subTab === 'status' ? 'bg-surface-card text-brand-500 border border-border-subtle shadow-sm font-extrabold' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <Box size={14} className="text-brand-500" /> All Stock Levels
              </button>

              <button
                onClick={() => handleSubTabClick('refrigerator')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  subTab === 'refrigerator' ? 'bg-surface-card text-blue-400 border border-border-subtle shadow-sm font-extrabold' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <Snowflake size={14} className="text-blue-400" /> Refrigerator Stock
              </button>

              <button
                onClick={() => handleSubTabClick('transfers')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  subTab === 'transfers' ? 'bg-surface-card text-brand-500 border border-border-subtle' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <ArrowRightLeft size={13} /> Stock Transfers
              </button>

              <button
                onClick={() => handleSubTabClick('physical_count')}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-text-muted hover:text-text-primary transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <ClipboardCheck size={13} /> Physical Stock Count
              </button>
            </>
          )}


          {primaryTab === 'reports' && !isCashier && (
            <>
              <button
                onClick={() => handleSubTabClick('activity')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  subTab === 'activity' ? 'bg-surface-card text-brand-500 border border-border-subtle' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <History size={13} /> Stock Activity Ledger
              </button>

              <button
                onClick={() => handleSubTabClick('movement')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  subTab === 'movement' ? 'bg-surface-card text-brand-500 border border-border-subtle' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <FileSpreadsheet size={13} /> Movement Log
              </button>

              <button
                onClick={() => handleSubTabClick('history')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  subTab === 'history' ? 'bg-surface-card text-brand-500 border border-border-subtle' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <Layers size={13} /> Adjustments Trail
              </button>
            </>
          )}
        </div>

        {/* Action Buttons Header Strip */}
        <div className="flex items-center gap-2">

          {primaryTab === 'stock' && (
            <>

              <button
                onClick={() => { setAdjustTargetVariantId(null); setIsAdjustModalOpen(true); }}
                className="px-3 py-1.5 rounded-lg bg-surface-card border border-border-subtle text-text-primary hover:border-brand-500 text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <AdjustIcon size={13} /> Adjust Stock
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 flex gap-5 overflow-hidden">
        <div className="flex-1 min-h-0 bg-surface-panel rounded-2xl border border-border-subtle overflow-hidden flex flex-col shadow-elevation">
          {/* REFRIGERATOR TAB */}
          {primaryTab === 'stock' && subTab === 'refrigerator' && <RefrigeratorStockView />}

          {/* VALUATION TAB */}
          {primaryTab === 'valuation' && <StockValuationView />}

          {/* STOCK TRANSFERS TAB */}
          {primaryTab === 'stock' && subTab === 'transfers' && <div className="p-4 flex-1 overflow-y-auto"><StockTransfersView /></div>}



          {/* REPORTS TAB */}
          {primaryTab === 'reports' && (subTab === 'activity' || subTab === 'reports') && (
            <div className="p-4 flex-1 overflow-y-auto">
              <InventoryStockReportView />
            </div>
          )}
          {primaryTab === 'reports' && subTab === 'movement' && <InventoryReportsView />}
          {primaryTab === 'reports' && subTab === 'history' && (
            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              <h3 className="text-sm font-bold text-text-primary">Stock Movement Audit Log</h3>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border-subtle text-text-muted uppercase text-[10px] font-bold">
                    <th className="py-2 px-3">Timestamp</th>
                    <th className="py-2 px-3">Item</th>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3">Reason</th>
                    <th className="py-2 px-3 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle/50 font-mono">
                  {(adjs || []).map(adj => (
                    <tr key={adj.id} className="hover:bg-surface-hover">
                      <td className="py-2 px-3 text-text-muted text-[11px]">{new Date(adj.created_at).toLocaleString()}</td>
                      <td className="py-2 px-3 font-semibold text-text-primary">{adj.product_name} ({adj.variant_name})</td>
                      <td className="py-2 px-3 capitalize text-brand-500 font-bold">{adj.adjustment_type.replace('_', ' ')}</td>
                      <td className="py-2 px-3 text-text-secondary">{adj.reason}</td>
                      <td className="py-2 px-3 text-right font-bold">
                        {adj.unit_type === 'weight' ? `${((adj.quantity_grams ?? 0)/1000).toFixed(3)} kg` : `${adj.quantity_units ?? 0} pcs`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* STOCK TAB: STOCK LEVELS VIEW */}
          {primaryTab === 'stock' && subTab === 'status' && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Header Info Strip: Last Physical Count Timestamp */}
              <div className="px-4 py-2.5 bg-surface-app border-b border-border-subtle flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-text-muted">
                  <Calendar size={13} className="text-brand-500" />
                  <span>Last Physical Stock Count: </span>
                  <strong className="text-text-primary font-mono">
                    {lastPhysicalCountDate ? new Date(lastPhysicalCountDate).toLocaleString() : 'Never recorded'}
                  </strong>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsProductFormOpen(true)}
                    className="px-2.5 py-1 rounded-lg bg-brand-500/10 border border-brand-500/30 text-brand-500 hover:bg-brand-500 hover:text-white font-bold text-[11px] transition-all flex items-center gap-1"
                  >
                    <Plus size={12} /> Add New Product
                  </button>
                </div>
              </div>

              {/* Search & Filters Bar */}
              <div className="p-3.5 bg-surface-panel border-b border-border-subtle flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 bg-surface-app border border-border-subtle rounded-xl px-3 py-1.5 w-64">
                  <Search size={14} className="text-text-muted" />
                  <input
                    type="text"
                    placeholder="Search stock items..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="bg-transparent border-none text-xs text-text-primary outline-none w-full"
                  />
                </div>

                <div className="flex items-center gap-2">
                  {/* Location Filter */}
                  <div className="flex items-center gap-1.5 bg-surface-app border border-border-subtle rounded-xl px-3 py-1.5">
                    <MapPin size={13} className="text-brand-500" />
                    <select
                      value={selectedLocationId}
                      onChange={e => setSelectedLocationId(e.target.value)}
                      className="bg-transparent border-none text-xs font-bold text-text-primary outline-none"
                    >
                      <option value="all">All Locations</option>
                      {(locations || []).map((loc: any) => (
                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Category Filter */}
                  <select
                    value={filterCategory}
                    onChange={e => setFilterCategory(e.target.value)}
                    className="bg-surface-app border border-border-subtle rounded-xl px-3 py-1.5 text-xs text-text-primary outline-none"
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>

                  {/* Stock Status Filter */}
                  <select
                    value={filterStockStatus}
                    onChange={e => setFilterStockStatus(e.target.value as any)}
                    className="bg-surface-app border border-border-subtle rounded-xl px-3 py-1.5 text-xs text-text-primary outline-none"
                  >
                    <option value="all">All Statuses</option>
                    <option value="low">Low Stock Only</option>
                    <option value="good">Healthy Only</option>
                  </select>

                  {/* CSV Export Button */}
                  <button
                    onClick={() => {
                      const headers = ['SKU', 'Product', 'Variant', 'Category', 'Current Stock', 'Threshold', 'Status'];
                      const rows = (filteredStocks || []).map((s: StockStatus) => [
                        s.product_code, s.product_name, s.variant_name, s.category,
                        formatStockQty(s), formatThresholdQty(s), isLowStock(s) ? 'Low Stock' : 'Healthy'
                      ]);
                      exportToCSV(`stock_levels_location_${selectedLocationId}`, headers, rows);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-surface-card border border-border-subtle hover:bg-surface-hover font-bold text-xs text-text-primary transition-all flex items-center gap-1"
                    title="Export currently visible stock data to CSV"
                  >
                    <Download size={13} /> Export CSV
                  </button>

                  <button
                    onClick={() => setIsImportModalOpen(true)}
                    className="px-2.5 py-1.5 rounded-xl bg-surface-card border border-border-subtle hover:bg-surface-hover font-bold text-xs text-text-primary transition-all flex items-center gap-1"
                    title="Bulk import products from CSV template"
                  >
                    <Upload size={13} /> Bulk Import
                  </button>

                  <button
                    onClick={() => setIsQrModalOpen(true)}
                    className="px-2.5 py-1.5 rounded-xl bg-brand-500/10 border border-brand-500/30 text-brand-500 hover:bg-brand-500 hover:text-white font-bold text-xs transition-all flex items-center gap-1"
                    title="Print Product QR Sticker Labels"
                  >
                    <QrCode size={13} /> Print QR Labels
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-surface-panel border-b border-border-subtle text-text-muted uppercase text-[10px] font-bold z-10">
                    <tr>
                      <th className="py-3 px-4">Product / Variant</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4 text-right">Current Stock</th>
                      <th className="py-3 px-4 text-right">Safety Threshold</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle/50">
                    {(filteredStocks || []).map((s: StockStatus) => {
                      const isLow = isLowStock(s);
                      return (
                        <tr key={s.product_variant_id} className="hover:bg-surface-hover/30 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-text-primary">{s.product_name}</div>
                            <div className="text-[10px] text-text-muted mt-0.5 font-mono">{s.variant_name} • {s.product_code}</div>
                          </td>
                          <td className="py-3.5 px-4 text-text-secondary">{s.category}</td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-text-primary">
                            {formatStockQty(s)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-text-muted">
                            {formatThresholdQty(s)}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex flex-col items-center gap-1">

                              {isLow ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/20">
                                  <AlertTriangle size={10} /> Low Stock
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/10 text-green-500 border border-green-500/20">
                                  Healthy
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setAdjustTargetVariantId(s.product_variant_id);
                                  setIsAdjustModalOpen(true);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-surface-card hover:bg-brand-500 hover:text-white border border-border-subtle text-text-secondary font-bold text-[11px] transition-all"
                              >
                                Adjust
                              </button>
                              <button
                                onClick={() => {
                                  setBatchVariantId(s.product_variant_id);
                                  setBatchVariantName(`${s.product_name} - ${s.variant_name}`);
                                  setIsBatchModalOpen(true);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-surface-card hover:bg-brand-500 hover:text-white border border-border-subtle text-text-secondary font-bold text-[11px] transition-all flex items-center gap-1"
                              >
                                <Layers size={10} /> Batches
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredStocks?.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-text-muted text-xs">
                          No stock items matching current search and filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right Sticky Sidebar Panel (Only for Stock view) */}
        {primaryTab === 'stock' && subTab === 'status' && (
          <StockSidebarPanel
            onSelectItem={(variantId) => {
              const item = stocks?.find(s => s.product_variant_id === variantId);
              if (item) setSearchTerm(item.product_name);
            }}
          />
        )}
      </div>

      {/* Modals */}
      <ProductForm
        isOpen={isProductFormOpen}
        onClose={() => setIsProductFormOpen(false)}
      />

      <StockAdjustmentModal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        initialVariantId={adjustTargetVariantId}
      />

      <PhysicalStockCountModal
        isOpen={isPhysicalCountOpen}
        onClose={() => setIsPhysicalCountOpen(false)}
      />

      <BatchExplorerModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        productVariantId={batchVariantId}
        productName={batchVariantName}
      />

      <LivestockLossModal
        isOpen={isLivestockModalOpen}
        onClose={() => setIsLivestockModalOpen(false)}
      />

      <BulkProductImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => refetch()}
      />

      <QrLabelGeneratorModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        selectedItems={(filteredStocks || []).map((s: any) => ({
          product_code: s.product_code,
          product_name: s.product_name,
          variant_name: s.variant_name,
          unit_type: s.unit_type,
          rate_paise_per_unit: s.current_rate_paise_per_unit || 20000,
        }))}
      />
    </div>
  );
}

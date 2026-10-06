import { useState, useEffect, useCallback } from 'react';
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings as SettingsIcon,
  HelpCircle,
  Database,
  Terminal,
  Clock,
  Sun,
  Moon,
  Keyboard,
  ShoppingCart,
  Pause,
  Package,
  LayoutGrid,
  BarChart3,
  Phone,
  Users,
  Landmark,
  Printer,
  Search,
  Lock,
  Receipt,
  TrendingUp,
  CreditCard,
  BookOpen,
  Drumstick,
  Activity,
  Truck,
  MessageSquare,
} from 'lucide-react';
import { IPC_CHANNELS } from './core/ipc/channels';
import { AppConfig } from './core/shared/types';
import { WhatsAppToastManager } from './modules/whatsapp/frontend/components/WhatsAppToastManager';

import ProductGrid from './modules/billing/frontend/components/ProductGrid';
import ProductQuickSearch from './modules/billing/frontend/components/ProductQuickSearch';
import Cart from './modules/billing/frontend/components/Cart';
import WastageCalculatorWidget from './modules/billing/frontend/components/WastageCalculatorWidget';
import WeightEntry from './modules/billing/frontend/components/WeightEntry';
import PaymentPanel from './modules/billing/frontend/components/PaymentPanel';
import HeldBillsList from './modules/billing/frontend/components/HeldBillsList';
import OverrideDialog from './modules/billing/frontend/components/OverrideDialog';
import UpiCustomerPromptModal from './modules/billing/frontend/components/UpiCustomerPromptModal';
import { useLowStockAlerts, useOversoldRecords } from './modules/inventory/frontend/hooks/useInventory';
import CustomerSearch from './modules/customers/frontend/components/CustomerSearch';
import ReprintLookupModal from './modules/billing/frontend/components/ReprintLookupModal';
import RefrigeratorItemPickerModal from './modules/billing/frontend/components/RefrigeratorItemPickerModal';
import CustomerOutstandingHistoryPanel from './modules/billing/frontend/components/CustomerOutstandingHistoryPanel';
import { useCustomer, useCustomerIntelligence } from './modules/customers/frontend/hooks/useCustomers';
import type { Customer } from './modules/customers/frontend/types/customer.types';
import { getSegmentBadgeStyle } from './modules/customers/frontend/types/customer.types';
import SettingsScreen from './modules/settings/frontend/components/SettingsScreen';
import { Key, AlertTriangle, Edit3, Trash2, CheckCircle2, Palette, Zap, Sparkles, Plus } from 'lucide-react';
import { useSession, useLogout } from './modules/auth/frontend/hooks/useAuth';
import LoginScreen from './modules/auth/frontend/components/LoginScreen';
import { useCart } from './modules/billing/frontend/hooks/useCart';
import { useActiveRates } from './modules/billing/frontend/hooks/useActiveRates';
import DailyCashierPromptModal from './modules/inventory/frontend/components/DailyCashierPromptModal';
import { useHeldBills } from './modules/billing/frontend/hooks/useHeldBills';
import type { ProductVariant, InvoiceDetail } from './modules/billing/frontend/types/billing.types';
import { calculateLineTax } from './modules/billing/frontend/types/billing.types';
import { useAppearance } from './core/theme/AppearanceContext';
import { useMeatShopConfigStore } from './core/config/meatShopConfigStore';

import InventoryView from './modules/inventory/frontend/components/InventoryView';
import PurchasesWorkspace from './modules/inventory/frontend/components/procurement/PurchasesWorkspace';
import ProductManagementView from './modules/products/frontend/components/ProductManagementView';
import ReportsView from './modules/reports/frontend/components/ReportsView';
import CustomerList from './modules/customers/frontend/components/CustomerList';
import ARReportsView from './modules/customers/frontend/components/ARReportsView';
import HRManagementView from './modules/hr/frontend/components/HRManagementView';
import CashBoxView from './modules/cashbox/frontend/components/CashBoxView';
import ExpenseManagementView from './modules/expenses/frontend/components/ExpenseManagementView';
import DailyMarketPricesView from './modules/pricing/frontend/components/DailyMarketPricesView';
import EnterpriseLedgerView from './modules/ledger/frontend/components/EnterpriseLedgerView';
import SystemHealthView from './modules/system/frontend/components/SystemHealthView';
import DemandForecastingView from './modules/inventory/frontend/components/DemandForecastingView';
import PaymentsReceiptsView from './modules/ledger/frontend/components/PaymentsReceiptsView';
import DeliveryManagementView from './modules/delivery/frontend/components/DeliveryManagementView';
import DeliveryOrderModal from './modules/delivery/frontend/components/DeliveryOrderModal';
import { HomeDeliveryPromptModal } from './modules/delivery/frontend/components/HomeDeliveryPromptModal';
import { useDeliveries } from './modules/delivery/frontend/hooks/useDelivery';
import type { CreateDeliveryInput } from './modules/delivery/types/delivery.types';

type Page = 'billing' | 'inventory' | 'purchases' | 'payments' | 'delivery' | 'products' | 'reports' | 'settings' | 'help' | 'customers' | 'ar_reports' | 'hr' | 'cashbox' | 'expenses' | 'prices' | 'ledgers' | 'health' | 'forecasting';

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ activePage, onNavigate, theme, onToggleTheme }: {
  activePage: Page;
  onNavigate: (page: Page) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}) {
  const { data: heldBills } = useHeldBills();
  const heldCount = (heldBills || []).filter(b => b.status === 'held').length;
  const { data: session } = useSession();
  const logoutMutation = useLogout();
  const { data: lowStockAlerts } = useLowStockAlerts();
  const lowStockBadgeCount = lowStockAlerts?.length || 0;
  const { data: oversoldRecords } = useOversoldRecords();
  const unreviewedOversoldCount = (oversoldRecords || []).length;
  const { data: deliveries } = useDeliveries();
  const pendingDeliveryCount = (deliveries || []).filter(d => {
    const isDelivered = Boolean(d.delivered === 1 || d.status === 'delivered');
    const isPaid = Boolean(d.payment_received === 1 || d.payment_status === 'paid');
    return !(isDelivered && isPaid);
  }).length;
  return (
    <aside className="w-48 bg-surface-panel text-text-primary flex flex-col justify-between border-r border-border-subtle h-full max-h-screen flex-shrink-0 select-none overflow-hidden">
      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
        {/* Brand Header */}
        <div className="p-3 flex items-center gap-2 border-b border-border-subtle flex-shrink-0 sticky top-0 bg-surface-panel z-10">
          <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center font-bold text-xs text-white shadow-subtle shrink-0">
            M
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-xs tracking-tight text-text-primary truncate">MEAT SHOP POS</h1>
            <p className="text-[8.5px] text-brand-500 font-bold uppercase tracking-wider truncate">Enterprise Carbon</p>
          </div>
        </div>
        {/* Navigation Items */}
        {unreviewedOversoldCount > 0 && (
          <div className="mx-2 mt-1.5 px-2 py-1.5 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-1.5 text-rose-500 shadow-sm cursor-pointer hover:bg-rose-500/20 transition-colors flex-shrink-0" onClick={() => onNavigate('inventory')}>
            <AlertTriangle size={13} className="animate-pulse shrink-0" />
            <span className="text-[9.5px] font-bold leading-tight truncate">{unreviewedOversoldCount} oversold item(s)</span>
          </div>
        )}
        <nav className="p-1.5 space-y-0.5">
          <button
            onClick={() => onNavigate('billing')}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
              activePage === 'billing'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <ShoppingCart size={15} className="shrink-0" />
            <span className="flex-1 text-left truncate">Billing / POS</span>
          </button>

          <button
            onClick={() => onNavigate('inventory')}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
              activePage === 'inventory'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <Package size={15} className="shrink-0" />
            <span className="flex-1 text-left truncate">Inventory / Stock</span>
            {lowStockBadgeCount > 0 && (
              <span className="bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full shadow-sm animate-pulse">
                {lowStockBadgeCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onNavigate('delivery')}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
              activePage === 'delivery'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <Truck size={15} className="shrink-0" />
            <span className="flex-1 text-left truncate">Delivery</span>
            {pendingDeliveryCount > 0 && (
              <span className="bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full shadow-sm">
                {pendingDeliveryCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onNavigate('purchases')}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
              activePage === 'purchases'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <Package size={15} className="shrink-0" />
            <span className="flex-1 text-left truncate">Purchases</span>
          </button>

          <button
            onClick={() => onNavigate('payments')}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
              activePage === 'payments'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <CreditCard size={15} className="shrink-0" />
            <span className="flex-1 text-left truncate">Payments & Receipts</span>
          </button>

          <button
            onClick={() => onNavigate('reports')}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
              activePage === 'reports'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <BarChart3 size={15} className="shrink-0" />
            <span className="flex-1 text-left truncate">Reports / Sales</span>
          </button>

          <button
            onClick={() => onNavigate('products')}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
              activePage === 'products'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <LayoutGrid size={15} className="shrink-0" />
            <span className="flex-1 text-left truncate">Products</span>
          </button>


          <button
            onClick={() => onNavigate('customers')}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
              activePage === 'customers'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <Users size={15} className="shrink-0" />
            <span className="flex-1 text-left truncate">Customers / CRM</span>
          </button>

          <button
            onClick={() => onNavigate('ar_reports')}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
              activePage === 'ar_reports'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <Landmark size={15} className="shrink-0" />
            <span className="flex-1 text-left truncate">Credit & A/R</span>
          </button>

          <button
            onClick={() => onNavigate('hr')}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
              activePage === 'hr'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <Users size={15} className="shrink-0" />
            <span className="flex-1 text-left truncate">HR & Payroll</span>
          </button>

          <button
            onClick={() => onNavigate('cashbox')}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
              activePage === 'cashbox'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <Lock size={15} className="shrink-0" />
            <span className="flex-1 text-left truncate">Cash Box & Shifts</span>
          </button>

          <button
            onClick={() => onNavigate('expenses')}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
              activePage === 'expenses'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <Receipt size={15} className="shrink-0" />
            <span className="flex-1 text-left truncate">Expenses</span>
          </button>

          <button
            onClick={() => onNavigate('prices')}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
              activePage === 'prices'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <TrendingUp size={15} className="shrink-0" />
            <span className="flex-1 text-left truncate">Market Rates</span>
          </button>

          <button
            onClick={() => onNavigate('ledgers')}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
              activePage === 'ledgers'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <BookOpen size={15} className="shrink-0" />
            <span className="flex-1 text-left truncate">Daily Ledgers</span>
          </button>



          <button
            onClick={() => onNavigate('health')}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
              activePage === 'health'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <Activity size={15} className="shrink-0" />
            <span className="flex-1 text-left truncate">Diagnostics</span>
          </button>

          <button
            onClick={() => onNavigate('forecasting')}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
              activePage === 'forecasting'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <TrendingUp size={15} className="shrink-0" />
            <span className="flex-1 text-left truncate">Demand Forecasting</span>
          </button>

          <button
            onClick={() => onNavigate('settings')}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
              activePage === 'settings'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <SettingsIcon size={15} className="shrink-0" />
            <span className="flex-1 text-left truncate">Settings</span>
          </button>

          <button
            onClick={() => onNavigate('help')}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
              activePage === 'help'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <HelpCircle size={15} className="shrink-0" />
            <span className="flex-1 text-left truncate">System Help</span>
          </button>
        </nav>

        {/* Held Bills Badge */}
        {heldCount > 0 && (
          <div className="mx-2 px-2 py-1.5 bg-amber-950/40 border border-amber-800/40 rounded-lg mt-1">
            <div className="flex items-center gap-1.5 text-[10px] text-amber-400 font-bold">
              <Pause size={13} className="shrink-0" />
              <span className="truncate">{heldCount} held bill{heldCount !== 1 ? 's' : ''}</span>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar Footer */}
      <div className="p-2 border-t border-border-subtle space-y-1.5 flex-shrink-0 bg-surface-panel z-10">
        <button
          onClick={onToggleTheme}
          className="w-full flex items-center justify-between px-2 py-1.5 bg-surface-card hover:bg-surface-hover rounded-lg border border-border-subtle text-[10px] font-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          <span className="flex items-center gap-1.5 truncate">
            {theme === 'dark' ? <Sun size={11} className="text-amber-400 shrink-0" /> : <Moon size={11} className="shrink-0" />}
            <span className="truncate">{theme === 'dark' ? 'Dark Carbon' : 'Light Mode'}</span>
          </span>
          <span className="font-mono text-[8.5px] opacity-60 ml-1">Ctrl+T</span>
        </button>

        {session && (
          <div className="flex items-center justify-between p-2 bg-surface-card rounded-lg border border-border-subtle text-[10px] font-medium transition-colors shadow-xs">
            <div className="flex flex-col min-w-0 mr-1">
              <span className="text-text-primary font-bold leading-tight truncate">{session.username}</span>
              <span className="text-[8.5px] text-brand-500 font-bold uppercase tracking-wider truncate">{session.role}</span>
            </div>
            <button
              onClick={() => logoutMutation.mutate()}
              className="px-2 py-0.5 bg-red-500 border-none hover:bg-red-600 active:bg-red-700 text-white rounded text-[8.5px] font-bold uppercase transition-all shadow-sm cursor-pointer shrink-0"
            >
              Sign Out
            </button>
          </div>
        )}

        <div className="flex items-center gap-1.5 text-[9px] text-text-muted px-1">
          <Terminal size={11} className="shrink-0" />
          <span className="truncate">Local Engine Active</span>
        </div>
      </div>
    </aside>
  );
}

// ─── Statusbar ────────────────────────────────────────────────────────────────
function Statusbar({ dbHealth, sysInfo }: { dbHealth: any; sysInfo: any }) {
  const [time, setTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  const isConnected = dbHealth?.status === 'healthy' || dbHealth?.status === 'OK' || dbHealth?.active === true;

  return (
    <footer className="h-8 bg-surface-panel border-t border-border-subtle px-4 flex items-center justify-between text-[11px] text-text-secondary font-medium select-none flex-shrink-0">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-brand-500' : 'bg-red-500'}`} />
          <span>Database: <strong className={isConnected ? 'text-brand-500' : 'text-red-400'}>{isConnected ? 'Connected' : 'Offline'}</strong></span>
        </div>
        <div>
          <span>Migrations: <strong className="text-text-primary">{dbHealth?.appliedMigrations || 0}</strong></span>
        </div>
        <div className="border-l border-border-subtle pl-4">
          <span className="uppercase text-[9px] bg-surface-card border border-border-subtle text-text-secondary px-1.5 py-0.5 rounded font-bold font-mono">
            {sysInfo?.env || 'Loading'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-6 mr-14">
        <div className="hidden md:block">
          <span>Platform: <span className="font-mono text-text-primary">{sysInfo?.platform || ''} ({sysInfo?.arch || ''})</span></span>
        </div>
        <div className="hidden lg:block">
          <span>Electron: <span className="font-mono text-text-primary">{sysInfo?.electronVersion || ''}</span></span>
        </div>
        <div className="flex items-center gap-1.5 font-mono font-semibold text-text-primary bg-surface-card/60 px-2 py-0.5 rounded border border-border-subtle/50">
          <Clock size={12} className="text-brand-500" />
          <span>{time}</span>
        </div>
      </div>
    </footer>
  );
}

// ─── Billing POS View ─────────────────────────────────────────────────────────
function BillingView() {
  const cart = useCart();
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  const configQuery = useQuery<AppConfig>({
    queryKey: ['config'],
    queryFn: () => window.api.invoke(IPC_CHANNELS.CONFIG.GET).then((res: any) => {
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    })
  });

  const [showWeightEntry, setShowWeightEntry] = useState(false);
  const [showPaymentPanel, setShowPaymentPanel] = useState(false);
  const [showHeldBills, setShowHeldBills] = useState(false);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [showFridgePicker, setShowFridgePicker] = useState(false);

  const [weightEntryMeta, setWeightEntryMeta] = useState({ itemId: 0, variantName: '', ratePaise: 0, isNewItem: false, variantId: 0 });
  const [overrideMeta] = useState({ variantId: 0, variantName: '', currentRatePaise: 0, quantityGrams: 0, quantityUnits: 0, unitType: 'weight' as 'weight' | 'piece' });

  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [catalogSearchTerm, setCatalogSearchTerm] = useState('');
  const [lastCompletedInvoice, setLastCompletedInvoice] = useState<InvoiceDetail | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'card' | 'credit' | 'split' | null>(null);



  // Modals for Last Bill Edit & Void
  const [showEditPasswordModal, setShowEditPasswordModal] = useState(false);
  const [editPassword, setEditPassword] = useState('');
  const [editError, setEditError] = useState('');

  const [showVoidConfirmModal, setShowVoidConfirmModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState('');

  // Reprint Modals
  const [showReprintChoiceModal, setShowReprintChoiceModal] = useState(false);
  const [showReprintLookupModal, setShowReprintLookupModal] = useState(false);

  // UPI Customer Prompt Modal (Phase 3 Billing-Time Identification)
  const [showUpiPrompt, setShowUpiPrompt] = useState(false);
  const [pendingUpiPayment, setPendingUpiPayment] = useState<{
    method: 'cash' | 'upi' | 'card' | 'credit' | 'split';
    amountPaise: number;
    referenceNumber?: string | null;
  } | null>(null);

  const customerId = cart.activeInvoice?.customer_id ?? null;
  const { data: customer } = useCustomer(customerId);
  const { data: customerIntelligence } = useCustomerIntelligence(customerId);
  const { data: activeVariants } = useActiveRates();

  const focusEnterBillBar = useCallback(() => {
    const doFocus = () => {
      const input = document.getElementById('quick-product-search-input') as HTMLInputElement | null;
      if (input) {
        input.focus();
      }
    };
    doFocus();
    requestAnimationFrame(doFocus);
    setTimeout(doFocus, 50);
    setTimeout(doFocus, 150);
  }, []);

  const refreshLastCompleted = useCallback(async () => {
    try {
      const res = await window.api.invoke(IPC_CHANNELS.BILLING.GET_LAST_COMPLETED);
      if (res && res.success && res.data) {
        setLastCompletedInvoice(res.data);
      }
    } catch (e) {
      console.error('Failed to load last completed invoice:', e);
    }
  }, []);

  // Initialize or restore active draft on mount & fetch last completed bill directly from database
  useEffect(() => {
    cart.initActiveDraft();
    refreshLastCompleted();
  }, [refreshLastCompleted]);

  // Auto-focus Enter Bill Bar on initial mount / navigation to billing
  useEffect(() => {
    focusEnterBillBar();
    const t1 = setTimeout(focusEnterBillBar, 50);
    const t2 = setTimeout(focusEnterBillBar, 200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [focusEnterBillBar]);

  // Auto-return focus to enter bill bar whenever any modal closes
  useEffect(() => {
    const hasAnyModal = (
      showWeightEntry ||
      showPaymentPanel ||
      showHeldBills ||
      showOverrideDialog ||
      showEditPasswordModal ||
      showVoidConfirmModal ||
      showReprintChoiceModal ||
      showReprintLookupModal
    );
    if (!hasAnyModal) {
      focusEnterBillBar();
    }
  }, [
    showWeightEntry,
    showPaymentPanel,
    showHeldBills,
    showOverrideDialog,
    showEditPasswordModal,
    showVoidConfirmModal,
    showReprintChoiceModal,
    showReprintLookupModal,
    focusEnterBillBar
  ]);

  // Global window click & Escape listener:
  // If user clicks anywhere (left sidebar, right catalog, top bar, lower bar, borders, margins) on non-interactive areas,
  // immediately focus the enter bill bar.
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const hasOpenModal = (
        showWeightEntry ||
        showPaymentPanel ||
        showHeldBills ||
        showOverrideDialog ||
        showEditPasswordModal ||
        showVoidConfirmModal ||
        showReprintChoiceModal ||
        showReprintLookupModal
      );
      if (hasOpenModal) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (target.closest('[role="dialog"], [aria-modal="true"], .modal')) {
        return;
      }

      const isInteractive = target.closest('input, textarea, select, button, a, label, [contenteditable="true"], [role="button"], [tabindex]:not([tabindex="-1"])');
      if (isInteractive) {
        return;
      }

      focusEnterBillBar();
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const hasOpenModal = (
          showWeightEntry ||
          showPaymentPanel ||
          showHeldBills ||
          showOverrideDialog ||
          showEditPasswordModal ||
          showVoidConfirmModal ||
          showReprintChoiceModal ||
          showReprintLookupModal
        );
        if (!hasOpenModal) {
          setSelectedVariant(null);
          setSearchTerm('');
          focusEnterBillBar();
        }
      }
    };

    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [
    showWeightEntry,
    showPaymentPanel,
    showHeldBills,
    showOverrideDialog,
    showEditPasswordModal,
    showVoidConfirmModal,
    showReprintChoiceModal,
    showReprintLookupModal,
    focusEnterBillBar
  ]);

  const handleCustomerChange = async (cust: Customer | null) => {
    try {
      await cart.linkCustomer(cust ? cust.id : null);
      setTimeout(focusEnterBillBar, 50);
    } catch (err: any) {
      console.error('Customer link error:', err);
    }
  };

  const handlePrintLastReceipt = async () => {
    if (!lastCompletedInvoice) return;
    try {
      await window.api.invoke('billing:print-receipt', { invoice_id: lastCompletedInvoice.invoice.id });
    } catch (err: any) {
      console.error('Printing failed:', err);
    } finally {
      setTimeout(focusEnterBillBar, 50);
    }
  };

  const handlePrintReceiptById = async (invoiceId: number) => {
    try {
      await window.api.invoke('billing:print-receipt', { invoice_id: invoiceId });
    } catch (err: any) {
      console.error('Printing failed:', err);
    } finally {
      setTimeout(focusEnterBillBar, 50);
    }
  };

  const handleReprintClick = () => {
    if (lastCompletedInvoice) {
      setShowReprintChoiceModal(true);
    } else {
      setShowReprintLookupModal(true);
    }
  };

  const handleAddProduct = async (variant: ProductVariant, quantityGrams: number | null, quantityUnits: number | null) => {
    if (!cart.activeInvoiceId) {
      await cart.createDraft();
    }
    await cart.addItem({ product_variant_id: variant.id, quantity_grams: quantityGrams, quantity_units: quantityUnits });
    setTimeout(focusEnterBillBar, 50);
  };

  const handleAddUsualOrder = async () => {
    if (!customerIntelligence?.typical_basket || customerIntelligence.typical_basket.length === 0) return;
    if (!cart.activeInvoiceId) {
      await cart.createDraft();
    }
    for (const item of customerIntelligence.typical_basket) {
      await cart.addItem({
        product_variant_id: item.product_variant_id,
        quantity_grams: item.typical_quantity_grams,
        quantity_units: item.typical_quantity_units,
      });
    }
    setTimeout(focusEnterBillBar, 50);
  };

  const handleWeightConfirm = async (grams: number) => {
    await cart.updateItemQuantity(weightEntryMeta.itemId, grams, null);
    setShowWeightEntry(false);
    setTimeout(focusEnterBillBar, 50);
  };

  const handleOpenWeightEntry = (itemId: number, variantName: string, ratePaise: number) => {
    setWeightEntryMeta({ itemId, variantName, ratePaise, isNewItem: false, variantId: 0 });
    setShowWeightEntry(true);
  };

  const handleOverrideConfirm = async (newRatePaise: number, reason: string) => {
    await cart.addItem({
      product_variant_id: overrideMeta.variantId,
      quantity_grams: (overrideMeta.unitType === 'weight' || (overrideMeta.unitType as any) === 'live_dual') ? overrideMeta.quantityGrams : null,
      quantity_units: overrideMeta.unitType === 'piece' ? overrideMeta.quantityUnits : null,
      override_rate_paise: newRatePaise,
      override_reason: reason,
      overridden_by: 1,
    });
    setShowOverrideDialog(false);
    setTimeout(focusEnterBillBar, 50);
  };

  const handleResume = async (invoiceId: number) => {
    await cart.resumeInvoice(invoiceId);
    setShowHeldBills(false);
    queryClient.invalidateQueries({ queryKey: ['billing', 'held'] });
    setTimeout(focusEnterBillBar, 50);
  };

  const handleRecordPayment = async (method: 'cash' | 'upi' | 'card' | 'credit' | 'split', amountPaise: number, referenceNumber?: string | null) => {
    if (method === 'upi' && !customerId) {
      setPendingUpiPayment({ method, amountPaise, referenceNumber });
      setShowUpiPrompt(true);
      return;
    }
    if (method !== 'credit') {
      await cart.recordPayment(method as any, amountPaise, referenceNumber);
    }
  };

  const handleUpiPromptSelectCustomer = async (cust: Customer) => {
    await cart.linkCustomer(cust.id);
    setShowUpiPrompt(false);
    if (pendingUpiPayment) {
      await cart.recordPayment(pendingUpiPayment.method as any, pendingUpiPayment.amountPaise, pendingUpiPayment.referenceNumber);
      setPendingUpiPayment(null);
      await handleComplete();
    }
  };

  const handleUpiPromptSkip = async () => {
    setShowUpiPrompt(false);
    if (pendingUpiPayment) {
      await cart.recordPayment(pendingUpiPayment.method as any, pendingUpiPayment.amountPaise, pendingUpiPayment.referenceNumber);
      setPendingUpiPayment(null);
      await handleComplete();
    }
  };

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDeliveryOrder, setIsDeliveryOrder] = useState(false);
  const [deliveryConfig, setDeliveryConfig] = useState<CreateDeliveryInput | null>(null);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [flowBDeliveryInvoice, setFlowBDeliveryInvoice] = useState<InvoiceDetail | null>(null);
  const [pendingHomeDeliveryInvoice, setPendingHomeDeliveryInvoice] = useState<InvoiceDetail | null>(null);

  const handleSaleComplete = (invoice: InvoiceDetail, printType: 'both' | 'normal' | 'token' | 'none' = 'normal') => {
    // 1. Instant Synchronous UI State Reset (0ms)
    setLastCompletedInvoice(invoice);
    setShowPaymentPanel(false);
    setSelectedVariant(null);
    setSearchTerm('');
    setCatalogSearchTerm('');

    const invNo = invoice.invoice.invoice_number ? `#${invoice.invoice.invoice_number.split('_')[0]}` : `#${invoice.invoice.id}`;
    setToastMessage(`Bill ${invNo} completed`);
    setTimeout(() => setToastMessage(null), 1500);

    console.log('[DELIVERY-CHECK]', 'isDeliveryOrder at complete time:', isDeliveryOrder, 'invoice.id:', invoice?.invoice?.id);

    // Flow A: If this was marked as Home Delivery
    if (isDeliveryOrder && invoice.invoice.id) {
      let activeCustomer = customer;
      if (!activeCustomer && invoice.invoice.customer_id) {
        activeCustomer = queryClient.getQueryData(['customer', invoice.invoice.customer_id]) as any;
      }
      const custName = (activeCustomer?.name || '').trim();
      const isWalkIn = !custName || custName.toLowerCase() === 'walk-in' || custName.toLowerCase() === 'walk-in customer';
      const validName = isWalkIn ? '' : custName;
      const custPhone = (activeCustomer?.whatsapp || activeCustomer?.phone || activeCustomer?.phone2 || '').trim();

      if (validName && custPhone) {
        // Customer name + mobile already present on the bill: create delivery ticket automatically, zero popup!
        const deliveryAddress = activeCustomer?.shipping_address_line1 || activeCustomer?.billing_address_line1 || '';
        const deliveryPayload = {
          invoice_id: invoice.invoice.id,
          invoice_number: invoice.invoice.invoice_number,
          customer_id: activeCustomer?.id || null,
          customer_name: validName,
          customer_phone: custPhone,
          delivery_address_snapshot: deliveryAddress,
          payment_method: invoice.payments[0]?.method || paymentMethod || 'cash',
          subtotal_paise: invoice.invoice.subtotal_paise,
          total_paise: invoice.invoice.total_paise,
        };
        console.log('[DELIVERY-IPC-CALL]', 'Sending delivery:create payload:', JSON.stringify(deliveryPayload));
        window.api.invoke(IPC_CHANNELS.DELIVERY.CREATE, deliveryPayload).then((res: any) => {
          console.log('[DELIVERY-IPC-RESULT]', 'Auto-create res:', JSON.stringify(res));
          if (!res?.success) {
            console.error('Failed to auto-create delivery record:', res?.error);
            setToastMessage(`Delivery ticket error: ${res?.error?.message || 'Failed'}`);
          } else {
            queryClient.invalidateQueries({ queryKey: ['deliveries'] });
            setToastMessage(`✓ Delivery ticket created for Bill ${invNo}`);
            setTimeout(() => setToastMessage(null), 2500);

            // Automatically print delivery ticket
            window.api.invoke('billing:print-receipt', {
              invoice_id: invoice.invoice.id,
              printType: 'token',
              isInitialPrint: true,
            }).catch(pErr => {
              console.warn('Background delivery ticket print skipped/failed:', pErr);
            });
          }
        }).catch((e: any) => {
          console.error('Failed to auto-create delivery record:', e);
        });
        setIsDeliveryOrder(false);
      } else {
        // Missing name or phone: show popup "Enter customer name + mobile for delivery"
        console.log('[DELIVERY-CHECK]', 'Customer name or phone missing, setting pendingHomeDeliveryInvoice. Name:', validName, 'Phone:', custPhone);
        setPendingHomeDeliveryInvoice(invoice);
        setIsDeliveryOrder(false);
      }
      setDeliveryConfig(null);
    }

    // 2. Immediate Direct DOM Focus on the search input
    focusEnterBillBar();
    const directInput = document.getElementById('quick-product-search-input') as HTMLInputElement | null;
    if (directInput) {
      directInput.value = '';
      directInput.focus();
    }

    // 3. Background Asynchronous Printing (zero UI blocking)
    if (printType !== 'none') {
      window.api.invoke('billing:print-receipt', { invoice_id: invoice.invoice.id, printType, isInitialPrint: true }).catch(e => {
        console.warn('Background receipt print warning:', e);
      });
    }

    // 3b. Automatic Background WhatsApp Dispatch (Option B)
    // If customer has a mobile number attached, dispatch silently in background with 0 clicks.
    // If no mobile number is attached, skip silently (no error, no modal, no disturbance).
    const targetCustomerPhone = customer?.whatsapp || customer?.phone || customer?.phone2 || '';
    if (targetCustomerPhone && targetCustomerPhone.trim()) {
      window.api.invoke(IPC_CHANNELS.BILLING.SEND_WHATSAPP_BILL, {
        invoice_id: invoice.invoice.id,
        customPhone: targetCustomerPhone.trim(),
      }).catch(waErr => {
        console.warn('Background WhatsApp bill dispatch skipped/failed:', waErr);
      });
    }

    // 4. Background Fresh Draft Initialization & Cache Invalidation
    cart.createDraft().then(() => {
      focusEnterBillBar();
    }).catch(console.error);

    queryClient.invalidateQueries({ queryKey: ['billing', 'held'] });

    // 5. Continuous Focus Settling
    requestAnimationFrame(focusEnterBillBar);
    setTimeout(focusEnterBillBar, 20);
    setTimeout(focusEnterBillBar, 80);
    setTimeout(focusEnterBillBar, 150);
  };

  const handleFlowBDeliveryConfirm = async (config: CreateDeliveryInput) => {
    if (!flowBDeliveryInvoice) return;
    try {
      const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.CREATE, {
        ...config,
        invoice_id: flowBDeliveryInvoice.invoice.id,
        invoice_number: flowBDeliveryInvoice.invoice.invoice_number,
        subtotal_paise: flowBDeliveryInvoice.invoice.subtotal_paise,
        total_paise: flowBDeliveryInvoice.invoice.total_paise,
      });
      if (res && !res.success) {
        throw new Error(res.error?.message || 'Failed to dispatch delivery');
      }
      setToastMessage(`Bill #${flowBDeliveryInvoice.invoice.invoice_number?.split('_')[0] || flowBDeliveryInvoice.invoice.id} dispatched for Delivery`);
      setTimeout(() => setToastMessage(null), 2500);
      setFlowBDeliveryInvoice(null);
    } catch (e: any) {
      alert(e.message || 'Failed to dispatch delivery');
    }
  };

  const handleSaveHomeDeliveryTicket = async (details: { customerName: string; customerPhone: string; address: string }) => {
    if (!pendingHomeDeliveryInvoice) return;
    try {
      const ticketPayload = {
        invoice_id: pendingHomeDeliveryInvoice.invoice.id,
        invoice_number: pendingHomeDeliveryInvoice.invoice.invoice_number,
        customer_id: customer?.id || pendingHomeDeliveryInvoice.invoice.customer_id || null,
        customer_name: details.customerName,
        customer_phone: details.customerPhone,
        delivery_address_snapshot: details.address,
        payment_method: pendingHomeDeliveryInvoice.payments[0]?.method || paymentMethod || 'cash',
        subtotal_paise: pendingHomeDeliveryInvoice.invoice.subtotal_paise,
        total_paise: pendingHomeDeliveryInvoice.invoice.total_paise,
      };
      console.log('[DELIVERY-IPC-CALL]', 'handleSaveHomeDeliveryTicket payload:', JSON.stringify(ticketPayload));
      const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.CREATE, ticketPayload);
      console.log('[DELIVERY-IPC-RESULT]', 'handleSaveHomeDeliveryTicket res:', JSON.stringify(res));
      if (res && !res.success) {
        throw new Error(res.error?.message || 'Failed to create delivery ticket');
      }
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });

      // Automatically dispatch WhatsApp bill if phone was provided
      if (details.customerPhone && details.customerPhone.trim()) {
        window.api.invoke(IPC_CHANNELS.BILLING.SEND_WHATSAPP_BILL, {
          invoice_id: pendingHomeDeliveryInvoice.invoice.id,
          customPhone: details.customerPhone.trim(),
        }).catch(waErr => {
          console.warn('Background WhatsApp delivery ticket dispatch skipped/failed:', waErr);
        });
      }

      // Automatically print delivery token slip
      window.api.invoke('billing:print-receipt', {
        invoice_id: pendingHomeDeliveryInvoice.invoice.id,
        printType: 'token',
        isInitialPrint: true,
      }).catch(pErr => {
        console.warn('Background delivery token print skipped/failed:', pErr);
      });

      setToastMessage('Delivery ticket created');
      setTimeout(() => setToastMessage(null), 1500);
    } catch (e: any) {
      console.error('Failed to create delivery ticket:', e);
      alert(e.message || 'Failed to create delivery ticket');
    } finally {
      setPendingHomeDeliveryInvoice(null);
    }
  };

  const handleSkipHomeDeliveryTicket = async () => {
    if (!pendingHomeDeliveryInvoice) return;
    try {
      // Skip still creates the ticket, just without contact details (blank)
      const skipPayload = {
        invoice_id: pendingHomeDeliveryInvoice.invoice.id,
        invoice_number: pendingHomeDeliveryInvoice.invoice.invoice_number,
        customer_id: null,
        customer_name: '',
        customer_phone: '',
        delivery_address_snapshot: '',
        payment_method: pendingHomeDeliveryInvoice.payments[0]?.method || paymentMethod || 'cash',
        subtotal_paise: pendingHomeDeliveryInvoice.invoice.subtotal_paise,
        total_paise: pendingHomeDeliveryInvoice.invoice.total_paise,
      };
      console.log('[DELIVERY-IPC-CALL]', 'handleSkipHomeDeliveryTicket payload:', JSON.stringify(skipPayload));
      const res = await window.api.invoke(IPC_CHANNELS.DELIVERY.CREATE, skipPayload);
      console.log('[DELIVERY-IPC-RESULT]', 'handleSkipHomeDeliveryTicket res:', JSON.stringify(res));
      if (res && !res.success) {
        throw new Error(res.error?.message || 'Failed to create delivery ticket');
      }
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });

      // Automatically print delivery token slip
      window.api.invoke('billing:print-receipt', {
        invoice_id: pendingHomeDeliveryInvoice.invoice.id,
        printType: 'token',
        isInitialPrint: true,
      }).catch(pErr => {
        console.warn('Background delivery token print skipped/failed:', pErr);
      });

      setToastMessage('Delivery ticket created');
      setTimeout(() => setToastMessage(null), 1500);
    } catch (e: any) {
      console.error('Failed to create delivery ticket:', e);
      alert(e.message || 'Failed to create delivery ticket');
    } finally {
      setPendingHomeDeliveryInvoice(null);
    }
  };

  const handleComplete = async () => {
    console.log('[DELIVERY-CHECK-MODAL]', 'isDeliveryOrder in handleComplete:', isDeliveryOrder);
    const completePayload = {
      is_delivery: isDeliveryOrder,
      delivery_charge_paise: isDeliveryOrder ? (deliveryConfig?.delivery_charge_paise || 0) : 0,
    };
    console.log('[MODAL-COMPLETE-INVOICE-PAYLOAD]', JSON.stringify(completePayload));
    const result = await cart.completeInvoice(completePayload);
    setShowPaymentPanel(false);
    if (result) {
      handleSaleComplete(result);
    }
  };

  const handleEditBillConfirm = async () => {
    if (!lastCompletedInvoice) return;
    setEditError('');
    try {
      const verifyRes = await window.api.invoke('billing:verify-action-password', { password: editPassword });
      if (!verifyRes.success || !verifyRes.data) {
        setEditError('Invalid password. Edit authorization failed.');
        return;
      }
      const reopenRes = await window.api.invoke('billing:reopen-invoice', { 
        invoice_id: lastCompletedInvoice.invoice.id,
        password: editPassword,
      });
      if (reopenRes.success) {
        setShowEditPasswordModal(false);
        setEditPassword('');
        await cart.loadInvoice(lastCompletedInvoice.invoice.id);

        // Auto-load linked customer or clear for walk-in (no forced selection)
        if (lastCompletedInvoice.invoice.customer_id) {
          try {
            const custRes = await window.api.invoke('customers:get', { customer_id: lastCompletedInvoice.invoice.customer_id });
            if (custRes.success && custRes.data) {
              setCustomer(custRes.data);
              setCustomerId(custRes.data.id);
            }
          } catch (e) {}
        } else {
          setCustomer(null);
          setCustomerId(null);
        }

        queryClient.invalidateQueries({ queryKey: ['billing', 'held'] });
        await refreshLastCompleted();
        setTimeout(focusEnterBillBar, 50);
      } else {
        setEditError(reopenRes.error?.message || 'Failed to reopen invoice for editing');
      }
    } catch (err: any) {
      setEditError(err.message || 'Authorization failed');
    }
  };

  const handleVoidBillConfirm = async () => {
    if (!lastCompletedInvoice) return;
    setVoidError('');
    try {
      const res = await window.api.invoke('billing:delete-invoice', {
        invoice_id: lastCompletedInvoice.invoice.id,
        reason: voidReason.trim() || 'Customer requested cancellation / cashier correction',
      });
      if (res.success) {
        setShowVoidConfirmModal(false);
        setVoidReason('');
        await refreshLastCompleted();
        queryClient.invalidateQueries({ queryKey: ['billing', 'held'] });
        setTimeout(focusEnterBillBar, 50);
      } else {
        setVoidError(res.error?.message || 'Failed to void invoice');
      }
    } catch (err: any) {
      setVoidError(err.message || 'Void operation failed');
    }
  };

  const subtotalPaise = cart.items.reduce((s, i) => s + i.line_subtotal_paise, 0);
  const taxPaise = cart.items.reduce((s, i) => s + calculateLineTax(i.line_subtotal_paise, i.gst_rate_percent_snapshot), 0);
  const totalPaise = subtotalPaise + taxPaise;

  const handleBillingContainerClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isInteractive = target.closest('input, textarea, select, button, a, label, [contenteditable="true"], [role="button"], [tabindex]:not([tabindex="-1"])');
    if (!isInteractive) {
      focusEnterBillBar();
    }
  };

  return (
    <div className="flex h-full overflow-hidden bg-surface-app text-text-primary relative" onClick={handleBillingContainerClick}>
      {/* Auto-dismissing Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] bg-emerald-600 border-2 border-emerald-400 text-white font-black text-sm px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in zoom-in-95 duration-200">
          <CheckCircle2 size={20} className="text-white animate-bounce" />
          <span>{toastMessage}</span>
        </div>
      )}
      {/* Center Column: Link Customer (Top) + Product Quick Search (Second) + Cart Page (Main) */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-border-subtle bg-surface-app overflow-hidden">
        {/* 1. Link Customer Account Bar (Top) */}
        <div className="px-3.5 py-2 border-b border-border-subtle bg-surface-panel flex-shrink-0">
          <label className="block text-[9px] uppercase font-extrabold tracking-wider text-brand-500 mb-1 select-none flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
            Link Customer Account
          </label>
          <CustomerSearch value={customer || null} onChange={handleCustomerChange} />
          
          {customer && (
            <div className="mt-2 bg-brand-500/10 border border-brand-500/30 rounded-xl p-2.5 text-xs animate-in fade-in duration-150 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-extrabold text-white text-[11px]">{customer.name}</span>
                  <span className="px-1.5 py-0.2 bg-brand-500/20 text-brand-300 border border-brand-500/40 rounded-full text-[9px] font-bold">
                    {customer.category}
                  </span>
                  {(customerIntelligence?.customer_segment || customer.customer_segment) && (
                    <span className={`px-1.5 py-0.2 border rounded-full text-[8px] font-bold flex items-center gap-0.5 ${getSegmentBadgeStyle(customerIntelligence?.customer_segment || customer.customer_segment).bg} ${getSegmentBadgeStyle(customerIntelligence?.customer_segment || customer.customer_segment).text} ${getSegmentBadgeStyle(customerIntelligence?.customer_segment || customer.customer_segment).border}`}>
                      <span>{getSegmentBadgeStyle(customerIntelligence?.customer_segment || customer.customer_segment).icon}</span>
                      <span>{getSegmentBadgeStyle(customerIntelligence?.customer_segment || customer.customer_segment).label}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px]">
                  {customer.outstanding_balance_paise > 0 && (
                    <span className="text-red-400 font-bold">
                      Due: ₹{(customer.outstanding_balance_paise / 100).toFixed(2)}
                    </span>
                  )}
                  {customer.advance_balance_paise > 0 && (
                    <span className="text-brand-400 font-bold">
                      Adv: ₹{(customer.advance_balance_paise / 100).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>

              {/* Single Line Regular Items Shortcut with Marquee */}
              {customerIntelligence && customerIntelligence.typical_basket.length > 0 && (
                <div className="flex items-center justify-between gap-2 bg-brand-500/10 border border-brand-500/30 px-2 py-1 rounded-md overflow-hidden">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden text-[10px]">
                    <Sparkles size={11} className="text-amber-400 shrink-0" />
                    <span className="font-bold text-brand-300 shrink-0">Regular:</span>
                    <div className="overflow-hidden whitespace-nowrap flex-1">
                      <div className="inline-block animate-marquee whitespace-nowrap text-text-primary font-medium">
                        {customerIntelligence.typical_basket_summary}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddUsualOrder}
                    className="px-2 py-0.5 bg-brand-500 hover:bg-brand-400 text-white rounded text-[10px] font-bold shrink-0 flex items-center gap-1 transition-all shadow-xs cursor-pointer"
                    title="Add regular items to bill"
                  >
                    <Plus size={10} />
                    <span>Add Usual</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 2. Product Quick Search & Selection */}
        <ProductQuickSearch
          onAddProduct={handleAddProduct}
          selectedVariant={selectedVariant}
          onSelectVariant={setSelectedVariant}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
        />

        {/* 3. Bill Sequence Cart Page */}
        <div className="flex-1 min-h-0">
          <Cart
            onOpenWeightEntry={handleOpenWeightEntry}
            onOpenPaymentPanel={() => setShowPaymentPanel(true)}
            onCompleteSale={handleSaleComplete}
            selectedPaymentMethod={paymentMethod}
            onSelectPaymentMethod={setPaymentMethod}
            skipPaymentConfirmation={configQuery.data?.billingSettings?.skipPaymentConfirmation ?? false}
            defaultPaymentMethod={configQuery.data?.billingSettings?.defaultPaymentMethod ?? 'cash'}
            deliveryChargePaise={isDeliveryOrder ? (deliveryConfig?.delivery_charge_paise || 0) : 0}
            onOpenDeliveryModal={() => {
              console.log('[APP-DELIVERY-TOGGLE]', 'before:', isDeliveryOrder);
              setIsDeliveryOrder(prev => {
                console.log('[APP-DELIVERY-TOGGLE]', 'transitioning to:', !prev);
                return !prev;
              });
            }}
            onToggleDelivery={() => {
              console.log('[APP-DELIVERY-TOGGLE]', 'before:', isDeliveryOrder);
              setIsDeliveryOrder(prev => {
                console.log('[APP-DELIVERY-TOGGLE]', 'transitioning to:', !prev);
                return !prev;
              });
            }}
            isDeliveryOrder={isDeliveryOrder}
          />
        </div>

        {/* Customer Outstanding Balance & Purchase History Panel (Only renders when a customer is selected) */}
        <CustomerOutstandingHistoryPanel customer={customer} />

        {/* 4. Parked / Held Bills Trigger */}
        <div className="p-3 border-t border-border-subtle bg-surface-panel flex-shrink-0">
          <button
            onClick={() => setShowHeldBills(true)}
            className="btn-secondary w-full text-xs font-bold py-2 cursor-pointer"
          >
            View Parked / Held Bills
          </button>
        </div>
      </div>

      {/* Right Column: Products Catalog + Search Name Bar + Always-Visible Last Bill Status */}
      <div className="w-[380px] lg:w-[420px] flex flex-col bg-surface-panel border-l border-border-subtle flex-shrink-0 overflow-hidden">
        {/* Product Cards Grid with Search by Name Top Bar */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ProductGrid
            onSelectVariant={setSelectedVariant}
            selectedVariant={selectedVariant}
            searchTerm={catalogSearchTerm}
            onSearchTermChange={setCatalogSearchTerm}
            onOpenFridgePicker={() => setShowFridgePicker(true)}
          />
        </div>

        {/* Static Always-Visible Last Bill Status Panel */}
        <div className="border-t border-border-subtle p-3 bg-surface-card/60 flex-shrink-0 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-text-primary">
              <CheckCircle2 size={15} className="text-brand-500" />
              <span>Last Bill Status</span>
            </div>
            {lastCompletedInvoice && (
              <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border ${
                lastCompletedInvoice.invoice.status === 'completed'
                  ? 'bg-brand-500/10 border-brand-500/50 text-brand-500'
                  : 'bg-red-950/40 border-red-800/40 text-red-400'
              }`}>
                {lastCompletedInvoice.invoice.status}
              </span>
            )}
          </div>

          {!lastCompletedInvoice ? (
            <div className="p-3 bg-surface-panel rounded-lg border border-border-subtle text-center text-text-muted text-xs">
              No completed bill recorded yet.
            </div>
          ) : (
            <div className="bg-surface-panel border border-border-subtle rounded-xl p-3 space-y-2.5 shadow-subtle">
              <div className="flex items-center justify-between border-b border-border-subtle/60 pb-2">
                <span className="text-[10px] uppercase font-mono tracking-wider text-text-muted">Completed Bill</span>
                <h4 className="text-xs font-extrabold text-brand-500 font-mono">
                  #{lastCompletedInvoice.invoice.invoice_number?.split('_')[0] || lastCompletedInvoice.invoice.id}
                </h4>
              </div>

              {/* Bill Metadata Grid */}
              <div className="grid grid-cols-3 gap-2 text-[10px] bg-surface-card p-2 rounded-lg border border-border-subtle/50">
                <div>
                  <span className="text-text-muted block text-[8px] uppercase font-bold">Date & Time</span>
                  <span className="font-mono text-text-primary font-semibold">
                    {new Date(lastCompletedInvoice.invoice.created_at).toLocaleDateString()} {new Date(lastCompletedInvoice.invoice.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted block text-[8px] uppercase font-bold">Payment Mode</span>
                  <span className="font-bold text-brand-500 uppercase font-mono">
                    {lastCompletedInvoice.payments[0]?.method || 'CASH'}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted block text-[8px] uppercase font-bold">Cashier</span>
                  <span className="text-text-primary font-semibold">Admin</span>
                </div>
                <div>
                  <span className="text-text-muted block text-[8px] uppercase font-bold">Customer</span>
                  <span className="text-text-primary font-semibold truncate block">
                    {lastCompletedInvoice.invoice.customer_id ? `Customer #${lastCompletedInvoice.invoice.customer_id}` : 'Walk-in'}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted block text-[8px] uppercase font-bold">Order Type</span>
                  {(lastCompletedInvoice.invoice as any).is_delivery ? (
                    <span className="font-extrabold text-brand-500 flex items-center gap-1">
                      <Truck size={11} /> Home Delivery
                    </span>
                  ) : (
                    <span className="font-semibold text-text-secondary">Walk-in</span>
                  )}
                </div>
              </div>

              {/* Detailed Item List */}
              <div className="space-y-1">
                <span className="text-[9px] uppercase font-extrabold text-text-muted block tracking-wider">Itemized Breakdown</span>
                <div className="border border-border-subtle rounded-lg overflow-y-auto max-h-[160px] text-[10px]">
                  <table className="w-full text-left relative">
                    <thead className="bg-surface-card sticky top-0 z-10 text-[8px] uppercase font-extrabold text-text-muted border-b border-border-subtle shadow-sm">
                      <tr>
                        <th className="px-2 py-1">Item</th>
                        <th className="px-1.5 py-1 text-center">Qty</th>
                        <th className="px-1.5 py-1 text-right">Rate</th>
                        <th className="px-2 py-1 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle/50 font-mono text-[10px]">
                      {lastCompletedInvoice.items.map(item => {
                        const matched = activeVariants?.find(v => v.id === item.product_variant_id);
                        const prodName = item.product_name || matched?.product_name || 'Product';
                        const varName = item.variant_name || matched?.variant_name || '';
                        return (
                          <tr key={item.id} className="hover:bg-surface-hover/50">
                            <td className="px-2 py-1 font-sans font-extrabold text-text-primary text-[10px]">
                              {prodName}
                              {varName && varName !== 'Default' && varName !== 'Standard' && (
                                <span className="text-[8px] font-normal text-text-muted block">({varName})</span>
                              )}
                            </td>
                            <td className="px-1.5 py-1 text-center text-text-secondary font-bold">
                              {item.quantity_grams ? `${(item.quantity_grams / 1000).toFixed(3)} kg` : `${item.quantity_units} pc`}
                            </td>
                            <td className="px-1.5 py-1 text-right text-text-secondary">
                              ₹{(item.rate_paise_snapshot / 100).toFixed(2)}
                            </td>
                            <td className="px-2 py-1 text-right font-extrabold text-brand-500">
                              ₹{(item.line_total_paise / 100).toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Net Amount Totals */}
              <div className="border-t border-border-subtle pt-1.5 flex justify-between text-xs font-extrabold text-text-primary">
                <span>Grand Total Net Amount:</span>
                <span className="font-mono text-brand-500 text-sm">
                  ₹{(lastCompletedInvoice.invoice.total_paise / 100).toFixed(2)}
                </span>
              </div>

              {/* Action Buttons: Reprint, Edit (Password), Delete (Confirm), Delivery Dispatch (Flow B) */}
              <div className="pt-2 pb-1 border-t border-border-subtle/60 grid grid-cols-3 gap-2">
                <button
                  onClick={handleReprintClick}
                  className="py-2 px-2 bg-brand-500 hover:bg-brand-600 active:scale-95 text-white rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-subtle"
                  title="Reprint Thermal Receipt"
                >
                  <Printer size={13} />
                  Reprint
                </button>
                <button
                  onClick={() => {
                    setEditPassword('');
                    setEditError('');
                    setShowEditPasswordModal(true);
                  }}
                  disabled={lastCompletedInvoice.invoice.status === 'void'}
                  className="py-2 px-2 bg-surface-card hover:bg-amber-950/40 text-amber-400 border border-amber-800/40 active:scale-95 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
                  title="Edit Completed Bill (Requires Password)"
                >
                  <Edit3 size={13} />
                  Edit
                </button>
                <button
                  onClick={() => {
                    setVoidReason('');
                    setVoidError('');
                    setShowVoidConfirmModal(true);
                  }}
                  disabled={lastCompletedInvoice.invoice.status === 'void'}
                  className="py-2 px-2 bg-surface-card hover:bg-red-950/40 text-red-400 border border-red-800/40 active:scale-95 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 shadow-sm"
                  title="Void / Delete Completed Bill (Requires Confirmation)"
                >
                  <Trash2 size={13} />
                  Delete
                </button>
              </div>

              {/* Flow B: Dispatch Completed Bill as Delivery */}
              {lastCompletedInvoice.invoice.status === 'completed' && (
                <button
                  onClick={() => setFlowBDeliveryInvoice(lastCompletedInvoice)}
                  className="w-full py-1.5 bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                >
                  <Truck size={13} className="text-purple-400" />
                  <span>Dispatch as Delivery (Flow B)</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit Password Modal */}
      {showEditPasswordModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface-panel border border-border-subtle rounded-xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-amber-400 border-b border-border-subtle pb-3">
              <Key size={18} />
              <h3 className="font-extrabold text-sm text-text-primary">Manager Password Authorization Required</h3>
            </div>
            <p className="text-xs text-text-muted">
              Enter Admin/Manager password to edit completed Bill <strong className="text-brand-500">#{lastCompletedInvoice?.invoice.invoice_number?.split('_')[0] || lastCompletedInvoice?.invoice.id}</strong>. This will reopen the bill into the active cart sequence.
            </p>
            {editError && (
              <div className="p-2.5 bg-red-950/40 border border-red-800/40 rounded-lg text-xs font-semibold text-red-400">
                {editError}
              </div>
            )}
            <input
              type="password"
              value={editPassword}
              onChange={e => setEditPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleEditBillConfirm()}
              placeholder="Enter password..."
              className="w-full bg-surface-card border border-border-subtle rounded-lg px-3 py-2 text-xs font-mono text-text-primary outline-none focus:border-brand-500"
              autoFocus
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setShowEditPasswordModal(false); setEditPassword(''); setEditError(''); }}
                className="btn-secondary text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleEditBillConfirm}
                className="btn-primary text-xs px-4 py-2 font-bold"
              >
                Authorize & Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete / Void Confirmation Modal */}
      {showVoidConfirmModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface-panel border border-red-900/40 rounded-xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-red-400 border-b border-border-subtle pb-3">
              <AlertTriangle size={18} />
              <h3 className="font-extrabold text-sm text-text-primary">Confirm Voiding Completed Bill</h3>
            </div>
            <p className="text-xs text-text-muted">
              Are you sure you want to void/delete completed Bill <strong className="text-brand-500">#{lastCompletedInvoice?.invoice.invoice_number?.split('_')[0] || lastCompletedInvoice?.invoice.id}</strong> (Total: ₹{((lastCompletedInvoice?.invoice.total_paise ?? 0) / 100).toFixed(2)})? This will reverse stock and accounting entries.
            </p>
            {voidError && (
              <div className="p-2.5 bg-red-950/40 border border-red-800/40 rounded-lg text-xs font-semibold text-red-400">
                {voidError}
              </div>
            )}
            <input
              type="text"
              value={voidReason}
              onChange={e => setVoidReason(e.target.value)}
              placeholder="Reason for voiding (optional)..."
              className="w-full bg-surface-card border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-brand-500"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setShowVoidConfirmModal(false); setVoidReason(''); setVoidError(''); }}
                className="btn-secondary text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleVoidBillConfirm}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all shadow-subtle"
              >
                Yes, Void Bill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reprint Choice Modal */}
      {showReprintChoiceModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface-panel border border-border-subtle rounded-xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center mx-auto">
              <Printer size={24} />
            </div>
            <h3 className="font-extrabold text-base text-text-primary">Reprint Bill Option</h3>
            <p className="text-xs text-text-muted">
              Would you like to print the most recent completed bill or search for a past bill?
            </p>

            <div className="space-y-2 pt-2">
              <button
                onClick={() => {
                  setShowReprintChoiceModal(false);
                  handlePrintLastReceipt();
                }}
                className="btn-primary w-full py-2.5 text-xs font-black shadow-subtle flex items-center justify-center gap-2"
              >
                <Printer size={14} /> Print Last Bill ({lastCompletedInvoice?.invoice.invoice_number?.split('_')[0] || `#${lastCompletedInvoice?.invoice.id}`})
              </button>
              <button
                onClick={() => {
                  setShowReprintChoiceModal(false);
                  setShowReprintLookupModal(true);
                }}
                className="btn-secondary w-full py-2.5 text-xs font-bold flex items-center justify-center gap-2"
              >
                <Search size={14} /> Find Another Bill
              </button>
            </div>

            <button
              onClick={() => setShowReprintChoiceModal(false)}
              className="text-[11px] text-text-muted hover:text-text-primary pt-2 block mx-auto font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Searchable Bill Lookup Modal */}
      {showReprintLookupModal && (
        <ReprintLookupModal
          onClose={() => {
            setShowReprintLookupModal(false);
            setTimeout(focusEnterBillBar, 50);
          }}
          onPrintReceipt={handlePrintReceiptById}
          onSelectBillForEdit={async (invoiceId) => {
            try {
              const res = await window.api.invoke('billing:get-invoice', { invoice_id: invoiceId });
              if (res.success && res.data?.invoice?.customer_id) {
                const custRes = await window.api.invoke('customers:get', { customer_id: res.data.invoice.customer_id });
                if (custRes.success && custRes.data) {
                  setCustomer(custRes.data);
                  setCustomerId(custRes.data.id);
                }
              } else {
                setCustomer(null);
                setCustomerId(null);
              }
            } catch (e) {}
            setTimeout(focusEnterBillBar, 50);
          }}
        />
      )}

      {/* Modals */}
      <WeightEntry
        isOpen={showWeightEntry}
        onClose={() => {
          setShowWeightEntry(false);
          setTimeout(focusEnterBillBar, 50);
        }}
        onConfirm={handleWeightConfirm}
        variantName={weightEntryMeta.variantName}
        ratePaise={weightEntryMeta.ratePaise}
      />

      <PaymentPanel
        isOpen={showPaymentPanel}
        onClose={() => {
          setShowPaymentPanel(false);
          setTimeout(focusEnterBillBar, 50);
        }}
        totalPaise={totalPaise}
        onRecordPayment={handleRecordPayment}
        onComplete={handleComplete}
        paidAmount={0}
      />

      <UpiCustomerPromptModal
        isOpen={showUpiPrompt}
        onClose={() => setShowUpiPrompt(false)}
        onSelectCustomer={handleUpiPromptSelectCustomer}
        onSkipAndContinue={handleUpiPromptSkip}
        amountPaise={pendingUpiPayment?.amountPaise || totalPaise}
        initialVpa={pendingUpiPayment?.referenceNumber || ''}
      />

      <HeldBillsList
        isOpen={showHeldBills}
        onClose={() => {
          setShowHeldBills(false);
          setTimeout(focusEnterBillBar, 50);
        }}
        onResume={handleResume}
      />

      <RefrigeratorItemPickerModal
        isOpen={showFridgePicker}
        onClose={() => setShowFridgePicker(false)}
      />

      <OverrideDialog
        isOpen={showOverrideDialog}
        onClose={() => {
          setShowOverrideDialog(false);
          setTimeout(focusEnterBillBar, 50);
        }}
        onConfirm={handleOverrideConfirm}
        variantName={overrideMeta.variantName}
        currentRatePaise={overrideMeta.currentRatePaise}
      />

      {(configQuery.data?.billingSettings?.enableCalculatorWidget ?? true) && (
        <WastageCalculatorWidget />
      )}

      {/* Home Delivery Prompt Modal (For bills with missing customer contact info) */}
      <HomeDeliveryPromptModal
        isOpen={Boolean(pendingHomeDeliveryInvoice)}
        onClose={() => setPendingHomeDeliveryInvoice(null)}
        invoice={pendingHomeDeliveryInvoice}
        onSaveTicket={handleSaveHomeDeliveryTicket}
        onSkipTicket={handleSkipHomeDeliveryTicket}
      />

      {/* Flow A: Delivery Order Modal */}
      {showDeliveryModal && customer && (
        <DeliveryOrderModal
          isOpen={showDeliveryModal}
          onClose={() => setShowDeliveryModal(false)}
          customerId={customer.id}
          customerName={customer.name}
          subtotalPaise={totalPaise}
          initialValues={deliveryConfig || undefined}
          onConfirm={(config) => {
            setDeliveryConfig(config);
            setIsDeliveryOrder(true);
          }}
        />
      )}

      {/* Flow B: Post-Billing Delivery Dispatch Modal */}
      {flowBDeliveryInvoice && (
        <DeliveryOrderModal
          isOpen={Boolean(flowBDeliveryInvoice)}
          onClose={() => setFlowBDeliveryInvoice(null)}
          customerId={flowBDeliveryInvoice.invoice.customer_id || (customer?.id || 1)}
          customerName={customer?.name || `Customer #${flowBDeliveryInvoice.invoice.customer_id || 'Walk-in'}`}
          subtotalPaise={flowBDeliveryInvoice.invoice.subtotal_paise || 0}
          onConfirm={handleFlowBDeliveryConfirm}
        />
      )}
    </div>
  );
}

// ─── Help View ────────────────────────────────────────────────────────────────
function HelpView({ sysInfo }: { sysInfo: any }) {
  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full bg-surface-app text-text-primary">
      <div className="border-b border-border-subtle pb-4">
        <h2 className="text-xl font-bold font-outfit text-text-primary flex items-center gap-2">
          <HelpCircle className="text-brand-500" />
          <span>System Help & Diagnostics Center</span>
        </h2>
        <p className="text-text-muted text-xs mt-1">Access developer diagnostic details, native platform runtime specifications, keyboard layouts, and customer support.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Runtime Diagnostics */}
        <div className="bg-surface-panel border border-border-subtle rounded-xl p-5 space-y-4 shadow-elevation">
          <h3 className="font-bold text-sm text-text-primary border-b border-border-subtle pb-2 flex items-center gap-2">
            <Database size={16} className="text-blue-400" />
            <span>SQLite & Platform Engines</span>
          </h3>

          <div className="text-xs space-y-3 font-medium text-text-secondary">
            <div className="flex justify-between border-b border-border-subtle/40 pb-1.5">
              <span className="text-text-muted">Database Path</span>
              <span className="font-mono text-[10px] break-all max-w-[70%] text-right text-text-primary">{sysInfo?.dbPath || 'Loading'}</span>
            </div>
            <div className="flex justify-between border-b border-border-subtle/40 pb-1.5">
              <span className="text-text-muted">OS Environment</span>
              <span className="font-mono text-text-primary">{sysInfo?.platform} ({sysInfo?.arch})</span>
            </div>
            <div className="flex justify-between border-b border-border-subtle/40 pb-1.5">
              <span className="text-text-muted">Node JS Engine</span>
              <span className="font-mono text-text-primary">{sysInfo?.nodeVersion}</span>
            </div>
            <div className="flex justify-between border-b border-border-subtle/40 pb-1.5">
              <span className="text-text-muted">Chromium Kernel</span>
              <span className="font-mono text-text-primary">{sysInfo?.chromeVersion}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Electron Context</span>
              <span className="font-mono text-text-primary">{sysInfo?.electronVersion}</span>
            </div>
          </div>
        </div>

        {/* Shortcuts Map */}
        <div className="bg-surface-panel border border-border-subtle rounded-xl p-5 space-y-4 shadow-elevation">
          <h3 className="font-bold text-sm text-text-primary border-b border-border-subtle pb-2 flex items-center gap-2">
            <Keyboard size={16} className="text-amber-400" />
            <span>Standard ERP Keyboard Navigation</span>
          </h3>

          <table className="w-full text-xs text-left">
            <thead>
              <tr className="text-text-muted border-b border-border-subtle">
                <th className="pb-2 font-semibold">Target Action</th>
                <th className="pb-2 text-right font-semibold">Hotkey Command</th>
              </tr>
            </thead>
            <tbody className="font-medium text-text-secondary">
              <tr className="border-b border-border-subtle/30">
                <td className="py-2">Go to Billing / POS</td>
                <td className="py-2 text-right"><kbd className="bg-surface-card border border-border-subtle px-1.5 py-0.5 rounded font-mono text-[10px] text-text-primary">Ctrl+1</kbd></td>
              </tr>
              <tr className="border-b border-border-subtle/30">
                <td className="py-2">Go to Inventory / Stock</td>
                <td className="py-2 text-right"><kbd className="bg-surface-card border border-border-subtle px-1.5 py-0.5 rounded font-mono text-[10px] text-text-primary">Ctrl+2</kbd></td>
              </tr>
              <tr className="border-b border-border-subtle/30">
                <td className="py-2">Go to Reports / Sales</td>
                <td className="py-2 text-right"><kbd className="bg-surface-card border border-border-subtle px-1.5 py-0.5 rounded font-mono text-[10px] text-text-primary">Ctrl+4</kbd></td>
              </tr>
              <tr className="border-b border-border-subtle/30">
                <td className="py-2">Go to Products Manager</td>
                <td className="py-2 text-right"><kbd className="bg-surface-card border border-border-subtle px-1.5 py-0.5 rounded font-mono text-[10px] text-text-primary">Ctrl+3</kbd></td>
              </tr>
              <tr className="border-b border-border-subtle/30">
                <td className="py-2">Go to Settings Manager</td>
                <td className="py-2 text-right"><kbd className="bg-surface-card border border-border-subtle px-1.5 py-0.5 rounded font-mono text-[10px] text-text-primary">Ctrl+,</kbd></td>
              </tr>
              <tr>
                <td className="py-2">Toggle Theme Colors</td>
                <td className="py-2 text-right"><kbd className="bg-surface-card border border-border-subtle px-1.5 py-0.5 rounded font-mono text-[10px] text-text-primary">Ctrl+T</kbd></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Quick Usage Notes */}
        <div className="bg-surface-panel border border-border-subtle rounded-xl p-5 space-y-4 shadow-elevation">
          <h3 className="font-bold text-sm text-text-primary border-b border-border-subtle pb-2 flex items-center gap-2">
            <HelpCircle size={16} className="text-brand-500" />
            <span>Retail Operations & Workflow Guides</span>
          </h3>

          <div className="text-xs space-y-3.5 text-text-secondary leading-relaxed">
            <div>
              <p className="font-bold text-text-primary">🛒 Draft / Hold & POS Checkout</p>
              <p className="text-text-muted mt-0.5">Click items in Catalog to add to the cart. If weighing, type the exact grams in the weight entry dialog. Hold/Resume bills to handle multi-customer queues dynamically.</p>
            </div>
            <div>
              <p className="font-bold text-text-primary">📦 Purchases & Stock Ledger</p>
              <p className="text-text-muted mt-0.5">Record new inventory under "Purchases" tab in Inventory. Specify the supplier, variant, and invoice cost. Wastage adjustments can be logged separately with auditor reasons.</p>
            </div>
            <div>
              <p className="font-bold text-text-primary">📊 Sales Summaries & Profit Analytics</p>
              <p className="text-text-muted mt-0.5">Switch to Reports view to filter sales by date. The system automatically reconciles invoice items against historical purchase records to compute profitability margins.</p>
            </div>
          </div>
        </div>

        {/* Support contacts */}
        <div className="bg-surface-panel border border-border-subtle rounded-xl p-5 space-y-4 shadow-elevation">
          <h3 className="font-bold text-sm text-text-primary border-b border-border-subtle pb-2 flex items-center gap-2">
            <Phone size={16} className="text-blue-400" />
            <span>Technical Helpdesk & Contacts</span>
          </h3>

          <div className="text-xs space-y-3 text-text-secondary font-medium">
            <p className="text-text-muted">For enterprise license issues, custom hardware configurations (weighing scales, thermal printers), or system updates, reach out to support:</p>
            <div className="bg-surface-card border border-border-subtle rounded-lg p-3 space-y-2">
              <div className="flex justify-between">
                <span className="text-text-muted">Enterprise Hotline:</span>
                <span className="font-bold text-text-primary">+91 1800 555 4321</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">E-Mail Service Desk:</span>
                <span className="font-bold text-text-primary">support@meatshoppos.com</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Service Hours:</span>
                <span className="font-bold text-text-primary">08:00 AM - 10:00 PM IST (Mon-Sun)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Layout ──────────────────────────────────────────────────────────────
function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { config, updateConfig } = useAppearance();
  const theme = config.mode === 'dark' ? 'dark' : 'light';

  const activePage: Page = location.pathname === '/settings'
    ? 'settings'
    : location.pathname === '/help'
      ? 'help'
      : location.pathname === '/products'
        ? 'products'
        : location.pathname === '/inventory'
          ? 'inventory'
          : location.pathname === '/purchases'
            ? 'purchases'
            : location.pathname === '/payments'
              ? 'payments'
              : location.pathname === '/delivery'
                ? 'delivery'
                : location.pathname === '/reports'
            ? 'reports'
            : location.pathname === '/customers'
              ? 'customers'
              : location.pathname === '/ar_reports'
                ? 'ar_reports'
                : location.pathname === '/hr'
                  ? 'hr'
                  : location.pathname === '/cashbox'
                    ? 'cashbox'
                    : location.pathname === '/expenses'
                      ? 'expenses'
                      : location.pathname === '/prices'
                        ? 'prices'
                        : location.pathname === '/ledgers'
                          ? 'ledgers'
                          : location.pathname === '/health'
                            ? 'health'
                            : location.pathname === '/forecasting'
                              ? 'forecasting'
                              : 'billing';

  const handleToggleTheme = useCallback(() => {
    const nextMode = config.mode === 'dark' ? 'light' : 'dark';
    updateConfig({ mode: nextMode });
  }, [config.mode, updateConfig]);

  const handleNavigate = useCallback((page: Page) => {
    if (page === 'billing') {
      navigate('/');
      setTimeout(() => {
        const input = document.getElementById('quick-product-search-input');
        if (input) (input as HTMLInputElement).focus();
      }, 50);
    } else {
      navigate(`/${page}`);
    }
  }, [navigate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.getAttribute('contenteditable') === 'true'
      );

      if (isInputFocused) return;

      if (e.key === 'F1') {
        e.preventDefault();
        handleNavigate('help');
      }
      if (e.ctrlKey) {
        if (e.key === '1') { e.preventDefault(); handleNavigate('billing'); }
        else if (e.key === '2') { e.preventDefault(); handleNavigate('inventory'); }
        else if (e.key === '3') { e.preventDefault(); handleNavigate('products'); }
        else if (e.key === '4') { e.preventDefault(); handleNavigate('reports'); }
        else if (e.key === '5') { e.preventDefault(); handleNavigate('customers'); }
        else if (e.key === '6') { e.preventDefault(); handleNavigate('ar_reports'); }
        else if (e.key === ',') { e.preventDefault(); handleNavigate('settings'); }
        else if (e.key.toLowerCase() === 't') { e.preventDefault(); handleToggleTheme(); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNavigate, handleToggleTheme]);



  const dbHealthQuery = useQuery({
    queryKey: ['dbHealth'],
    queryFn: () => window.api.invoke(IPC_CHANNELS.DATABASE.HEALTH).then((res: any) => {
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    }),
    refetchInterval: 10000,
  });

  const sysInfoQuery = useQuery({
    queryKey: ['systemInfo'],
    queryFn: () => window.api.invoke(IPC_CHANNELS.SYSTEM.GET_INFO).then((res: any) => {
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    })
  });

  useQuery<AppConfig>({
    queryKey: ['config'],
    queryFn: () => window.api.invoke(IPC_CHANNELS.CONFIG.GET).then((res: any) => {
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    })
  });

  const { data: session, isLoading: isSessionLoading } = useSession();
  const [isDailyPromptOpen, setIsDailyPromptOpen] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    const lastPromptDate = localStorage.getItem('pos_daily_cashier_prompt_date');
    return lastPromptDate !== today;
  });

  const handleCloseDailyPrompt = () => {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem('pos_daily_cashier_prompt_date', today);
    setIsDailyPromptOpen(false);
    setTimeout(() => {
      const input = document.getElementById('quick-product-search-input');
      if (input) (input as HTMLInputElement).focus();
    }, 50);
  };

  if (isSessionLoading) {
    return (
      <div className="min-h-screen bg-surface-app flex flex-col items-center justify-center text-text-muted gap-3">
        <div className="w-8 h-8 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
        <span className="text-xs font-semibold text-text-secondary">Loading session...</span>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <div className="flex h-full w-full bg-surface-app text-text-primary overflow-hidden font-sans">
      <DailyCashierPromptModal
        isOpen={isDailyPromptOpen}
        onClose={handleCloseDailyPrompt}
      />

      <Sidebar
        activePage={activePage}
        onNavigate={handleNavigate}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full">
        <main className="flex-1 min-h-0 bg-surface-app flex flex-col">
            <Routes>
              <Route path="/" element={<BillingView />} />
              <Route path="/delivery" element={<DeliveryManagementView />} />
              <Route path="/inventory" element={<InventoryView />} />
              <Route path="/purchases" element={<PurchasesWorkspace />} />
              <Route path="/payments" element={<PaymentsReceiptsView />} />
              <Route path="/reports" element={<ReportsView />} />
              <Route path="/products" element={<ProductManagementView />} />
              <Route path="/customers" element={<CustomerList />} />
              <Route path="/ar_reports" element={<ARReportsView />} />
              <Route path="/hr" element={<HRManagementView />} />
              <Route path="/cashbox" element={<CashBoxView />} />
              <Route path="/expenses" element={<ExpenseManagementView />} />
              <Route path="/prices" element={<DailyMarketPricesView />} />
              <Route path="/ledgers" element={<EnterpriseLedgerView />} />
              <Route path="/health" element={<SystemHealthView />} />
              <Route path="/forecasting" element={<DemandForecastingView />} />
              <Route path="/settings" element={<SettingsScreen />} />
              <Route path="/help" element={<HelpView sysInfo={sysInfoQuery.data} />} />
            </Routes>
        </main>

        <Statusbar dbHealth={dbHealthQuery.data} sysInfo={sysInfoQuery.data} />
      </div>

      <WhatsAppToastManager />
    </div>
  );
}

export default function App() {
  return (
    <MemoryRouter>
      <MainLayout />
    </MemoryRouter>
  );
}

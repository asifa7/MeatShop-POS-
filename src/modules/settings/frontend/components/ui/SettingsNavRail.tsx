import React from 'react';
import {
  Building2,
  Receipt,
  Percent,
  CreditCard,
  Banknote,
  Boxes,
  RotateCcw,
  Drumstick,
  Users,
  Printer,
  Palette,
  Keyboard,
  HardDrive,
  MessageSquare,
  Search,
  ChevronRight,
} from 'lucide-react';
import { SettingsCategoryId, useSettingsDraftStore } from '../../hooks/useSettingsDraftStore';
import { IPC_CHANNELS } from '../../../../../core/ipc/channels';

export interface CategoryItem {
  id: SettingsCategoryId;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  group: 'STORE' | 'OPERATIONS' | 'TEAM' | 'DEVICE & APP';
}

export const CATEGORIES: CategoryItem[] = [
  // STORE
  {
    id: 'business',
    label: 'Shop & Business',
    sublabel: 'Name, GSTIN, PAN, FY',
    icon: <Building2 size={16} />,
    group: 'STORE',
  },
  {
    id: 'billing',
    label: 'Billing & Invoice',
    sublabel: 'Prefix, thermal receipt, terms',
    icon: <Receipt size={16} />,
    group: 'STORE',
  },
  {
    id: 'tax',
    label: 'Tax & GST Rates',
    sublabel: 'Inclusive/Exclusive, 5%, 12%, 18%',
    icon: <Percent size={16} />,
    group: 'STORE',
  },
  {
    id: 'payments',
    label: 'Payment Methods',
    sublabel: 'Cash, UPI, Card, Split, Credit',
    icon: <CreditCard size={16} />,
    group: 'STORE',
  },

  // OPERATIONS
  {
    id: 'cashbox',
    label: 'Cash Box & Shifts',
    sublabel: 'Opening cash, denoms, threshold',
    icon: <Banknote size={16} />,
    group: 'OPERATIONS',
  },
  {
    id: 'inventory',
    label: 'Inventory & Stock',
    sublabel: 'Low stock alerts, negative stock',
    icon: <Boxes size={16} />,
    group: 'OPERATIONS',
  },
  {
    id: 'returns',
    label: 'Returns & Refunds',
    sublabel: 'Window, restock, manager approval',
    icon: <RotateCcw size={16} />,
    group: 'OPERATIONS',
  },
  {
    id: 'yield_ratios',
    label: 'Bird Yield & Ratios',
    sublabel: 'Chicken 1.6x / 1.9x, Goat 58%',
    icon: <Drumstick size={16} />,
    group: 'OPERATIONS',
  },

  // TEAM
  {
    id: 'users_permissions',
    label: 'Users & Permissions',
    sublabel: 'Cashier/Manager roles & matrix',
    icon: <Users size={16} />,
    group: 'TEAM',
  },

  // DEVICE & APP
  {
    id: 'hardware',
    label: 'Printer & Hardware',
    sublabel: 'Thermal paper, COM port, scale',
    icon: <Printer size={16} />,
    group: 'DEVICE & APP',
  },
  {
    id: 'appearance',
    label: 'Appearance & Palette',
    sublabel: '10 accent colors, dark/light mode',
    icon: <Palette size={16} />,
    group: 'DEVICE & APP',
  },
  {
    id: 'shortcuts',
    label: 'Keyboard Shortcuts',
    sublabel: 'Fast checkout hotkeys & keycaps',
    icon: <Keyboard size={16} />,
    group: 'DEVICE & APP',
  },
  {
    id: 'system_data',
    label: 'System & Data',
    sublabel: 'Backup, CSV export, diagnostics',
    icon: <HardDrive size={16} />,
    group: 'DEVICE & APP',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp & Templates',
    sublabel: 'Bill caption, delivery notice, retry',
    icon: <MessageSquare size={16} />,
    group: 'DEVICE & APP',
  },
];

export const SettingsNavRail: React.FC = () => {
  const { activeCategory, setActiveCategory, searchQuery, setSearchQuery } = useSettingsDraftStore();
  const [waConnected, setWaConnected] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let mounted = true;
    if (window.api?.invoke) {
      window.api.invoke(IPC_CHANNELS.WHATSAPP.GET_STATUS).then((raw: any) => {
        const res = raw?.data ?? raw;
        if (mounted && res && res.status) setWaConnected(res.status === 'connected');
      }).catch(() => {});
    }

    const unsub = window.api?.on?.(IPC_CHANNELS.WHATSAPP.STATUS_UPDATE, (raw: any) => {
      const data = raw?.data ?? raw;
      if (mounted && data && data.status) setWaConnected(data.status === 'connected');
    });

    return () => {
      mounted = false;
      if (unsub) unsub();
    };
  }, []);

  const filteredCategories = CATEGORIES.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.label.toLowerCase().includes(q) ||
      c.sublabel.toLowerCase().includes(q) ||
      c.group.toLowerCase().includes(q)
    );
  });

  const groups: Array<'STORE' | 'OPERATIONS' | 'TEAM' | 'DEVICE & APP'> = [
    'STORE',
    'OPERATIONS',
    'TEAM',
    'DEVICE & APP',
  ];

  const handleKeyDown = (e: React.KeyboardEvent, currentId: SettingsCategoryId) => {
    const list = filteredCategories;
    const idx = list.findIndex((c) => c.id === currentId);
    if (idx === -1) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = list[(idx + 1) % list.length];
      setActiveCategory(next.id);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = list[(idx - 1 + list.length) % list.length];
      setActiveCategory(prev.id);
    }
  };

  return (
    <nav
      aria-label="Settings Categories"
      className="w-64 h-full bg-surface-panel border-r border-border-subtle flex flex-col flex-shrink-0 select-none overflow-hidden"
    >
      {/* Search Header */}
      <div className="p-3 border-b border-border-subtle/80 flex-shrink-0">
        <div className="relative flex items-center bg-surface-card border border-border-subtle rounded-xl px-2.5 py-1.5 focus-within:border-brand-500 transition-colors">
          <Search size={14} className="text-text-muted mr-2 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search settings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-xs font-bold text-text-primary placeholder:text-text-muted/60 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-[10px] text-text-muted hover:text-text-primary ml-1"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Grouped Category Items (Internal Scroll) */}
      <div
        role="tablist"
        aria-orientation="vertical"
        className="flex-1 min-h-0 overflow-y-auto p-2 space-y-4 pr-1.5"
      >
        {groups.map((group) => {
          const itemsInGroup = filteredCategories.filter((c) => c.group === group);
          if (itemsInGroup.length === 0) return null;

          return (
            <div key={group} className="space-y-1">
              <div className="px-2.5 py-1 text-[10px] font-black tracking-wider text-text-muted uppercase font-mono">
                {group}
              </div>

              <div className="space-y-0.5">
                {itemsInGroup.map((item) => {
                  const isActive = activeCategory === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      id={`tab-${item.id}`}
                      aria-selected={isActive}
                      aria-controls={`panel-${item.id}`}
                      tabIndex={isActive ? 0 : -1}
                      onClick={() => setActiveCategory(item.id)}
                      onKeyDown={(e) => handleKeyDown(e, item.id)}
                      className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-xl transition-all ${
                        isActive
                          ? 'bg-brand-500 text-white font-black shadow-sm'
                          : 'text-text-secondary hover:text-text-primary hover:bg-surface-card/70 font-semibold'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-1">
                        <span
                          className={`flex-shrink-0 ${
                            isActive ? 'text-white' : 'text-brand-500 group-hover:scale-105'
                          }`}
                        >
                          {item.icon}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-bold truncate leading-tight">{item.label}</p>
                            {item.id === 'whatsapp' && waConnected !== null && (
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  waConnected
                                    ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
                                    : 'bg-amber-400 animate-pulse'
                                }`}
                                title={waConnected ? 'WhatsApp Connected' : 'WhatsApp Disconnected / Pair QR'}
                              />
                            )}
                          </div>
                          <p
                            className={`text-[10px] truncate leading-tight ${
                              isActive ? 'text-white/80' : 'text-text-muted'
                            }`}
                          >
                            {item.sublabel}
                          </p>
                        </div>
                      </div>
                      <ChevronRight
                        size={13}
                        className={`flex-shrink-0 transition-transform ${
                          isActive ? 'text-white translate-x-0.5' : 'text-text-muted opacity-40'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {filteredCategories.length === 0 && (
          <div className="p-4 text-center text-xs text-text-muted">
            No settings match &ldquo;{searchQuery}&rdquo;
          </div>
        )}
      </div>
    </nav>
  );
};

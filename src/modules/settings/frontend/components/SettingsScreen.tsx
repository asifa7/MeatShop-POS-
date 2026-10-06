import React, { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';
import { useAppearance } from '../../../../core/theme/AppearanceContext';
import { usePOSShortcutsStore } from '../../../billing/frontend/hooks/usePOSShortcutsStore';
import { useMeatShopConfigStore } from '../../../../core/config/meatShopConfigStore';
import {
  useSettingsDraftStore,
  DEFAULT_APP_CONFIG_DRAFT,
  DEFAULT_APPEARANCE_DRAFT,
} from '../hooks/useSettingsDraftStore';

// UI Primitives
import { SettingsNavRail, CATEGORIES } from './ui/SettingsNavRail';
import { SettingsCategory } from './ui/SettingsCategory';
import { PreviewPane } from './ui/PreviewPane';
import { SettingsActionBar } from './ui/SettingsActionBar';

// Category Form Components
import { BusinessSettings } from './categories/BusinessSettings';
import { BillingSettings } from './categories/BillingSettings';
import { TaxSettings } from './categories/TaxSettings';
import { PaymentSettings } from './categories/PaymentSettings';
import { CashBoxSettings } from './categories/CashBoxSettings';
import { InventorySettings } from './categories/InventorySettings';
import { ReturnsSettings } from './categories/ReturnsSettings';
import { LiveBirdYieldSettings } from './categories/LiveBirdYieldSettings';
import { UsersPermissionsSettings } from './categories/UsersPermissionsSettings';
import { PrinterHardwareSettings } from './categories/PrinterHardwareSettings';
import { AppearanceSettings } from './categories/AppearanceSettings';
import { KeyboardShortcutsSettings } from './categories/KeyboardShortcutsSettings';
import { SystemDataSettings } from './categories/SystemDataSettings';
import { WhatsAppSettings } from './categories/WhatsAppSettings';

// Contextual Live Preview Components
import { BusinessCardPreview } from './previews/BusinessCardPreview';
import { ThermalReceiptPreview } from './previews/ThermalReceiptPreview';
import { TaxCalculationPreview } from './previews/TaxCalculationPreview';
import { PaymentModalPreview } from './previews/PaymentModalPreview';
import { CashBoxShiftPreview } from './previews/CashBoxShiftPreview';
import { InventoryProductCardPreview } from './previews/InventoryProductCardPreview';
import { ReturnsDialogPreview } from './previews/ReturnsDialogPreview';
import { YieldCalculatorPreview } from './previews/YieldCalculatorPreview';
import { RolePermissionsCardPreview } from './previews/RolePermissionsCardPreview';
import { HardwareStatusPreview } from './previews/HardwareStatusPreview';
import { POSWindowMockupPreview } from './previews/POSWindowMockupPreview';
import { KeyboardVisualizerPreview } from './previews/KeyboardVisualizerPreview';
import { SystemTelemetryPreview } from './previews/SystemTelemetryPreview';

export const SettingsScreen: React.FC = () => {
  const queryClient = useQueryClient();
  const { config: liveAppearance, updateConfig: updateLiveAppearance } = useAppearance();
  const { shortcuts: liveShortcuts, updateShortcut: updateLiveShortcut } = usePOSShortcutsStore();
  const {
    chickenWholeRatio,
    chickenBonelessRatio,
    goatLiveToDressedPercent,
    setChickenWholeRatio,
    setChickenBonelessRatio,
    setGoatLiveToDressedPercent,
  } = useMeatShopConfigStore();

  const {
    activeCategory,
    draftConfig,
    draftAppearance,
    draftShortcuts,
    draftYieldRatios,
    initBaselines,
    resetCategoryToDefaults,
    discardChanges,
    setSaveStatus,
  } = useSettingsDraftStore();

  // 1. Fetch live AppConfig from Backend
  const configQuery = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.CONFIG.GET);
      if (!res.success) throw new Error(res.error?.message || 'Failed to fetch config');
      return res.data || DEFAULT_APP_CONFIG_DRAFT;
    },
  });

  // 2. Sync to draft store on initial load
  useEffect(() => {
    if (configQuery.data) {
      initBaselines(
        configQuery.data,
        liveAppearance || DEFAULT_APPEARANCE_DRAFT,
        liveShortcuts,
        {
          chickenWholeRatio: chickenWholeRatio || 1.6,
          chickenBonelessRatio: chickenBonelessRatio || 1.9,
          goatLiveToDressedPercent: goatLiveToDressedPercent || 58.0,
        }
      );
    }
  }, [configQuery.data, initBaselines]);

  // 3. Save Mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      setSaveStatus('saving');

      // A. Save AppConfig to disk via IPC
      const configRes = await window.api.invoke(IPC_CHANNELS.CONFIG.UPDATE, draftConfig);
      if (!configRes.success) throw new Error(configRes.error?.message || 'Failed to save AppConfig');

      // B. Save Appearance to localStorage & DOM
      updateLiveAppearance(draftAppearance);

      // C. Save Shortcuts to localStorage
      try {
        localStorage.setItem('pos_keyboard_shortcuts', JSON.stringify(draftShortcuts));
        Object.entries(draftShortcuts).forEach(([act, key]) => {
          updateLiveShortcut(act as any, key as string);
        });
      } catch (e) {
        console.warn('Failed to save shortcuts:', e);
      }

      // D. Save Meat Shop Ratios
      setChickenWholeRatio(draftYieldRatios.chickenWholeRatio);
      setChickenBonelessRatio(draftYieldRatios.chickenBonelessRatio);
      setGoatLiveToDressedPercent(draftYieldRatios.goatLiveToDressedPercent);

      return configRes.data;
    },
    onSuccess: (savedData) => {
      queryClient.setQueryData(['config'], savedData);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    },
    onError: (err: any) => {
      setSaveStatus('error', err.message || 'Error occurred while saving');
    },
  });

  const activeCategoryMeta = CATEGORIES.find((c) => c.id === activeCategory) || CATEGORIES[0];

  const renderCategoryControls = () => {
    switch (activeCategory) {
      case 'business':
        return <BusinessSettings />;
      case 'billing':
        return <BillingSettings />;
      case 'tax':
        return <TaxSettings />;
      case 'payments':
        return <PaymentSettings />;
      case 'cashbox':
        return <CashBoxSettings />;
      case 'inventory':
        return <InventorySettings />;
      case 'returns':
        return <ReturnsSettings />;
      case 'yield_ratios':
        return <LiveBirdYieldSettings />;
      case 'users_permissions':
        return <UsersPermissionsSettings />;
      case 'hardware':
        return <PrinterHardwareSettings />;
      case 'appearance':
        return <AppearanceSettings />;
      case 'shortcuts':
        return <KeyboardShortcutsSettings />;
      case 'system_data':
        return <SystemDataSettings />;
      case 'whatsapp':
        return <WhatsAppSettings />;
      default:
        return <BusinessSettings />;
    }
  };

  const renderCategoryPreview = () => {
    switch (activeCategory) {
      case 'business':
        return <BusinessCardPreview />;
      case 'billing':
      case 'whatsapp':
        return <ThermalReceiptPreview />;
      case 'tax':
        return <TaxCalculationPreview />;
      case 'payments':
        return <PaymentModalPreview />;
      case 'cashbox':
        return <CashBoxShiftPreview />;
      case 'inventory':
        return <InventoryProductCardPreview />;
      case 'returns':
        return <ReturnsDialogPreview />;
      case 'yield_ratios':
        return <YieldCalculatorPreview />;
      case 'users_permissions':
        return <RolePermissionsCardPreview />;
      case 'hardware':
        return <HardwareStatusPreview />;
      case 'appearance':
        return <POSWindowMockupPreview />;
      case 'shortcuts':
        return <KeyboardVisualizerPreview />;
      case 'system_data':
        return <SystemTelemetryPreview />;
      default:
        return <BusinessCardPreview />;
    }
  };

  if (configQuery.isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-surface-app text-text-muted text-xs font-bold font-mono">
        Loading system configuration...
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-surface-app text-text-primary overflow-hidden select-none">
      {/* 3-Column Video Game Style Layout (Fixed viewport: Nav | Controls | Preview) */}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
        {/* Left: Navigation Rail */}
        <SettingsNavRail />

        {/* Center: Active Category Controls (Only internal scroll allowed) */}
        <SettingsCategory
          id={activeCategory}
          title={activeCategoryMeta.label}
          description={activeCategoryMeta.sublabel}
          icon={activeCategoryMeta.icon}
        >
          {renderCategoryControls()}
        </SettingsCategory>

        {/* Right: Live Interactive Contextual Preview */}
        <PreviewPane
          title={`${activeCategoryMeta.label} Preview`}
          badge="LIVE"
          footerNote="Changes apply immediately on saving"
        >
          {renderCategoryPreview()}
        </PreviewPane>
      </div>

      {/* Bottom Fixed Action Bar */}
      <SettingsActionBar
        categoryLabel={activeCategoryMeta.label}
        onSave={() => saveMutation.mutate()}
        onCancel={() => discardChanges()}
        onResetCategory={() => resetCategoryToDefaults(activeCategory)}
      />
    </div>
  );
};

export default SettingsScreen;

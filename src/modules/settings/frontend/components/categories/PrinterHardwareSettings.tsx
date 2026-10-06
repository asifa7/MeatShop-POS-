import React, { useState, useEffect, useRef } from 'react';
import {
  Printer,
  Scale,
  Scan,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  MapPin,
  MessageSquare,
  Send,
  Sliders,
  FileText
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { SettingCard } from '../ui/SettingCard';
import { SettingRow } from '../ui/SettingRow';
import { TextField } from '../ui/TextField';
import { SwitchControl } from '../ui/SwitchControl';
import { SelectControl } from '../ui/SelectControl';
import { SegmentedControl } from '../ui/SegmentedControl';
import { useSettingsDraftStore } from '../../hooks/useSettingsDraftStore';
import { IPC_CHANNELS } from '../../../../../core/ipc/channels';
import { generateClientTestReceiptHTML, generateClientWidthCalibrationHTML, printHtmlViaIframe } from '../../utils/clientReceiptPrint';

export const PrinterHardwareSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const { draftConfig, updateDraftConfig } = useSettingsDraftStore();
  const hw = draftConfig.hardware;
  const tmpl = draftConfig.receiptTemplate;

  // Active sub-tab matching the uploaded reference images
  const [activeTab, setActiveTab] = useState<'printer' | 'address' | 'whatsapp'>('printer');

  const [isPrintingTest, setIsPrintingTest] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // WhatsApp testing state
  const [testPhone, setTestPhone] = useState('');
  const [isTestingWhatsApp, setIsTestingWhatsApp] = useState(false);

  // Multi-width calibration series state
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationFeedback, setCalibrationFeedback] = useState<string | null>(null);

  const handleRunWidthCalibration = async () => {
    setIsCalibrating(true);
    setCalibrationFeedback(null);
    try {
      let printed = false;
      // 1. Try dedicated calibration IPC channel
      try {
        const res = await window.api.invoke(IPC_CHANNELS.BILLING.PRINT_WIDTH_CALIBRATION);
        if (res && res.success) printed = true;
      } catch (e1) {
        console.warn('Dedicated calibration IPC channel not available, trying test receipt channel:', e1);
      }

      // 2. Try PRINT_TEST_RECEIPT with isCalibrationSeries flag
      if (!printed) {
        try {
          const res2 = await window.api.invoke(IPC_CHANNELS.BILLING.PRINT_TEST_RECEIPT, {
            isCalibrationSeries: true,
          });
          if (res2 && res2.success) printed = true;
        } catch (e2) {
          console.warn('Test receipt calibration flag failed, using iframe fallback:', e2);
        }
      }

      // 3. Fallback to direct client iframe printing
      if (!printed) {
        const html = generateClientWidthCalibrationHTML(tmpl);
        await printHtmlViaIframe(html);
        printed = true;
      }

      if (printed) {
        setCalibrationFeedback('✓ Calibration series printed! Check paper roll for the cleanest strip.');
      }
    } catch (e: any) {
      setCalibrationFeedback(`⚠️ Calibration error: ${e.message || 'Unknown error'}`);
    } finally {
      setIsCalibrating(false);
      setTimeout(() => setCalibrationFeedback(null), 8000);
    }
  };

  // Auto-save debounced whenever printer or receipt template changes
  const lastSavedRef = useRef<string>('');
  useEffect(() => {
    const serialized = JSON.stringify({
      hardware: draftConfig.hardware,
      receiptTemplate: draftConfig.receiptTemplate,
    });
    if (lastSavedRef.current === '') {
      lastSavedRef.current = serialized;
      return undefined;
    }
    if (lastSavedRef.current !== serialized) {
      const timer = setTimeout(async () => {
        try {
          const res = await window.api.invoke(IPC_CHANNELS.CONFIG.UPDATE, draftConfig);
          if (res.success) {
            queryClient.setQueryData(['config'], res.data);
            lastSavedRef.current = serialized;
          }
        } catch (e) {
          console.warn('Auto-save error:', e);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [draftConfig.hardware, draftConfig.receiptTemplate, draftConfig, queryClient]);

  const handleManualSave = async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const res = await window.api.invoke(IPC_CHANNELS.CONFIG.UPDATE, draftConfig);
      if (res.success) {
        queryClient.setQueryData(['config'], res.data);
        setStatusMessage({ type: 'success', text: 'Printer settings saved permanently to disk!' });
      } else {
        setStatusMessage({ type: 'error', text: res.error?.message || 'Failed to save settings' });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message || 'Error occurred while saving' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleTestPrint = async () => {
    setIsPrintingTest(true);
    setStatusMessage(null);
    try {
      // Ensure current values are saved first
      await window.api.invoke(IPC_CHANNELS.CONFIG.UPDATE, draftConfig);
      queryClient.setQueryData(['config'], draftConfig);

      let printedViaIpc = false;
      try {
        const res = await window.api.invoke(IPC_CHANNELS.BILLING.PRINT_TEST_RECEIPT, {
          templateOverride: draftConfig.receiptTemplate,
        });
        if (res && res.success) {
          printedViaIpc = true;
          setStatusMessage({ type: 'success', text: '✓ Test receipt sent to thermal printer!' });
        }
      } catch (ipcErr) {
        console.warn('IPC test print handler not ready, using direct print dialog fallback:', ipcErr);
      }

      if (!printedViaIpc) {
        // Fallback: render HTML via hidden iframe and trigger native print
        const html = generateClientTestReceiptHTML(draftConfig.receiptTemplate, draftConfig.shopInfo);
        await printHtmlViaIframe(html);
        setStatusMessage({ type: 'success', text: '✓ Test ticket printed! Verify zero-margin alignment on paper.' });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message || 'Error occurred while printing test ticket' });
    } finally {
      setIsPrintingTest(false);
      setTimeout(() => setStatusMessage(null), 6000);
    }
  };

  const handleTestWhatsApp = async () => {
    if (!testPhone.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter a test mobile number first' });
      return;
    }
    setIsTestingWhatsApp(true);
    setStatusMessage(null);
    try {
      let clean = testPhone.replace(/[^0-9]/g, '');
      if (clean.length === 10) clean = `91${clean}`;

      const shopTitle = tmpl?.shopName || draftConfig.shopInfo?.name || 'MEAT SHOP POS';
      const senderNo = tmpl?.softwareMobileNo ? ` (${tmpl.softwareMobileNo})` : '';
      const text = `🧾 *TEST BILL MESSAGE*\nShop: *${shopTitle}*${senderNo}\n\nThis is a verification test message for your POS WhatsApp Bill Dispatch system. WhatsApp connectivity is working successfully!`;

      const res = await window.api.invoke('whatsapp:send-message', {
        phone: clean,
        message: text,
      });
      if (res && res.success) {
        setStatusMessage({ type: 'success', text: `✓ WhatsApp test message dispatched to +${clean} in background!` });
      } else if (res && res.notLoggedIn) {
        setStatusMessage({ type: 'error', text: '⚠️ WhatsApp not linked. Please scan QR code in WhatsApp tab once.' });
      } else {
        setStatusMessage({ type: 'error', text: res?.failureReason || 'Failed to send WhatsApp message' });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message || 'Failed to send WhatsApp message' });
    } finally {
      setIsTestingWhatsApp(false);
      setTimeout(() => setStatusMessage(null), 6000);
    }
  };

  const colItemPct = tmpl?.itemWidthPercent ?? 40;
  const colQtyPct = tmpl?.qtyWidthPercent ?? 20;
  const colRatePct = tmpl?.rateWidthPercent ?? 20;
  const colAmtPct = tmpl?.amountWidthPercent ?? 20;
  const colTotalPct = colItemPct + colQtyPct + colRatePct + colAmtPct;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Top Action & Feedback Toolbar */}
      <div className="p-4 bg-surface-panel rounded-2xl border border-border-subtle shadow-xs space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-black text-text-primary tracking-wide">BILL PRINT SETTING</h3>
            <p className="text-xs text-text-muted">
              Configure thermal print dimensions, custom address headers, footer conditions, and WhatsApp customer sharing.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={handleManualSave}
              className="px-3.5 py-1.5 rounded-lg border border-border-subtle bg-surface-card hover:bg-surface-hover text-text-primary text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
            >
              {isSaving ? <Loader2 size={13} className="animate-spin text-brand-500" /> : <Save size={13} />}
              <span>Save Settings</span>
            </button>

          </div>
        </div>

        {statusMessage && (
          <div
            className={`text-xs px-3.5 py-2 rounded-xl flex items-center gap-2 border font-medium ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}
          >
            {statusMessage.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Tab Navigation Pill Bar (Matching Reference Images) */}
        <div className="flex items-center gap-1.5 p-1 bg-surface-card rounded-xl border border-border-subtle/80 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('printer')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'printer'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
            }`}
          >
            <Printer size={14} />
            <span>Thermal Printer - Windows</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('address')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'address'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
            }`}
          >
            <MapPin size={14} />
            <span>Print Address</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('whatsapp')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'whatsapp'
                ? 'bg-emerald-600 text-white shadow-subtle'
                : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
            }`}
          >
            <MessageSquare size={14} />
            <span>WhatsApp Meta</span>
          </button>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────
          TAB 1: Thermal Printer - Windows
          ────────────────────────────────────────────────────────── */}
      {activeTab === 'printer' && (
        <div className="space-y-6">
          <SettingCard
            title="Printer Hardware & Paper Specifications"
            description="Paper dimensions, margins, and printer driver"
            icon={<Printer size={16} />}
          >
            <SettingRow
              label="Printer Device / Driver Name"
              description="Exact printer name in Windows Control Panel (leave blank to show print dialog)"
            >
              <TextField
                value={hw.printerName || ''}
                onChange={(val) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    hardware: { ...prev.hardware, printerName: val },
                  }))
                }
                placeholder="e.g. POS-80C or XP-58"
                className="w-72 font-mono"
              />
            </SettingRow>

            <SettingRow
              label="Print Mode"
              description="Windows Spooler driver or Direct DOS / ESC-POS stream"
            >
              <SegmentedControl<'windows' | 'dos'>
                value={tmpl?.dosPrinter ? 'dos' : 'windows'}
                options={[
                  { value: 'windows', label: 'Windows Spooler (Default)' },
                  { value: 'dos', label: 'DOS ESC/POS Direct' },
                ]}
                onChange={(val) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    receiptTemplate: { ...(prev.receiptTemplate || {}), dosPrinter: val === 'dos' },
                  }))
                }
              />
            </SettingRow>

            <SettingRow
              label="Thermal Paper Specification"
              description="Physical roll width in millimeters"
            >
              <SegmentedControl<'58mm' | '80mm'>
                value={tmpl?.paperWidth === '58mm' ? '58mm' : '80mm'}
                options={[
                  { value: '58mm', label: '58 mm (2-inch roll)' },
                  { value: '80mm', label: '80 mm (3-inch roll - Standard)' },
                ]}
                onChange={(val) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    receiptTemplate: { ...(prev.receiptTemplate || {}), paperWidth: val },
                  }))
                }
              />
            </SettingRow>

            <SettingRow
              label="Safe Printable Content Width (mm)"
              description="Total width of rendered receipt content (Default: 60mm on 80mm roll). Reduces cropping caused by hardware dead zones."
            >
              <div className="flex items-center space-x-2">
                <TextField
                  type="number"
                  value={tmpl?.safePrintWidthMm ?? (tmpl?.paperWidth === '58mm' ? 48 : 60)}
                  onChange={(val) => {
                    const num = parseInt(val, 10);
                    if (!isNaN(num)) {
                      updateDraftConfig((prev) => ({
                        ...prev,
                        receiptTemplate: {
                          ...(prev.receiptTemplate || {}),
                          safePrintWidthMm: Math.min(80, Math.max(35, num)),
                        },
                      }));
                    }
                  }}
                  placeholder="60"
                  className="w-24 text-right font-mono font-bold text-brand-500"
                />
                <span className="text-xs text-text-muted font-mono">mm</span>
              </div>
            </SettingRow>

            <SettingRow
              label="Horizontal Alignment Offset (mm)"
              description="Shift receipt content left or right (0 mm = flush left; negative e.g. -3 mm to pull further left; positive to shift right)"
            >
              <div className="flex items-center space-x-2">
                <TextField
                  type="text"
                  value={tmpl?.leftMarginMm ?? 0}
                  onChange={(val) => {
                    if (val === '' || val === '-') {
                      updateDraftConfig((prev) => ({
                        ...prev,
                        receiptTemplate: {
                          ...(prev.receiptTemplate || {}),
                          leftMarginMm: val as any,
                        },
                      }));
                    } else {
                      const num = parseInt(val, 10);
                      if (!isNaN(num)) {
                        updateDraftConfig((prev) => ({
                          ...prev,
                          receiptTemplate: {
                            ...(prev.receiptTemplate || {}),
                            leftMarginMm: num,
                          },
                        }));
                      }
                    }
                  }}
                  placeholder="0"
                  className="w-24 text-right font-mono"
                />
                <span className="text-xs text-text-muted font-mono">mm</span>
              </div>
            </SettingRow>

            <SettingRow
              label="Vertical Alignment Offset (mm)"
              description="Top margin feed spacing before receipt printing starts"
            >
              <div className="flex items-center space-x-2">
                <TextField
                  type="number"
                  value={tmpl?.topMarginMm ?? 0}
                  onChange={(val) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      receiptTemplate: { ...(prev.receiptTemplate || {}), topMarginMm: Number(val) || 0 },
                    }))
                  }
                  placeholder="0"
                  className="w-24 text-right font-mono"
                />
                <span className="text-xs text-text-muted font-mono">mm</span>
              </div>
            </SettingRow>

            <SettingRow
              label="Right-Edge Safe Margin Inset (mm)"
              description="Safe right-edge padding preventing physical hardware printout cutoff (Default: 4mm)"
            >
              <div className="flex items-center space-x-2">
                <TextField
                  type="text"
                  value={tmpl?.rightMarginMm ?? 4}
                  onChange={(val) => {
                    if (val === '' || val === '-') {
                      updateDraftConfig((prev) => ({
                        ...prev,
                        receiptTemplate: {
                          ...(prev.receiptTemplate || {}),
                          rightMarginMm: val as any,
                        },
                      }));
                    } else {
                      const num = parseInt(val, 10);
                      if (!isNaN(num)) {
                        updateDraftConfig((prev) => ({
                          ...prev,
                          receiptTemplate: {
                            ...(prev.receiptTemplate || {}),
                            rightMarginMm: num,
                          },
                        }));
                      }
                    }
                  }}
                  placeholder="4"
                  className="w-24 text-right font-mono"
                />
                <span className="text-xs text-text-muted font-mono">mm</span>
              </div>
            </SettingRow>

            <SettingRow
              label="Receipt Header Alignment"
              description="Align shop title, address, slogans, and bill banner"
            >
              <SegmentedControl<'left' | 'center' | 'right'>
                value={tmpl?.headerAlignment || 'left'}
                options={[
                  { value: 'left', label: 'Left Aligned' },
                  { value: 'center', label: 'Center' },
                  { value: 'right', label: 'Right Aligned' },
                ]}
                onChange={(val) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    receiptTemplate: { ...(prev.receiptTemplate || {}), headerAlignment: val },
                  }))
                }
              />
            </SettingRow>

            <SettingRow
              label="Receipt Font Family"
              description="Official office and monospace fonts for sharp thermal output"
            >
              <SelectControl
                value={tmpl?.fontFamily || 'Consolas'}
                options={[
                  { value: 'Consolas', label: 'Consolas (Monospace - Sharp & Crisp)' },
                  { value: 'Arial', label: 'Arial (Official Sans-Serif)' },
                  { value: 'Calibri', label: 'Calibri (Standard Office)' },
                  { value: 'Segoe UI', label: 'Segoe UI (Modern Clean)' },
                  { value: 'Courier New', label: 'Courier New (Classic)' },
                ]}
                onChange={(val) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    receiptTemplate: { ...(prev.receiptTemplate || {}), fontFamily: val as any },
                  }))
                }
                className="w-72"
              />
            </SettingRow>

            <SettingRow
              label="Receipt Font Size"
              description="Font scaling for optimal roll readability"
            >
              <SegmentedControl<'small' | 'medium' | 'large'>
                value={tmpl?.fontSize || 'medium'}
                options={[
                  { value: 'small', label: 'Small' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'large', label: 'Large' },
                ]}
                onChange={(val) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    receiptTemplate: { ...(prev.receiptTemplate || {}), fontSize: val },
                  }))
                }
              />
            </SettingRow>
          </SettingCard>

          {/* Line Items Column Width Proportions (From Image 2) */}
          <SettingCard
            title="Line Items Column Widths (%)"
            description="Customize width allocation for table columns (defaults: ITEM 40%, Qty 20%, Rate 20%, Amount 20%)"
            icon={<Sliders size={16} />}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-2">
              <div className="space-y-1 bg-surface-panel p-3 rounded-xl border border-border-subtle">
                <label className="text-xs font-bold text-text-primary block">ITEM / Description (%)</label>
                <div className="flex items-center gap-1.5">
                  <TextField
                    type="number"
                    value={colItemPct}
                    onChange={(val) =>
                      updateDraftConfig((prev) => ({
                        ...prev,
                        receiptTemplate: { ...(prev.receiptTemplate || {}), itemWidthPercent: Number(val) || 0 },
                      }))
                    }
                    className="w-full text-right font-mono"
                  />
                  <span className="text-xs font-bold text-text-muted">%</span>
                </div>
              </div>

              <div className="space-y-1 bg-surface-panel p-3 rounded-xl border border-border-subtle">
                <label className="text-xs font-bold text-text-primary block">Quantity (%)</label>
                <div className="flex items-center gap-1.5">
                  <TextField
                    type="number"
                    value={colQtyPct}
                    onChange={(val) =>
                      updateDraftConfig((prev) => ({
                        ...prev,
                        receiptTemplate: { ...(prev.receiptTemplate || {}), qtyWidthPercent: Number(val) || 0 },
                      }))
                    }
                    className="w-full text-right font-mono"
                  />
                  <span className="text-xs font-bold text-text-muted">%</span>
                </div>
              </div>

              <div className="space-y-1 bg-surface-panel p-3 rounded-xl border border-border-subtle">
                <label className="text-xs font-bold text-text-primary block">Rate (%)</label>
                <div className="flex items-center gap-1.5">
                  <TextField
                    type="number"
                    value={colRatePct}
                    onChange={(val) =>
                      updateDraftConfig((prev) => ({
                        ...prev,
                        receiptTemplate: { ...(prev.receiptTemplate || {}), rateWidthPercent: Number(val) || 0 },
                      }))
                    }
                    className="w-full text-right font-mono"
                  />
                  <span className="text-xs font-bold text-text-muted">%</span>
                </div>
              </div>

              <div className="space-y-1 bg-surface-panel p-3 rounded-xl border border-border-subtle">
                <label className="text-xs font-bold text-text-primary block">Amount (%)</label>
                <div className="flex items-center gap-1.5">
                  <TextField
                    type="number"
                    value={colAmtPct}
                    onChange={(val) =>
                      updateDraftConfig((prev) => ({
                        ...prev,
                        receiptTemplate: { ...(prev.receiptTemplate || {}), amountWidthPercent: Number(val) || 0 },
                      }))
                    }
                    className="w-full text-right font-mono"
                  />
                  <span className="text-xs font-bold text-text-muted">%</span>
                </div>
              </div>
            </div>

            <div className="px-2 pt-1 flex items-center justify-between text-xs font-bold">
              <span className={colTotalPct === 100 ? 'text-emerald-400' : 'text-amber-400'}>
                Total Column Allocation: {colTotalPct}% {colTotalPct === 100 ? '(Perfect 100%)' : '(Recommended total: 100%)'}
              </span>
              <button
                type="button"
                onClick={() =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    receiptTemplate: {
                      ...(prev.receiptTemplate || {}),
                      itemWidthPercent: 40,
                      qtyWidthPercent: 20,
                      rateWidthPercent: 20,
                      amountWidthPercent: 20,
                    },
                  }))
                }
                className="text-[11px] text-brand-500 hover:underline cursor-pointer"
              >
                Reset to 40 / 20 / 20 / 20
              </button>
            </div>

            {/* Auto Width Calibration Test Print */}
            <div className="mt-4 pt-3 border-t border-border-subtle flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-brand-500/5 p-3 rounded-xl border border-brand-500/20">
              <div className="flex-1">
                <div className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                  <span>📏 Multi-Width Calibration Print</span>
                </div>
                <div className="text-[11px] text-text-muted mt-0.5">
                  Prints a series of test strips at 76mm, 72mm, 68mm, 64mm, 60mm, 56mm, 52mm so you can physically identify the cleanest width with zero cropping.
                </div>
                {calibrationFeedback && (
                  <div className="mt-2 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 p-1.5 rounded border border-emerald-500/20">
                    {calibrationFeedback}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleRunWidthCalibration}
                disabled={isCalibrating}
                className="px-3.5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 shadow-subtle disabled:opacity-50"
                title="Print a series of test tickets from 76mm to 52mm"
              >
                {isCalibrating ? '⏳ Printing Series...' : '📏 Run Width Calibration Series'}
              </button>
            </div>
          </SettingCard>

          {/* Feature Checkboxes (Replicated Exactly from Uploaded Images 1 & 2) */}
          <SettingCard
            title="Receipt Print Feature Toggles"
            description="Toggle optional bill sections, balances, copies, and drawer pulse"
            icon={<FileText size={16} />}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 p-1">
              <SettingRow
                label="BillPrintClosingBalance"
                description="Print Customer Opening Balance, Bill Amount, Paid Amount & Closing Balance"
              >
                <SwitchControl
                  checked={tmpl?.billPrintClosingBalance ?? true}
                  onChange={(checked) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      receiptTemplate: { ...(prev.receiptTemplate || {}), billPrintClosingBalance: checked },
                    }))
                  }
                />
              </SettingRow>

              <SettingRow
                label="CardBillDouble"
                description="Automatically print a second merchant copy on Card/Swipe payment"
              >
                <SwitchControl
                  checked={tmpl?.cardBillDouble ?? false}
                  onChange={(checked) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      receiptTemplate: { ...(prev.receiptTemplate || {}), cardBillDouble: checked },
                    }))
                  }
                />
              </SettingRow>

              <SettingRow
                label="Sub Bill Print"
                description="Print separate kitchen or packaging verification token slip"
              >
                <SwitchControl
                  checked={tmpl?.subBillPrint ?? false}
                  onChange={(checked) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      receiptTemplate: { ...(prev.receiptTemplate || {}), subBillPrint: checked },
                    }))
                  }
                />
              </SettingRow>

              <SettingRow
                label="Cash Drawer Open"
                description="Send ESC/POS kick pulse to cash drawer RJ11 port on bill completion"
              >
                <SwitchControl
                  checked={hw.cashDrawerEnabled ?? true}
                  onChange={(checked) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      hardware: { ...prev.hardware, cashDrawerEnabled: checked },
                    }))
                  }
                />
              </SettingRow>



              <SettingRow
                label="Cash Tender"
                description="Print Cash Received and Change Due amounts on receipt footer"
              >
                <SwitchControl
                  checked={tmpl?.cashTender ?? false}
                  onChange={(checked) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      receiptTemplate: { ...(prev.receiptTemplate || {}), cashTender: checked },
                    }))
                  }
                />
              </SettingRow>

              <SettingRow
                label="CustomerCredit"
                description="Print outstanding customer ledger credit limit and balance"
              >
                <SwitchControl
                  checked={tmpl?.customerCredit ?? false}
                  onChange={(checked) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      receiptTemplate: { ...(prev.receiptTemplate || {}), customerCredit: checked },
                    }))
                  }
                />
              </SettingRow>



              <SettingRow
                label="Discount Every Line"
                description="Print item-level discount percentage and deductions under each line"
              >
                <SwitchControl
                  checked={tmpl?.discountEveryLine ?? false}
                  onChange={(checked) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      receiptTemplate: { ...(prev.receiptTemplate || {}), discountEveryLine: checked },
                    }))
                  }
                />
              </SettingRow>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border-subtle/80">
              <SettingRow
                label="No Of Bill Print"
                description="Number of physical receipts to print per sale (e.g. 1 or 2)"
              >
                <TextField
                  type="number"
                  value={tmpl?.noOfBillPrint ?? 1}
                  onChange={(val) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      receiptTemplate: { ...(prev.receiptTemplate || {}), noOfBillPrint: Math.max(1, Number(val) || 1) },
                    }))
                  }
                  className="w-24 text-right font-mono"
                />
              </SettingRow>

              <SettingRow
                label="2nd Bill DelayTime (Seconds)"
                description="Pause duration before second bill prints to allow clean cutter cycle"
              >
                <TextField
                  type="number"
                  value={Math.round((tmpl?.secondBillDelayMs ?? 500) / 1000)}
                  onChange={(val) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      receiptTemplate: { ...(prev.receiptTemplate || {}), secondBillDelayMs: Math.max(0, (Number(val) || 0) * 1000) },
                    }))
                  }
                  className="w-24 text-right font-mono"
                />
              </SettingRow>
            </div>
          </SettingCard>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────
          TAB 2: Print Address (Header & Footer Details - Image 3)
          ────────────────────────────────────────────────────────── */}
      {activeTab === 'address' && (
        <div className="space-y-6">
          <SettingCard
            title="Receipt Header Address & Branding"
            description="Shop name, top slogan, and physical address printed at the top of every bill"
            icon={<MapPin size={16} />}
          >
            <SettingRow
              label="Top Slogan"
              description="Invocation or top tagline (e.g. || Sri Muniswaran Thunai ||)"
            >
              <TextField
                value={tmpl?.topSlogan || ''}
                onChange={(val) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    receiptTemplate: { ...(prev.receiptTemplate || {}), topSlogan: val },
                  }))
                }
                placeholder="|| Sri Muniswaran Thunai ||"
                className="w-80"
              />
            </SettingRow>

            <SettingRow
              label="Shop Name"
              description="Main brand title printed at the top of receipts"
            >
              <TextField
                value={tmpl?.shopName || draftConfig.shopInfo?.name || ''}
                onChange={(val) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    receiptTemplate: { ...(prev.receiptTemplate || {}), shopName: val },
                    shopInfo: { ...prev.shopInfo, name: val },
                  }))
                }
                placeholder="e.g. ISHANTH PROTEINS-6"
                className="w-80 font-bold"
              />
            </SettingRow>

            <SettingRow
              label="Address Line 1"
              description="Building, door no, and street name"
            >
              <TextField
                value={tmpl?.addressLine1 || draftConfig.shopInfo?.address || ''}
                onChange={(val) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    receiptTemplate: { ...(prev.receiptTemplate || {}), addressLine1: val },
                  }))
                }
                placeholder="e.g. 123 Main Bazaar Road"
                className="w-80"
              />
            </SettingRow>

            <SettingRow
              label="Address Line 2"
              description="Locality, area, or landmark"
            >
              <TextField
                value={tmpl?.addressLine2 || ''}
                onChange={(val) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    receiptTemplate: { ...(prev.receiptTemplate || {}), addressLine2: val },
                  }))
                }
                placeholder="e.g. Near Bus Stand"
                className="w-80"
              />
            </SettingRow>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SettingRow label="City / Town" description="City name">
                <TextField
                  value={tmpl?.city || ''}
                  onChange={(val) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      receiptTemplate: { ...(prev.receiptTemplate || {}), city: val },
                    }))
                  }
                  placeholder="e.g. Tirupur"
                  className="w-48"
                />
              </SettingRow>

              <SettingRow label="Pin Code" description="Postal area code">
                <TextField
                  value={tmpl?.pinCode || ''}
                  onChange={(val) =>
                    updateDraftConfig((prev) => ({
                      ...prev,
                      receiptTemplate: { ...(prev.receiptTemplate || {}), pinCode: val },
                    }))
                  }
                  placeholder="e.g. 641604"
                  className="w-36 font-mono"
                />
              </SettingRow>
            </div>

            <SettingRow
              label="Phone / Mobile Number"
              description="Primary shop contact number for customer inquiries"
            >
              <TextField
                value={tmpl?.phone || tmpl?.softwareMobileNo || draftConfig.shopInfo?.phone || ''}
                onChange={(val) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    receiptTemplate: { ...(prev.receiptTemplate || {}), phone: val },
                    shopInfo: { ...prev.shopInfo, phone: val },
                  }))
                }
                placeholder="e.g. 9876543210"
                className="w-60 font-mono"
              />
            </SettingRow>

            <SettingRow
              label="GSTIN / Tax ID"
              description="Goods and Services Tax Identification Number"
            >
              <TextField
                value={tmpl?.gstin || draftConfig.shopInfo?.gstin || ''}
                onChange={(val) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    receiptTemplate: { ...(prev.receiptTemplate || {}), gstin: val.toUpperCase() },
                    shopInfo: { ...prev.shopInfo, gstin: val.toUpperCase() },
                  }))
                }
                placeholder="e.g. 33AAAAA0000A1Z5"
                className="w-60 font-mono uppercase"
              />
            </SettingRow>

            <SettingRow
              label="Email Address"
              description="Shop contact email address"
            >
              <TextField
                value={tmpl?.email || ''}
                onChange={(val) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    receiptTemplate: { ...(prev.receiptTemplate || {}), email: val },
                  }))
                }
                placeholder="e.g. ishanthproteins@gmail.com"
                className="w-72"
              />
            </SettingRow>
          </SettingCard>

          {/* Footer Conditions & Greetings */}
          <SettingCard
            title="Receipt Footer Conditions & Messages"
            description="Terms of sale, return policies, and closing greeting lines"
            icon={<FileText size={16} />}
          >
            <SettingRow
              label="Condition Line 1"
              description="Printed at the bottom of the bill (e.g. Goods once sold will not be returned)"
            >
              <TextField
                value={tmpl?.condition1 || tmpl?.footerCondition1 || ''}
                onChange={(val) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    receiptTemplate: {
                      ...(prev.receiptTemplate || {}),
                      condition1: val,
                      footerCondition1: val,
                    },
                  }))
                }
                placeholder="e.g. Goods once sold will not be taken back or exchanged"
                className="w-full"
              />
            </SettingRow>

            <SettingRow
              label="Condition Line 2"
              description="Additional policy or tax declaration"
            >
              <TextField
                value={tmpl?.condition2 || tmpl?.footerCondition2 || ''}
                onChange={(val) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    receiptTemplate: {
                      ...(prev.receiptTemplate || {}),
                      condition2: val,
                      footerCondition2: val,
                    },
                  }))
                }
                placeholder="e.g. Please check weight and quality before leaving the counter"
                className="w-full"
              />
            </SettingRow>

            <SettingRow
              label="Condition Line 3"
              description="Additional warranty or jurisdiction note"
            >
              <TextField
                value={tmpl?.condition3 || tmpl?.footerCondition3 || ''}
                onChange={(val) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    receiptTemplate: {
                      ...(prev.receiptTemplate || {}),
                      condition3: val,
                      footerCondition3: val,
                    },
                  }))
                }
                placeholder="e.g. Subject to local jurisdiction only"
                className="w-full"
              />
            </SettingRow>

            <SettingRow
              label="Footer Message 1"
              description="Main bold thank-you message"
            >
              <TextField
                value={tmpl?.footerMsg1 || tmpl?.footerMessage || ''}
                onChange={(val) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    receiptTemplate: {
                      ...(prev.receiptTemplate || {}),
                      footerMsg1: val,
                      footerMessage: val,
                    },
                  }))
                }
                placeholder="Thank You! Visit Again"
                className="w-80 font-bold"
              />
            </SettingRow>

            <SettingRow
              label="Footer Message 2"
              description="Secondary closing greeting"
            >
              <TextField
                value={tmpl?.footerMsg2 || ''}
                onChange={(val) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    receiptTemplate: { ...(prev.receiptTemplate || {}), footerMsg2: val },
                  }))
                }
                placeholder="Have a Healthy & Fresh Day!"
                className="w-80"
              />
            </SettingRow>
          </SettingCard>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────
          TAB 3: WhatsApp Meta (Direct & Cloud API Sharing)
          ────────────────────────────────────────────────────────── */}
      {activeTab === 'whatsapp' && (
        <div className="space-y-6">
          <SettingCard
            title="WhatsApp Customer Bill & Report Sharing"
            description="Send formatted receipts and ledger summaries directly to customer/supplier WhatsApp"
            icon={<MessageSquare size={16} className="text-emerald-500" />}
          >
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1">
              <p className="text-xs font-black text-emerald-400">Direct WhatsApp Integration Active</p>
              <p className="text-[11px] text-emerald-300/80">
                You can send bills directly from the POS software to customers using their registered mobile number.
                The Direct WhatsApp mode requires zero API setup and launches directly in WhatsApp Web or the WhatsApp Desktop application.
              </p>
            </div>

            <SettingRow
              label="Software Registered Mobile No"
              description="Your store's registered WhatsApp business mobile number used to identify messages"
            >
              <TextField
                value={tmpl?.softwareMobileNo || ''}
                onChange={(val) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    receiptTemplate: { ...(prev.receiptTemplate || {}), softwareMobileNo: val },
                  }))
                }
                placeholder="e.g. 9876543210"
                className="w-64 font-mono font-bold"
              />
            </SettingRow>

            <SettingRow
              label="WhatsApp Default Message Bar"
              description="Default message automatically appended to bills (e.g., Thank you, store offers, visit again)"
            >
              <TextField
                value={tmpl?.whatsAppDefaultMessage || ''}
                onChange={(val) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    receiptTemplate: { ...(prev.receiptTemplate || {}), whatsAppDefaultMessage: val },
                  }))
                }
                placeholder="Thank you for shopping with us! Visit again. Quality is our promise."
                className="w-full font-medium"
              />
            </SettingRow>

            <SettingRow
              label="Auto Festival & Holiday Wishes"
              description="Automatically check the calendar and include festival wishes on auspicious dates"
            >
              <ToggleControl
                checked={tmpl?.whatsAppAutoFestivalWishes !== false}
                onChange={(val) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    receiptTemplate: { ...(prev.receiptTemplate || {}), whatsAppAutoFestivalWishes: val },
                  }))
                }
                label={tmpl?.whatsAppAutoFestivalWishes !== false ? 'Enabled (Auto Greeting Active)' : 'Disabled'}
              />
            </SettingRow>

            {tmpl?.whatsAppAutoFestivalWishes !== false && (
              <div className="space-y-2.5 pt-3 pb-2 border-t border-border-subtle/80 bg-surface-panel/60 p-3.5 rounded-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-text-primary">Festival & Holiday Calendar Greetings</p>
                    <p className="text-[10px] text-text-muted">Turn greetings on/off or edit messages for each holiday</p>
                  </div>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {(tmpl?.festivalGreetings || [
                    { id: 'pongal', name: 'Pongal / Makar Sankranti', date: '01-14', greeting: '🌾 Wishing you and your family a very Happy & Prosperous Pongal! 🌞', enabled: true },
                    { id: 'republic_day', name: 'Republic Day', date: '01-26', greeting: '🇮🇳 Happy Republic Day! Let us celebrate the glory of our Nation.', enabled: true },
                    { id: 'ramadan_eid', name: 'Eid-ul-Fitr / Ramzan', date: '03-31', greeting: '🌙 Eid Mubarak! Wishing you peace, joy and prosperity.', enabled: true },
                    { id: 'tamil_new_year', name: 'Tamil New Year / Puthandu', date: '04-14', greeting: '✨ Iniya Tamizh Puthandu Nalvazhthukkal! Have a blissful year.', enabled: true },
                    { id: 'bakrid', name: 'Bakrid / Eid-ul-Adha', date: '06-07', greeting: '🌙 Bakrid Mubarak! May this day bring peace and happiness.', enabled: true },
                    { id: 'independence_day', name: 'Independence Day', date: '08-15', greeting: '🇮🇳 Happy Independence Day! Proud to serve you.', enabled: true },
                    { id: 'ganesh_chaturthi', name: 'Ganesh Chaturthi', date: '08-27', greeting: '🌺 Happy Ganesh Chaturthi! May Lord Ganesha shower you with blessings.', enabled: true },
                    { id: 'onam', name: 'Onam', date: '09-05', greeting: '🌸 Happy Onam! Wishing you joy, good health and prosperity.', enabled: true },
                    { id: 'ayudha_poojai', name: 'Ayudha Poojai / Saraswathi Poojai', date: '10-19', greeting: '✨ Happy Ayudha Poojai & Saraswathi Poojai! Best wishes for success and growth.', enabled: true },
                    { id: 'vijayadashami', name: 'Vijayadashami / Dussehra', date: '10-20', greeting: '🏹 Happy Vijayadashami! May victory and goodness prevail.', enabled: true },
                    { id: 'deepavali', name: 'Diwali / Deepavali', date: '11-08', greeting: '🪔 Wishing you and your family a glittering and Happy Deepavali! 🎆', enabled: true },
                    { id: 'christmas', name: 'Christmas', date: '12-25', greeting: '🎄 Merry Christmas! Wishing you joy, warmth and festive cheer.', enabled: true },
                    { id: 'new_year', name: 'New Year', date: '01-01', greeting: '🎉 Happy New Year! Wishing you a healthy and prosperous year ahead.', enabled: true }
                  ]).map((fest: any, index: number) => {
                    const list = tmpl?.festivalGreetings || [
                      { id: 'pongal', name: 'Pongal / Makar Sankranti', date: '01-14', greeting: '🌾 Wishing you and your family a very Happy & Prosperous Pongal! 🌞', enabled: true },
                      { id: 'republic_day', name: 'Republic Day', date: '01-26', greeting: '🇮🇳 Happy Republic Day! Let us celebrate the glory of our Nation.', enabled: true },
                      { id: 'ramadan_eid', name: 'Eid-ul-Fitr / Ramzan', date: '03-31', greeting: '🌙 Eid Mubarak! Wishing you peace, joy and prosperity.', enabled: true },
                      { id: 'tamil_new_year', name: 'Tamil New Year / Puthandu', date: '04-14', greeting: '✨ Iniya Tamizh Puthandu Nalvazhthukkal! Have a blissful year.', enabled: true },
                      { id: 'bakrid', name: 'Bakrid / Eid-ul-Adha', date: '06-07', greeting: '🌙 Bakrid Mubarak! May this day bring peace and happiness.', enabled: true },
                      { id: 'independence_day', name: 'Independence Day', date: '08-15', greeting: '🇮🇳 Happy Independence Day! Proud to serve you.', enabled: true },
                      { id: 'ganesh_chaturthi', name: 'Ganesh Chaturthi', date: '08-27', greeting: '🌺 Happy Ganesh Chaturthi! May Lord Ganesha shower you with blessings.', enabled: true },
                      { id: 'onam', name: 'Onam', date: '09-05', greeting: '🌸 Happy Onam! Wishing you joy, good health and prosperity.', enabled: true },
                      { id: 'ayudha_poojai', name: 'Ayudha Poojai / Saraswathi Poojai', date: '10-19', greeting: '✨ Happy Ayudha Poojai & Saraswathi Poojai! Best wishes for success and growth.', enabled: true },
                      { id: 'vijayadashami', name: 'Vijayadashami / Dussehra', date: '10-20', greeting: '🏹 Happy Vijayadashami! May victory and goodness prevail.', enabled: true },
                      { id: 'deepavali', name: 'Diwali / Deepavali', date: '11-08', greeting: '🪔 Wishing you and your family a glittering and Happy Deepavali! 🎆', enabled: true },
                      { id: 'christmas', name: 'Christmas', date: '12-25', greeting: '🎄 Merry Christmas! Wishing you joy, warmth and festive cheer.', enabled: true },
                      { id: 'new_year', name: 'New Year', date: '01-01', greeting: '🎉 Happy New Year! Wishing you a healthy and prosperous year ahead.', enabled: true }
                    ];

                    const handleToggleFest = (enabled: boolean) => {
                      const updated = [...list];
                      updated[index] = { ...updated[index], enabled };
                      updateDraftConfig((prev) => ({
                        ...prev,
                        receiptTemplate: { ...(prev.receiptTemplate || {}), festivalGreetings: updated },
                      }));
                    };

                    const handleEditGreeting = (newGreeting: string) => {
                      const updated = [...list];
                      updated[index] = { ...updated[index], greeting: newGreeting };
                      updateDraftConfig((prev) => ({
                        ...prev,
                        receiptTemplate: { ...(prev.receiptTemplate || {}), festivalGreetings: updated },
                      }));
                    };

                    return (
                      <div key={fest.id} className="p-2 bg-surface-card border border-border-subtle rounded-lg flex flex-col gap-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-text-primary">{fest.name}</span>
                            <span className="font-mono text-[10px] text-text-muted bg-surface-panel px-1.5 py-0.2 rounded border border-border-subtle">{fest.date}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleToggleFest(!fest.enabled)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                              fest.enabled
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {fest.enabled ? '✓ Needed' : '✗ Not Needed'}
                          </button>
                        </div>
                        <input
                          type="text"
                          value={fest.greeting}
                          onChange={(e) => handleEditGreeting(e.target.value)}
                          className="w-full bg-surface-panel border border-border-subtle rounded px-2 py-1 text-[11px] text-text-secondary outline-none focus:border-brand-500"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <SettingRow
              label="WhatsApp Dispatch Mode"
              description="Choose between Zero-Cost Direct wa.me launch or Automated Meta Cloud API"
            >
              <SegmentedControl<'direct' | 'cloud_api'>
                value={tmpl?.whatsAppSendMode || 'direct'}
                options={[
                  { value: 'direct', label: 'Direct WhatsApp (wa.me / Web & App - Free)' },
                  { value: 'cloud_api', label: 'Meta Cloud API (Official Cloud Platform)' },
                ]}
                onChange={(val) =>
                  updateDraftConfig((prev) => ({
                    ...prev,
                    receiptTemplate: { ...(prev.receiptTemplate || {}), whatsAppSendMode: val },
                  }))
                }
              />
            </SettingRow>

            {tmpl?.whatsAppSendMode === 'cloud_api' && (
              <div className="space-y-4 pt-4 border-t border-border-subtle/80 bg-surface-panel p-4 rounded-xl">
                <p className="text-xs font-bold text-text-primary">Meta Developer Cloud API Configuration</p>

                <SettingRow
                  label="Meta API Access Token"
                  description="System User Permanent Token from Facebook Developer App"
                >
                  <TextField
                    type="password"
                    value={tmpl?.whatsAppMetaApiKey || ''}
                    onChange={(val) =>
                      updateDraftConfig((prev) => ({
                        ...prev,
                        receiptTemplate: { ...(prev.receiptTemplate || {}), whatsAppMetaApiKey: val },
                      }))
                    }
                    placeholder="EAAB..."
                    className="w-full font-mono text-xs"
                  />
                </SettingRow>

                <SettingRow
                  label="Phone Number ID"
                  description="Meta Phone Number ID from WhatsApp Cloud API dashboard"
                >
                  <TextField
                    value={tmpl?.whatsAppMetaPhoneId || ''}
                    onChange={(val) =>
                      updateDraftConfig((prev) => ({
                        ...prev,
                        receiptTemplate: { ...(prev.receiptTemplate || {}), whatsAppMetaPhoneId: val },
                      }))
                    }
                    placeholder="e.g. 109823746192834"
                    className="w-64 font-mono"
                  />
                </SettingRow>

                <SettingRow
                  label="WhatsApp Business Account ID"
                  description="WABA ID from Meta Business Suite"
                >
                  <TextField
                    value={tmpl?.whatsAppWabaId || ''}
                    onChange={(val) =>
                      updateDraftConfig((prev) => ({
                        ...prev,
                        receiptTemplate: { ...(prev.receiptTemplate || {}), whatsAppWabaId: val },
                      }))
                    }
                    placeholder="e.g. 293847561029384"
                    className="w-64 font-mono"
                  />
                </SettingRow>
              </div>
            )}

            {/* Test WhatsApp Message Action */}
            <div className="pt-4 border-t border-border-subtle/80 space-y-3">
              <p className="text-xs font-bold text-text-primary">Test WhatsApp Message Dispatch</p>
              <div className="flex items-center gap-3">
                <TextField
                  value={testPhone}
                  onChange={setTestPhone}
                  placeholder="Enter test mobile number (e.g. 9876543210)"
                  className="w-72 font-mono"
                />
                <button
                  type="button"
                  disabled={isTestingWhatsApp}
                  onClick={handleTestWhatsApp}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-black transition-all flex items-center gap-2 shadow-subtle hover:scale-[1.02] active:scale-[0.98]"
                >
                  {isTestingWhatsApp ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Sending Test...</span>
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      <span>Send Test WhatsApp Message</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </SettingCard>
        </div>
      )}
    </div>
  );
};

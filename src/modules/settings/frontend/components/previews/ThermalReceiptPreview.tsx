import React, { useState, useRef } from 'react';
import { useSettingsDraftStore } from '../../hooks/useSettingsDraftStore';
import { IPC_CHANNELS } from '../../../../../core/ipc/channels';
import { generateClientTestReceiptHTML, generateClientWidthCalibrationHTML, printHtmlViaIframe } from '../../utils/clientReceiptPrint';
import { useQueryClient } from '@tanstack/react-query';

// Helper component for draggable and numeric nudging per row/element
interface PositionableItemProps {
  id: string;
  label: string;
  offsetMm: number;
  onOffsetChange: (newMm: number) => void;
  children: React.ReactNode;
  isDeadZoneCollision?: boolean;
}

const PositionableItem: React.FC<PositionableItemProps> = ({
  id,
  label,
  offsetMm,
  onOffsetChange,
  children,
  isDeadZoneCollision,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const startOffset = useRef(offsetMm);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only initiate drag if left mouse button and not clicking an input/contentEditable
    const target = e.target as HTMLElement;
    if (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'BUTTON') {
      return;
    }
    setIsDragging(true);
    dragStartX.current = e.clientX;
    startOffset.current = offsetMm;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - dragStartX.current;
      // 3.78px ≈ 1mm
      const deltaMm = Math.round(deltaPx / 3.78);
      onOffsetChange(startOffset.current + deltaMm);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      className={`group/pos relative my-0.5 transition-all rounded ${
        isDeadZoneCollision
          ? 'ring-2 ring-rose-500 bg-rose-500/10'
          : isDragging
          ? 'ring-1 ring-brand-500 bg-brand-500/5'
          : 'hover:ring-1 hover:ring-amber-500/50'
      }`}
      style={{
        position: 'relative',
        left: `${offsetMm * 3.78}px`,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      onMouseDown={handleMouseDown}
      title={`${label} · Drag left/right or use nudge buttons (${offsetMm}mm)`}
    >
      {/* Mini floating hover badge with +/- nudgers */}
      <div className="opacity-0 group-hover/pos:opacity-100 absolute -top-5 right-0 z-30 flex items-center gap-0.5 bg-slate-900/90 text-white px-1 py-0.5 rounded shadow-lg text-[9px] font-mono pointer-events-auto transition-opacity">
        <span className="text-[8px] font-sans font-bold text-amber-300 mr-0.5">{label}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOffsetChange(offsetMm - 1);
          }}
          className="w-4 h-4 bg-slate-700 hover:bg-slate-600 rounded flex items-center justify-center font-bold text-amber-300"
          title="Nudge left (-1mm)"
        >
          -
        </button>
        <input
          type="text"
          value={offsetMm}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '' || v === '-') {
              onOffsetChange(0);
            } else {
              const parsed = parseInt(v, 10);
              if (!isNaN(parsed)) onOffsetChange(parsed);
            }
          }}
          className="w-7 text-center bg-slate-800 text-white font-mono px-0.5 py-0 rounded border border-slate-700 text-[9px]"
        />
        <span className="text-[8px] text-slate-400">mm</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOffsetChange(offsetMm + 1);
          }}
          className="w-4 h-4 bg-slate-700 hover:bg-slate-600 rounded flex items-center justify-center font-bold text-amber-300"
          title="Nudge right (+1mm)"
        >
          +
        </button>
      </div>

      {children}
    </div>
  );
};

export const ThermalReceiptPreview: React.FC = () => {
  const queryClient = useQueryClient();
  const { draftConfig, updateDraftConfig } = useSettingsDraftStore();
  const shop = draftConfig.shopInfo;
  const tmpl = draftConfig.receiptTemplate;
  const inv = draftConfig.invoice;

  const [isPrinting, setIsPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const is58mm = tmpl?.paperWidth === '58mm';
  const paperWidthMm = is58mm ? 58 : 80;
  const safePrintWidthMm = tmpl?.safePrintWidthMm ?? (is58mm ? 48 : 60);
  const leftMarginMm = tmpl?.leftMarginMm ?? 0;
  const rightMarginMm = tmpl?.rightMarginMm ?? 4;
  const rightSafeMarginMm = tmpl?.rightSafeMarginMm ?? 5;
  const topMarginMm = tmpl?.topMarginMm ?? 0;
  const [isCalibrating, setIsCalibrating] = useState(false);

  // Unprintable dead zone setting (in mm, e.g. 20mm)
  const unprintableZoneMm = tmpl?.unprintableRightZoneMm ?? 20;

  // Per-element horizontal offsets
  const elementOffsets: Record<string, number> = tmpl?.elementOffsets || {};
  const getOffset = (key: string) => elementOffsets[key] ?? 0;

  const itemWidthPct = tmpl?.itemWidthPercent || 44;
  const qtyWidthPct = tmpl?.qtyWidthPercent || 18;
  const rateWidthPct = tmpl?.rateWidthPercent || 18;
  const amtWidthPct = tmpl?.amountWidthPercent || 20;

  // Column Labels
  const itemLabel = tmpl?.itemColLabel || 'ITEM';
  const qtyLabel = tmpl?.qtyColLabel || 'Qty';
  const rateLabel = tmpl?.rateColLabel || 'Rate';
  const amtLabel = tmpl?.amtColLabel || 'Amount';

  const fontFamilies: Record<string, string> = {
    'Consolas': "'Consolas', 'Courier New', monospace",
    'Arial': "Arial, Helvetica, sans-serif",
    'Calibri': "Calibri, Candara, Segoe, sans-serif",
    'Segoe UI': "'Segoe UI', Roboto, sans-serif",
    'Courier New': "'Courier New', Courier, monospace",
  };
  const fontStack = fontFamilies[tmpl?.fontFamily || 'Consolas'] || fontFamilies['Consolas'];

  const fontSizes: Record<string, number> = {
    small: is58mm ? 8.5 : 10,
    medium: is58mm ? 9.5 : 11.5,
    large: is58mm ? 11 : 13,
  };
  const baseFontSizePx = fontSizes[tmpl?.fontSize || 'medium'] || (is58mm ? 9.5 : 11.5);

  const headerAlign = tmpl?.headerAlignment || 'left';
  const headerAlignClass =
    headerAlign === 'center'
      ? 'text-center'
      : headerAlign === 'right'
      ? 'text-right'
      : 'text-left';

  // Trigger debounced auto-save to backend
  const triggerAutoSave = (updatedTmpl: any) => {
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        const currentDraft = useSettingsDraftStore.getState().draftConfig;
        const nextConfig = {
          ...currentDraft,
          receiptTemplate: updatedTmpl,
        };
        await window.api.invoke(IPC_CHANNELS.CONFIG.UPDATE, nextConfig);
        queryClient.setQueryData(['config'], nextConfig);
      } catch (e) {
        console.warn('Auto-save failed:', e);
      }
    }, 400);
  };

  const updateTemplate = (updates: Partial<typeof tmpl>) => {
    const nextTmpl = { ...(tmpl || {}), ...updates };
    updateDraftConfig((prev) => ({
      ...prev,
      receiptTemplate: nextTmpl as any,
    }));
    triggerAutoSave(nextTmpl);
  };

  const updateField = (key: string, value: string) => {
    updateTemplate({ [key]: value });
  };

  const updateElementOffset = (key: string, valMm: number) => {
    const nextOffsets = {
      ...(tmpl?.elementOffsets || {}),
      [key]: valMm,
    };
    updateTemplate({ elementOffsets: nextOffsets });
  };

  const handleQuickTestPrint = async () => {
    setIsPrinting(true);
    setPrintStatus(null);
    try {
      const latestDraftConfig = useSettingsDraftStore.getState().draftConfig;
      await window.api.invoke(IPC_CHANNELS.CONFIG.UPDATE, latestDraftConfig);
      queryClient.setQueryData(['config'], latestDraftConfig);

      let printedViaIpc = false;
      try {
        const res = await window.api.invoke(IPC_CHANNELS.BILLING.PRINT_TEST_RECEIPT, {
          templateOverride: latestDraftConfig.receiptTemplate,
        });
        if (res && res.success) {
          printedViaIpc = true;
          setPrintStatus({ type: 'success', text: '✓ Test ticket printed! Check paper output.' });
        }
      } catch (ipcErr) {
        console.warn('IPC test print threw, using iframe fallback:', ipcErr);
      }

      if (!printedViaIpc) {
        const html = generateClientTestReceiptHTML(latestDraftConfig.receiptTemplate, latestDraftConfig.shopInfo);
        await printHtmlViaIframe(html);
        setPrintStatus({ type: 'success', text: '✓ Test ticket sent to printer.' });
      }
    } catch (e: any) {
      setPrintStatus({ type: 'error', text: e.message || 'Failed to print test ticket' });
    } finally {
      setIsPrinting(false);
      setTimeout(() => setPrintStatus(null), 5000);
    }
  };

  const handleRunWidthCalibration = async () => {
    setIsCalibrating(true);
    setPrintStatus(null);
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
        setPrintStatus({ type: 'success', text: '✓ Calibration series sent to printer! Check paper roll for cleanest strip.' });
      }
    } catch (e: any) {
      setPrintStatus({ type: 'error', text: e.message || 'Failed running calibration' });
    } finally {
      setIsCalibrating(false);
      setTimeout(() => setPrintStatus(null), 8000);
    }
  };

  // Check if right-aligned elements or table amount columns encroach into dead zone
  // Dead zone start point in mm from left: paperWidthMm - unprintableZoneMm
  const deadZoneStartMm = paperWidthMm - unprintableZoneMm;
  // If safe printable width + leftMarginMm + offset reaches >= deadZoneStartMm, it encroaches
  const isEncroaching = (offset: number, extraWidthRatio: number = 1.0) => {
    const effectiveRightEdgeMm = leftMarginMm + (safePrintWidthMm * extraWidthRatio) + offset;
    return effectiveRightEdgeMm > deadZoneStartMm;
  };

  const totalPaperPx = Math.round(paperWidthMm * 3.78);
  const deadZonePx = Math.round(unprintableZoneMm * 3.78);

  return (
    <div className="w-full flex flex-col items-center select-none pb-8">
      {/* Quick Alignment & Calibration Toolbar */}
      <div className="w-full max-w-[370px] mb-2 p-2.5 bg-surface-card border border-border-subtle rounded-xl flex flex-col gap-2 shadow-sm">
        {/* Row 1: Dead Zone Calibration Slider */}
        <div className="flex items-center justify-between p-1.5 bg-rose-500/10 rounded-lg border border-rose-500/30 text-[10.5px]">
          <div className="flex flex-col">
            <span className="font-bold text-rose-400 flex items-center gap-1">
              <span>⚠️ Hardware Dead Zone:</span>
              <strong className="font-mono text-xs">{unprintableZoneMm}mm</strong>
            </span>
            <span className="text-[9px] text-rose-300/80">RP 3220 Star right unprintable area</span>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="range"
              min={0}
              max={35}
              step={1}
              value={unprintableZoneMm}
              onChange={(e) => updateTemplate({ unprintableRightZoneMm: Number(e.target.value) })}
              className="w-20 accent-rose-500 cursor-pointer"
              title="Adjust unprintable zone width in mm"
            />
            <input
              type="number"
              value={unprintableZoneMm}
              onChange={(e) => updateTemplate({ unprintableRightZoneMm: Math.max(0, Number(e.target.value) || 0) })}
              className="w-9 px-1 py-0.5 bg-surface-card border border-rose-500/40 rounded font-mono text-center font-bold text-rose-400 text-xs"
            />
          </div>
        </div>

        {/* Row 2: Precision Margin & Safe Width Controls */}
        <div className="grid grid-cols-4 gap-1.5 text-[10px]">
          {/* Safe-W */}
          <div className="flex flex-col gap-0.5 p-1 bg-brand-500/10 rounded-lg border border-brand-500/30">
            <span className="font-bold text-brand-400 text-[9.5px] flex items-center justify-between">
              <span>Safe-W</span>
              <span className="text-[8px] text-brand-300/80 font-normal">mm</span>
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => updateTemplate({ safePrintWidthMm: Math.max(35, safePrintWidthMm - 1) })}
                className="w-4 h-4 flex items-center justify-center bg-surface-card hover:bg-surface-panel rounded font-bold border border-border-subtle text-brand-400 text-xs"
                title="Decrease safe content width (-1mm)"
              >
                -
              </button>
              <input
                type="number"
                value={safePrintWidthMm}
                onChange={(e) => updateTemplate({ safePrintWidthMm: Math.min(80, Math.max(35, Number(e.target.value) || 60)) })}
                className="w-full px-0.5 py-0.5 bg-surface-card border border-brand-500/40 rounded font-mono text-center font-bold text-brand-300 text-[11px]"
              />
              <button
                type="button"
                onClick={() => updateTemplate({ safePrintWidthMm: Math.min(80, safePrintWidthMm + 1) })}
                className="w-4 h-4 flex items-center justify-center bg-surface-card hover:bg-surface-panel rounded font-bold border border-border-subtle text-brand-400 text-xs"
                title="Increase safe content width (+1mm)"
              >
                +
              </button>
            </div>
          </div>

          {/* L-Shift */}
          <div className="flex flex-col gap-0.5 p-1 bg-surface-panel rounded-lg border border-border-subtle">
            <span className="font-bold text-text-muted text-[9.5px] flex items-center justify-between">
              <span>L-Shift</span>
              <span className="text-[8px] text-text-muted font-normal">mm</span>
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => updateTemplate({ leftMarginMm: (Number(leftMarginMm) || 0) - 1 })}
                className="w-4 h-4 flex items-center justify-center bg-surface-card hover:bg-surface-panel rounded font-bold border border-border-subtle text-text-secondary text-xs"
                title="Shift further left (-1mm)"
              >
                -
              </button>
              <input
                type="text"
                value={leftMarginMm}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || val === '-') {
                    updateTemplate({ leftMarginMm: val as any });
                  } else {
                    const num = parseInt(val, 10);
                    if (!isNaN(num)) updateTemplate({ leftMarginMm: num });
                  }
                }}
                className="w-full px-0.5 py-0.5 bg-surface-card border border-border-subtle rounded font-mono text-center font-bold text-text-primary text-[11px]"
              />
              <button
                type="button"
                onClick={() => updateTemplate({ leftMarginMm: (Number(leftMarginMm) || 0) + 1 })}
                className="w-4 h-4 flex items-center justify-center bg-surface-card hover:bg-surface-panel rounded font-bold border border-border-subtle text-text-secondary text-xs"
                title="Shift right (+1mm)"
              >
                +
              </button>
            </div>
          </div>

          {/* R-Inset */}
          <div className="flex flex-col gap-0.5 p-1 bg-surface-panel rounded-lg border border-amber-500/30">
            <span className="font-bold text-amber-500 text-[9.5px] flex items-center justify-between">
              <span>R-Inset</span>
              <span className="text-[8px] text-amber-500/80 font-normal">mm</span>
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => updateTemplate({ rightMarginMm: (Number(rightMarginMm) || 0) - 1 })}
                className="w-4 h-4 flex items-center justify-center bg-surface-card hover:bg-surface-panel rounded font-bold border border-border-subtle text-amber-500 text-xs"
                title="Decrease safe right inset (-1mm)"
              >
                -
              </button>
              <input
                type="text"
                value={rightMarginMm}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || val === '-') {
                    updateTemplate({ rightMarginMm: val as any });
                  } else {
                    const num = parseInt(val, 10);
                    if (!isNaN(num)) updateTemplate({ rightMarginMm: num });
                  }
                }}
                className="w-full px-0.5 py-0.5 bg-surface-card border border-amber-500/40 rounded font-mono text-center font-bold text-amber-400 text-[11px]"
              />
              <button
                type="button"
                onClick={() => updateTemplate({ rightMarginMm: (Number(rightMarginMm) || 0) + 1 })}
                className="w-4 h-4 flex items-center justify-center bg-surface-card hover:bg-surface-panel rounded font-bold border border-border-subtle text-amber-500 text-xs"
                title="Increase safe right inset (+1mm)"
              >
                +
              </button>
            </div>
          </div>

          {/* Top Feed */}
          <div className="flex flex-col gap-0.5 p-1 bg-surface-panel rounded-lg border border-border-subtle">
            <span className="font-bold text-text-muted text-[9.5px] flex items-center justify-between">
              <span>Top</span>
              <span className="text-[8px] text-text-muted font-normal">mm</span>
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => updateTemplate({ topMarginMm: Math.max(0, (Number(topMarginMm) || 0) - 1) })}
                className="w-4 h-4 flex items-center justify-center bg-surface-card hover:bg-surface-panel rounded font-bold border border-border-subtle text-text-secondary text-xs"
              >
                -
              </button>
              <input
                type="number"
                value={topMarginMm}
                onChange={(e) => updateTemplate({ topMarginMm: Math.max(0, Number(e.target.value) || 0) })}
                className="w-full px-0.5 py-0.5 bg-surface-card border border-border-subtle rounded font-mono text-center font-bold text-text-primary text-[11px]"
              />
              <button
                type="button"
                onClick={() => updateTemplate({ topMarginMm: (Number(topMarginMm) || 0) + 1 })}
                className="w-4 h-4 flex items-center justify-center bg-surface-card hover:bg-surface-panel rounded font-bold border border-border-subtle text-text-secondary text-xs"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Row 3: Action Buttons (Test Print + Multi-Width Calibration) */}
        <div className="pt-1 border-t border-border-subtle/50 flex gap-2">
          <button
            type="button"
            onClick={handleQuickTestPrint}
            disabled={isPrinting || isCalibrating}
            className="flex-1 py-1.5 px-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-black flex items-center justify-center gap-1.5 transition-all shadow-subtle active:scale-[0.99] disabled:opacity-50"
            title="Send test receipt directly to thermal printer"
          >
            {isPrinting ? (
              <>
                <span className="animate-spin text-xs">⏳</span>
                <span>Printing Test...</span>
              </>
            ) : (
              <>
                <span className="text-sm">🖨️</span>
                <span>Test Print</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleRunWidthCalibration}
            disabled={isPrinting || isCalibrating}
            className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-subtle active:scale-[0.99] disabled:opacity-50"
            title="Print a series of test strips (76mm to 52mm) to find the cleanest width"
          >
            {isCalibrating ? (
              <>
                <span className="animate-spin text-xs">⏳</span>
                <span>Running...</span>
              </>
            ) : (
              <>
                <span>📏</span>
                <span>Width Series</span>
              </>
            )}
          </button>
        </div>

        {/* Status Notification */}
        {printStatus && (
          <div
            className={`p-1.5 rounded text-[10px] font-bold text-center ${
              printStatus.type === 'success'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
            }`}
          >
            {printStatus.text}
          </div>
        )}
      </div>

      <div className="text-[10.5px] text-text-muted mb-1 text-center font-medium max-w-[360px]">
        💡 <span className="text-amber-400 font-bold">Manual Ruler & Nudge:</span> Drag rows left/right or click floating nudgers. Red hatched zone = printer hardware cutoff.
      </div>

      {/* ──────────────────────────────────────────────────────────
          FEATURE 1: VISUAL RULER WITH MARKED DEAD ZONE
          ────────────────────────────────────────────────────────── */}
      <div
        className="relative bg-slate-900 border border-slate-700 rounded-t-lg overflow-hidden select-none mb-0 shadow-md"
        style={{ width: `${totalPaperPx}px`, height: '36px' }}
      >
        {/* Millimeter Tick Marks */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: paperWidthMm + 1 }).map((_, i) => {
            const is10mm = i % 10 === 0;
            const is5mm = i % 5 === 0 && !is10mm;
            return (
              <div
                key={i}
                className="absolute top-0 flex flex-col items-center"
                style={{ left: `${i * 3.78}px` }}
              >
                <div
                  className={`${
                    is10mm ? 'h-3.5 w-[1.5px] bg-slate-200' : is5mm ? 'h-2 w-[1px] bg-slate-400' : 'h-1 w-[0.5px] bg-slate-600'
                  }`}
                />
                {is10mm && (
                  <span className="text-[8px] font-mono font-bold text-slate-300 mt-0.5 select-none">
                    {i}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Shaded Red / Hatched Dead Zone on Ruler */}
        {unprintableZoneMm > 0 && (
          <div
            className="absolute top-0 bottom-0 right-0 border-l-2 border-rose-500 flex items-center justify-center px-1 overflow-hidden"
            style={{
              width: `${deadZonePx}px`,
              background: 'repeating-linear-gradient(45deg, rgba(244,63,94,0.35), rgba(244,63,94,0.35) 4px, rgba(225,29,72,0.6) 4px, rgba(225,29,72,0.6) 8px)',
            }}
            title={`Unprintable Hardware Zone (${unprintableZoneMm}mm)`}
          >
            <span className="text-[8px] font-black text-white uppercase tracking-tight whitespace-nowrap drop-shadow bg-rose-950/70 px-1 py-0.5 rounded">
              🚫 {unprintableZoneMm}mm Cutoff
            </span>
          </div>
        )}
      </div>

      {/* ──────────────────────────────────────────────────────────
          PAPER CONTAINER MOCKUP WITH SHADED DEAD ZONE OVERLAY
          ────────────────────────────────────────────────────────── */}
      <div
        className="bg-white text-black p-0 rounded-b-lg shadow-2xl text-left leading-tight transition-all border border-gray-300 relative overflow-visible"
        style={{
          width: `${totalPaperPx}px`,
          fontFamily: fontStack,
          fontSize: `${baseFontSizePx}px`,
          fontWeight: 700,
          color: '#000000',
          backgroundColor: '#ffffff',
          boxSizing: 'border-box',
          paddingTop: `${6 + topMarginMm * 3.78}px`,
          paddingBottom: '24px',
        }}
      >
        {/* Full-height Shaded Red Dead Zone Overlay down the paper */}
        {unprintableZoneMm > 0 && (
          <div
            className="absolute top-0 bottom-0 right-0 border-l-2 border-dashed border-rose-400 pointer-events-none z-20 flex flex-col items-center justify-start pt-8"
            style={{
              width: `${deadZonePx}px`,
              background: 'repeating-linear-gradient(45deg, rgba(244,63,94,0.12), rgba(244,63,94,0.12) 6px, rgba(225,29,72,0.22) 6px, rgba(225,29,72,0.22) 12px)',
            }}
          >
            <div className="bg-rose-600/90 text-white font-black text-[8px] uppercase tracking-wider py-1 px-1.5 rounded rotate-90 origin-center whitespace-nowrap shadow-sm mb-12">
              Unprintable Zone ({unprintableZoneMm}mm)
            </div>
          </div>
        )}

        {/* Printable Area Sub-container: strictly safePrintWidthMm at 3.78px/mm */}
        <div
          style={{
            position: 'relative',
            left: `${leftMarginMm * 3.78}px`,
            width: `${safePrintWidthMm * 3.78}px`,
            boxSizing: 'border-box',
            transition: 'all 0.15s ease',
          }}
        >
          {/* Shop Header Block (Draggable & contentEditable) */}
          <PositionableItem
            id="shopHeader"
            label="Shop Header"
            offsetMm={getOffset('shopHeader')}
            onOffsetChange={(val) => updateElementOffset('shopHeader', val)}
            isDeadZoneCollision={isEncroaching(getOffset('shopHeader'), 0.9)}
          >
            {/* Top Slogan */}
            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => updateField('topSlogan', e.currentTarget.textContent || '')}
              className={`${headerAlignClass} font-black text-[11px] mb-0.5 break-words outline-none hover:bg-yellow-100 focus:bg-yellow-100 rounded px-0.5`}
              title="Click to edit top slogan"
            >
              {tmpl?.topSlogan || '*** FRESH & HALAL MEAT ***'}
            </div>

            {/* Shop Title */}
            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => updateField('shopName', e.currentTarget.textContent || '')}
              className={`${headerAlignClass} font-black uppercase tracking-wide mb-1 leading-tight break-words outline-none hover:bg-yellow-100 focus:bg-yellow-100 rounded px-0.5`}
              style={{ fontSize: `${baseFontSizePx + 3}px` }}
              title="Click to edit shop title"
            >
              {tmpl?.shopName || shop.name || 'MEAT SHOP POS'}
            </div>

            {/* Address Line 1 */}
            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => updateField('addressLine1', e.currentTarget.textContent || '')}
              className={`${headerAlignClass} leading-tight font-bold break-words outline-none hover:bg-yellow-100 focus:bg-yellow-100 rounded px-0.5`}
              style={{ fontSize: `${Math.max(9, baseFontSizePx - 1)}px` }}
              title="Click to edit address line 1"
            >
              {tmpl?.addressLine1 || shop.address || '123 Market Square, Main Road'}
            </div>

            {/* Address Line 2 */}
            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => updateField('addressLine2', e.currentTarget.textContent || '')}
              className={`${headerAlignClass} leading-tight font-bold break-words outline-none hover:bg-yellow-100 focus:bg-yellow-100 rounded px-0.5`}
              style={{ fontSize: `${Math.max(9, baseFontSizePx - 1)}px` }}
              title="Click to edit address line 2"
            >
              {tmpl?.addressLine2 || 'Opposite Bus Stand'}
            </div>

            {/* Phone */}
            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => updateField('softwareMobileNo', e.currentTarget.textContent?.replace(/^Ph:\s*/, '') || '')}
              className={`${headerAlignClass} leading-tight mb-1 font-bold break-words outline-none hover:bg-yellow-100 focus:bg-yellow-100 rounded px-0.5`}
              style={{ fontSize: `${Math.max(9, baseFontSizePx - 1)}px` }}
              title="Click to edit phone number"
            >
              Ph: {tmpl?.softwareMobileNo || tmpl?.phone || shop.phone || '9876543210'}
            </div>
          </PositionableItem>

          {/* Customer info if selected */}
          {tmpl?.showCustomer && (
            <PositionableItem
              id="customerBox"
              label="Cust Box"
              offsetMm={getOffset('customerBox')}
              onOffsetChange={(val) => updateElementOffset('customerBox', val)}
            >
              <div className="font-black uppercase text-left my-1 break-words" style={{ fontSize: `${baseFontSizePx + 1}px` }}>
                <div>CUST: MOHAN REDDY</div>
                <div>PH  : 9876543210</div>
              </div>
            </PositionableItem>
          )}

          {/* Bill Type Header */}
          <PositionableItem
            id="billType"
            label="Bill Type"
            offsetMm={getOffset('billType')}
            onOffsetChange={(val) => updateElementOffset('billType', val)}
          >
            <div className={`${headerAlignClass} font-black uppercase tracking-wider my-1`} style={{ fontSize: `${baseFontSizePx + 1}px` }}>
              *** CASH BILL ***
            </div>
          </PositionableItem>

          {/* Bill No / Date row (Draggable & Nudgeable) */}
          <PositionableItem
            id="billNoDateRow"
            label="Bill & Date"
            offsetMm={getOffset('billNoDateRow')}
            onOffsetChange={(val) => updateElementOffset('billNoDateRow', val)}
            isDeadZoneCollision={isEncroaching(getOffset('billNoDateRow'), 1.0)}
          >
            <div className="flex justify-between items-baseline text-[10.5px] font-bold my-0.5">
              <span>Bill No : {inv?.prefix || 'INV-'}0042</span>
              <span>Date : 14/09/2026</span>
            </div>
          </PositionableItem>

          {/* Cashier / Time row (Draggable & Nudgeable) */}
          <PositionableItem
            id="cashierTimeRow"
            label="Cashier & Time"
            offsetMm={getOffset('cashierTimeRow')}
            onOffsetChange={(val) => updateElementOffset('cashierTimeRow', val)}
            isDeadZoneCollision={isEncroaching(getOffset('cashierTimeRow'), 1.0)}
          >
            <div className="flex justify-between items-baseline text-[10.5px] font-bold mb-1">
              {tmpl?.showCashier && <span>Cashier : ADMIN</span>}
              <span className="ml-auto">Time : 05:30:15 PM</span>
            </div>
          </PositionableItem>

          {/* Divider */}
          <div className="border-t border-dashed border-black my-1" />

          {/* Table Header & Columns (Directly Editable Text & Independent Offsets) */}
          <PositionableItem
            id="tableHeader"
            label="Table Header"
            offsetMm={getOffset('tableHeader')}
            onOffsetChange={(val) => updateElementOffset('tableHeader', val)}
            isDeadZoneCollision={isEncroaching(getOffset('tableHeader') + getOffset('colAmt'), 1.0)}
          >
            <table className="w-full text-left my-1 border-collapse table-fixed text-[10.5px]">
              <thead>
                <tr className="border-b border-dashed border-black font-black uppercase">
                  {/* Col Desc */}
                  <th
                    style={{
                      width: `${itemWidthPct}%`,
                      position: 'relative',
                      left: `${getOffset('colDesc') * 3.78}px`,
                    }}
                    className="text-left py-0.5 break-words"
                  >
                    <span
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => updateField('itemColLabel', e.currentTarget.textContent || 'ITEM')}
                      className="outline-none hover:bg-yellow-100 rounded px-0.5 cursor-text"
                      title="Click to edit column label"
                    >
                      {itemLabel}
                    </span>
                  </th>

                  {/* Col Qty */}
                  <th
                    style={{
                      width: `${qtyWidthPct}%`,
                      position: 'relative',
                      left: `${getOffset('colQty') * 3.78}px`,
                    }}
                    className="text-right py-0.5 break-words"
                  >
                    <span
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => updateField('qtyColLabel', e.currentTarget.textContent || 'Qty')}
                      className="outline-none hover:bg-yellow-100 rounded px-0.5 cursor-text"
                      title="Click to edit column label"
                    >
                      {qtyLabel}
                    </span>
                  </th>

                  {/* Col Rate */}
                  <th
                    style={{
                      width: `${rateWidthPct}%`,
                      position: 'relative',
                      left: `${getOffset('colRate') * 3.78}px`,
                    }}
                    className="text-right py-0.5 break-words"
                  >
                    <span
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => updateField('rateColLabel', e.currentTarget.textContent || 'Rate')}
                      className="outline-none hover:bg-yellow-100 rounded px-0.5 cursor-text"
                      title="Click to edit column label"
                    >
                      {rateLabel}
                    </span>
                  </th>

                  {/* Col Amt */}
                  <th
                    style={{
                      width: `${amtWidthPct}%`,
                      position: 'relative',
                      left: `${getOffset('colAmt') * 3.78}px`,
                    }}
                    className="text-right py-0.5 break-words"
                  >
                    <span
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => updateField('amtColLabel', e.currentTarget.textContent || 'Amount')}
                      className="outline-none hover:bg-yellow-100 rounded px-0.5 cursor-text"
                      title="Click to edit column label"
                    >
                      {amtLabel}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td
                    style={{
                      width: `${itemWidthPct}%`,
                      position: 'relative',
                      left: `${getOffset('colDesc') * 3.78}px`,
                    }}
                    className="py-0.5 text-left font-bold break-words"
                  >
                    CHICKEN CURRY CUT
                  </td>
                  <td
                    style={{
                      width: `${qtyWidthPct}%`,
                      position: 'relative',
                      left: `${getOffset('colQty') * 3.78}px`,
                    }}
                    className="py-0.5 text-right font-bold break-words"
                  >
                    0.500
                  </td>
                  <td
                    style={{
                      width: `${rateWidthPct}%`,
                      position: 'relative',
                      left: `${getOffset('colRate') * 3.78}px`,
                    }}
                    className="py-0.5 text-right font-bold break-words"
                  >
                    160.00
                  </td>
                  <td
                    style={{
                      width: `${amtWidthPct}%`,
                      position: 'relative',
                      left: `${getOffset('colAmt') * 3.78}px`,
                    }}
                    className="py-0.5 text-right font-black break-words"
                  >
                    80.00
                  </td>
                </tr>
                <tr>
                  <td
                    style={{
                      width: `${itemWidthPct}%`,
                      position: 'relative',
                      left: `${getOffset('colDesc') * 3.78}px`,
                    }}
                    className="py-0.5 text-left font-bold break-words"
                  >
                    CHICKEN LIVER
                  </td>
                  <td
                    style={{
                      width: `${qtyWidthPct}%`,
                      position: 'relative',
                      left: `${getOffset('colQty') * 3.78}px`,
                    }}
                    className="py-0.5 text-right font-bold break-words"
                  >
                    0.250
                  </td>
                  <td
                    style={{
                      width: `${rateWidthPct}%`,
                      position: 'relative',
                      left: `${getOffset('colRate') * 3.78}px`,
                    }}
                    className="py-0.5 text-right font-bold break-words"
                  >
                    30.00
                  </td>
                  <td
                    style={{
                      width: `${amtWidthPct}%`,
                      position: 'relative',
                      left: `${getOffset('colAmt') * 3.78}px`,
                    }}
                    className="py-0.5 text-right font-black break-words"
                  >
                    7.50
                  </td>
                </tr>
              </tbody>
            </table>
          </PositionableItem>

          {/* Divider */}
          <div className="border-t border-dashed border-black my-1" />

          {/* Gross Amount Row */}
          <PositionableItem
            id="grossAmountRow"
            label="Gross Amt"
            offsetMm={getOffset('grossAmountRow')}
            onOffsetChange={(val) => updateElementOffset('grossAmountRow', val)}
            isDeadZoneCollision={isEncroaching(getOffset('grossAmountRow'), 1.0)}
          >
            <div className="flex justify-between text-[10.5px] font-bold">
              <span>Gross Amount :</span>
              <span>87.50</span>
            </div>
          </PositionableItem>

          {/* Coinage Row */}
          <PositionableItem
            id="coinageRow"
            label="Coinage"
            offsetMm={getOffset('coinageRow')}
            onOffsetChange={(val) => updateElementOffset('coinageRow', val)}
            isDeadZoneCollision={isEncroaching(getOffset('coinageRow'), 1.0)}
          >
            <div className="flex justify-between text-[10.5px] font-bold">
              <span>Coinage :</span>
              <span>0.50</span>
            </div>
          </PositionableItem>

          {/* Net Amount Row */}
          <PositionableItem
            id="netAmountRow"
            label="Net Amt"
            offsetMm={getOffset('netAmountRow')}
            onOffsetChange={(val) => updateElementOffset('netAmountRow', val)}
            isDeadZoneCollision={isEncroaching(getOffset('netAmountRow'), 1.0)}
          >
            <div className="flex justify-between text-xs font-black pt-0.5">
              <span>Net Amount :</span>
              <span>88.00</span>
            </div>
          </PositionableItem>

          {/* Divider */}
          <div className="border-t border-dashed border-black my-1" />

          {/* Total Items & Qty Row */}
          <PositionableItem
            id="itemsQtyRow"
            label="Items/Qty"
            offsetMm={getOffset('itemsQtyRow')}
            onOffsetChange={(val) => updateElementOffset('itemsQtyRow', val)}
            isDeadZoneCollision={isEncroaching(getOffset('itemsQtyRow'), 1.0)}
          >
            <div className="flex justify-between text-[10.5px] font-bold">
              <span>No.Of.Items 2</span>
              <span>Total Qty 0.750</span>
            </div>
          </PositionableItem>

          {/* Customer Balance Breakdown */}
          {tmpl?.showCustomer && (
            <PositionableItem
              id="customerBalanceBlock"
              label="Cust Ledger"
              offsetMm={getOffset('customerBalanceBlock')}
              onOffsetChange={(val) => updateElementOffset('customerBalanceBlock', val)}
              isDeadZoneCollision={isEncroaching(getOffset('customerBalanceBlock'), 1.0)}
            >
              <div className="mt-1 pt-1 border-t border-dashed border-black space-y-0.5 text-[10.5px] font-bold">
                <div className="flex justify-between">
                  <span>Opening Balance :</span>
                  <span>0.00</span>
                </div>
                <div className="flex justify-between">
                  <span>Bill Amount     :</span>
                  <span>88.00</span>
                </div>
                <div className="flex justify-between">
                  <span>Paid Amount     :</span>
                  <span>88.00</span>
                </div>
                <div className="flex justify-between font-black">
                  <span>Closing Balance :</span>
                  <span>0.00</span>
                </div>
              </div>
            </PositionableItem>
          )}

          {/* Bottom Divider */}
          <div className="border-t border-dashed border-black my-1" />

          {/* Footer Note & Conditions Block */}
          <PositionableItem
            id="footerBlock"
            label="Footer"
            offsetMm={getOffset('footerBlock')}
            onOffsetChange={(val) => updateElementOffset('footerBlock', val)}
          >
            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => updateField('condition1', e.currentTarget.textContent?.replace(/^\*\s*/, '') || '')}
              className={`${headerAlignClass} text-[8.5px] font-bold text-gray-700 mt-1 outline-none hover:bg-yellow-100 focus:bg-yellow-100 rounded px-0.5`}
              title="Click to edit condition 1"
            >
              * {tmpl?.condition1 || 'Weight checked at billing counter'}
            </div>

            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => updateField('condition2', e.currentTarget.textContent?.replace(/^\*\s*/, '') || '')}
              className={`${headerAlignClass} text-[8.5px] font-bold text-gray-700 outline-none hover:bg-yellow-100 focus:bg-yellow-100 rounded px-0.5`}
              title="Click to edit condition 2"
            >
              * {tmpl?.condition2 || 'Goods once sold cannot be returned'}
            </div>

            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => updateField('footerMsg1', e.currentTarget.textContent || '')}
              className={`${headerAlignClass} text-[9.5px] font-black text-black mt-1 outline-none hover:bg-yellow-100 focus:bg-yellow-100 rounded px-0.5`}
              title="Click to edit footer message 1"
            >
              {tmpl?.footerMsg1 || '*** THANK YOU VISIT AGAIN ***'}
            </div>

            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => updateField('footerMessage', e.currentTarget.textContent || '')}
              className={`${headerAlignClass} text-[9px] font-bold text-gray-700 mt-0.5 outline-none hover:bg-yellow-100 focus:bg-yellow-100 rounded px-0.5`}
              title="Click to edit footer message 2"
            >
              {tmpl?.footerMessage || 'Thank you for your business! Visit again.'}
            </div>
          </PositionableItem>

          {/* Calibration Info Panel */}
          <div className="border-t border-dashed border-black my-1" />
          <div className="bg-gray-100 p-1.5 rounded border border-dashed border-gray-400 text-[9px] font-mono leading-tight space-y-0.5">
            <div className="font-black text-center text-[9.5px] mb-0.5 text-black">*** CALIBRATION INFO ***</div>
            <div className="flex justify-between"><span>Safe Width:</span><strong>{safePrintWidthMm} mm</strong></div>
            <div className="flex justify-between"><span>H-Offset  :</span><strong>{leftMarginMm} mm</strong></div>
            <div className="flex justify-between"><span>Paper Roll:</span><strong>{tmpl?.paperWidth || '80mm'}</strong></div>
            <div className="flex justify-between"><span>Font / Sz :</span><strong>{tmpl?.fontFamily || 'Consolas'} ({tmpl?.fontSize || 'medium'})</strong></div>
          </div>
        </div>
      </div>

      <div className="text-[10px] text-text-muted text-center mt-2.5 space-y-0.5 max-w-[360px]">
        <p>
          Roll: <strong className="text-text-primary font-mono">{tmpl?.paperWidth || '80mm'}</strong> · Safe Width: <strong className="text-brand-400 font-mono">{safePrintWidthMm}mm</strong> · Dead Zone: <strong className="text-rose-400 font-mono">{unprintableZoneMm}mm</strong>
        </p>
        <p className="text-[9px] text-text-muted/80">
          (Thermal Printhead Printable Area: {is58mm ? '48mm' : '72mm'})
        </p>
      </div>
    </div>
  );
};

export default ThermalReceiptPreview;


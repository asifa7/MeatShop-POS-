import React, { useState, useEffect } from 'react';
import { Printer, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useSettingsDraftStore } from '../../hooks/useSettingsDraftStore';
import { ThermalReceiptPreview } from './ThermalReceiptPreview';
import { IPC_CHANNELS } from '../../../../../core/ipc/channels';
import { generateClientTestReceiptHTML, printHtmlViaIframe } from '../../utils/clientReceiptPrint';

export const HardwareStatusPreview: React.FC = () => {
  const { draftConfig } = useSettingsDraftStore();
  const hw = draftConfig.hardware;

  const [isPrinting, setIsPrinting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [printerStatus, setPrinterStatus] = useState<{ connected: boolean; printerName: string | null } | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  useEffect(() => {
    let mounted = true;
    const checkPrinter = async () => {
      try {
        setIsCheckingStatus(true);
        const res = await window.api.invoke(IPC_CHANNELS.SYSTEM.GET_PRINTER_STATUS);
        if (mounted && res && res.success && res.data) {
          setPrinterStatus({
            connected: res.data.connected,
            printerName: res.data.printerName,
          });
        }
      } catch (err) {
        if (mounted) {
          setPrinterStatus({ connected: false, printerName: null });
        }
      } finally {
        if (mounted) setIsCheckingStatus(false);
      }
    };
    checkPrinter();
    const interval = setInterval(checkPrinter, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleTestPrint = async () => {
    setIsPrinting(true);
    setFeedback(null);
    try {
      await window.api.invoke(IPC_CHANNELS.CONFIG.UPDATE, draftConfig);
      let printedViaIpc = false;
      try {
        const res = await window.api.invoke(IPC_CHANNELS.BILLING.PRINT_TEST_RECEIPT, {
          templateOverride: draftConfig.receiptTemplate,
        });
        if (res && res.success) {
          printedViaIpc = true;
          setFeedback({ type: 'success', text: '✓ Test receipt sent to thermal printer!' });
        }
      } catch (ipcErr) {
        console.warn('IPC print test threw, using iframe print fallback:', ipcErr);
      }

      if (!printedViaIpc) {
        const html = generateClientTestReceiptHTML(draftConfig.receiptTemplate, draftConfig.shopInfo);
        await printHtmlViaIframe(html);
        setFeedback({ type: 'success', text: '✓ Test ticket printed! Verify zero-margin alignment.' });
      }
    } catch (e: any) {
      setFeedback({ type: 'error', text: e.message || 'Error occurred while printing.' });
    } finally {
      setIsPrinting(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const isConnected = printerStatus?.connected ?? (!!hw.printerName);
  const activePrinterName = printerStatus?.printerName || hw.printerName || 'RP 3220 Star / Thermal Printer';

  return (
    <div className="w-full space-y-4">
      {/* Hardware Status Tile - Thermal Printer Only */}
      <div className="w-full bg-surface-card border border-border-subtle rounded-2xl p-5 shadow-elevation space-y-4">
        <div className="flex items-center justify-between border-b border-border-subtle pb-3">
          <div className="flex items-center gap-2">
            <Printer size={16} className="text-brand-500" />
            <h4 className="text-xs font-black uppercase tracking-wider text-text-primary">
              Hardware Bus Telemetry
            </h4>
          </div>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            LOCAL DESKTOP
          </span>
        </div>

        <div className="space-y-3">
          {/* Thermal Receipt Printer Only */}
          <div className="p-3.5 rounded-xl bg-surface-panel border border-border-subtle flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isConnected ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                <Printer size={18} />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">Thermal Receipt Printer</p>
                <p className="text-[10.5px] text-text-muted font-mono">
                  {activePrinterName}
                </p>
              </div>
            </div>
            {isCheckingStatus ? (
              <span className="text-[10px] font-mono text-text-muted flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" /> Checking...
              </span>
            ) : isConnected ? (
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-xs">
                <CheckCircle2 size={12} /> Connected
              </span>
            ) : (
              <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-xs">
                <AlertCircle size={12} /> Printer Not Connected
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Real-time Thermal Receipt Preview */}
      <div className="w-full pt-1 space-y-2.5">
        <div className="flex items-center gap-2 px-1">
          <Printer size={15} className="text-brand-500" />
          <h4 className="text-xs font-black uppercase tracking-wider text-text-primary font-outfit">
            Live Thermal Receipt Preview
          </h4>
        </div>

        {feedback && (
          <div
            className={`text-[11px] px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 border font-medium ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}
          >
            {feedback.type === 'success' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
            <span>{feedback.text}</span>
          </div>
        )}

        <ThermalReceiptPreview />
      </div>
    </div>
  );
};

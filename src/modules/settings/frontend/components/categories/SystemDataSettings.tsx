import React, { useState } from 'react';
import { Database, Download, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { SettingCard } from '../ui/SettingCard';
import { SettingRow } from '../ui/SettingRow';
import { SwitchControl } from '../ui/SwitchControl';
import { NumberStepper } from '../ui/NumberStepper';
import { useSettingsDraftStore } from '../../hooks/useSettingsDraftStore';

export const SystemDataSettings: React.FC = () => {
  const { draftConfig, updateDraftConfig } = useSettingsDraftStore();
  const backup = draftConfig.backup;

  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleRestoreDatabase = async () => {
    const confirmed = window.confirm("This will overwrite all current data. Continue?");
    if (!confirmed) return;

    setIsProcessing(true);
    setRestoreMsg(null);
    try {
      const res = await window.api.invoke('system:restore-database');
      if (res.success) {
        setRestoreMsg(`Database restored successfully. Integrity check: ${res.integrity || 'ok'}.`);
      } else if (res.reason === 'cancelled') {
        setRestoreMsg(null);
      } else {
        setRestoreMsg(`Restore failed: ${res.error?.message || 'Error'}`);
      }
    } catch (err: any) {
      setRestoreMsg(`Restore failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBackupNow = async () => {
    setIsProcessing(true);
    setBackupMsg(null);
    try {
      const res = await window.api.invoke('system:backup-database');
      if (res.success) {
        setBackupMsg(`Backup created successfully: ${res.backupPath || 'Saved'}`);
      } else {
        setBackupMsg(`Backup failed: ${res.error?.message || 'Error'}`);
      }
    } catch (err: any) {
      setBackupMsg(`Backup failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportCSV = async (type: 'invoices' | 'ledger') => {
    setIsProcessing(true);
    setExportMsg(null);
    try {
      const res = await window.api.invoke('system:export-csv', { type });
      if (res.success) {
        setExportMsg(`Export completed: ${res.filePath || 'Saved'}`);
      } else if (res.reason === 'cancelled') {
        setExportMsg(null);
      } else {
        setExportMsg(`Export failed: ${res.error?.message || 'Error'}`);
      }
    } catch (err: any) {
      setExportMsg(`Export failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Database Backup & Snapshots */}
      <SettingCard
        title="Database Snapshots & Auto-Backup"
        description="Automated and on-demand safety copies of your SQLite store data"
        icon={<Database size={16} />}
      >
        <SettingRow
          label="Auto-Backup Database on App Exit"
          description="Saves a timestamped .db snapshot in backups directory whenever POS is closed"
        >
          <SwitchControl
            checked={backup?.autoBackupOnClose ?? true}
            onChange={(checked) =>
              updateDraftConfig((prev) => ({
                ...prev,
                backup: { ...(prev.backup || {}), autoBackupOnClose: checked },
              }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Rolling Retention Limit"
          description="Number of daily backup files to preserve before pruning older files"
        >
          <NumberStepper
            value={backup?.maxBackupsToKeep ?? 7}
            min={1}
            max={30}
            step={1}
            unit="files"
            onChange={(val) =>
              updateDraftConfig((prev) => ({
                ...prev,
                backup: { ...(prev.backup || {}), maxBackupsToKeep: val },
              }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Create Instant Database Backup"
          description="Take an immediate snapshot of current transactions, inventory, and users"
        >
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleBackupNow}
            className="px-4 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Download size={13} />
            <span>{isProcessing ? 'Backing up...' : 'Backup Now'}</span>
          </button>
        </SettingRow>

        {backupMsg && (
          <div className="p-3 rounded-xl bg-surface-card border border-border-subtle text-xs font-bold text-text-primary flex items-center gap-2">
            <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
            <span>{backupMsg}</span>
          </div>
        )}

        <SettingRow
          label="Restore Database Snapshot"
          description="Overwrite current SQLite database with a previously saved backup file (.db)"
        >
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleRestoreDatabase}
            className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Database size={13} />
            <span>{isProcessing ? 'Restoring...' : 'Restore Database'}</span>
          </button>
        </SettingRow>

        {restoreMsg && (
          <div className="p-3 rounded-xl bg-surface-card border border-border-subtle text-xs font-bold text-text-primary flex items-center gap-2">
            <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
            <span>{restoreMsg}</span>
          </div>
        )}
      </SettingCard>

      {/* CSV Export & External Analytics */}
      <SettingCard
        title="CSV Data Export & Auditing"
        description="Export raw invoice records and stock passbook movements into spreadsheet format"
        icon={<FileSpreadsheet size={16} />}
      >
        <SettingRow
          label="Today's Sales & Invoices Register"
          description="Export line-by-line checkout logs with item names, rates, and tender modes"
        >
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => handleExportCSV('invoices')}
            className="px-4 py-1.5 rounded-xl border border-border-subtle bg-surface-panel hover:bg-surface-hover text-text-primary text-xs font-bold flex items-center gap-1.5 transition-all"
          >
            <Download size={13} />
            <span>Export Invoices CSV</span>
          </button>
        </SettingRow>

        <SettingRow
          label="Inventory Stock Passbook Ledger"
          description="Export chronological stock ins, cuts, sales deductions, and wastage"
        >
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => handleExportCSV('ledger')}
            className="px-4 py-1.5 rounded-xl border border-border-subtle bg-surface-panel hover:bg-surface-hover text-text-primary text-xs font-bold flex items-center gap-1.5 transition-all"
          >
            <Download size={13} />
            <span>Export Ledger CSV</span>
          </button>
        </SettingRow>

        {exportMsg && (
          <div className="p-3 rounded-xl bg-surface-card border border-border-subtle text-xs font-bold text-text-primary flex items-center gap-2">
            <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
            <span>{exportMsg}</span>
          </div>
        )}
      </SettingCard>
    </div>
  );
};

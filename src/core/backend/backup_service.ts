import { db } from './db';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { logger } from './logger';
import Database from 'better-sqlite3';
import { databaseProvider } from '../database/database_provider';

export const backupService = {
  /**
   * Safe SQLite database backup using better-sqlite3 native backup API.
   * Isolates active locks/transactions and is WAL-safe.
   * Immediately verifies integrity of written backup file.
   */
  async backupDatabase(customPath?: string): Promise<string> {
    try {
      let destDir: string;
      if (customPath) {
        destDir = customPath;
      } else {
        const userData = app?.getPath ? app.getPath('userData') : path.join(process.cwd(), 'backups');
        destDir = path.join(userData, 'backups');
      }

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const dateStr = new Date().toISOString()
        .replace(/T/, '_')
        .replace(/\..+/, '')
        .replace(/[:]/g, '-');
      const destFile = path.join(destDir, `backup-${dateStr}.db`);

      logger.info('Starting WAL-safe SQLite database backup...', { destination: destFile });
      await db.backup(destFile);

      // Verify integrity of the backup file immediately after writing
      const verifyDb = new Database(destFile, { readonly: true });
      try {
        const check = verifyDb.pragma('integrity_check') as Array<{ integrity_check: string }>;
        const status = check?.[0]?.integrity_check;
        if (status !== 'ok') {
          throw new Error(`Backup file failed integrity check: ${JSON.stringify(check)}`);
        }
        logger.info('Backup integrity check passed (ok)', { destination: destFile });
      } finally {
        verifyDb.close();
      }

      logger.info('Database backup completed successfully', { destination: destFile });
      
      // Backup bills folder
      if (app?.getPath) {
        const billsDirSource = path.join(app.getPath('userData'), 'documents', 'bills');
        if (fs.existsSync(billsDirSource)) {
          const destBillsDir = path.join(destDir, `bills-${dateStr}`);
          fs.cpSync(billsDirSource, destBillsDir, { recursive: true });
          logger.info('Bills directory backed up successfully', { destination: destBillsDir });
        }

        // Backup customer snapshots folder (for facial recognition reference photos)
        const snapshotsDirSource = path.join(app.getPath('userData'), 'documents', 'customer_snapshots');
        if (fs.existsSync(snapshotsDirSource)) {
          const destSnapshotsDir = path.join(destDir, `snapshots-${dateStr}`);
          fs.cpSync(snapshotsDirSource, destSnapshotsDir, { recursive: true });
          logger.info('Customer snapshots directory backed up successfully', { destination: destSnapshotsDir });
        }
      }

      // Post-backup cleanup (retain only last 7 backups)
      backupService.cleanupOldBackups(destDir, 7);

      return destFile;
    } catch (err) {
      logger.error('Failed to backup database', err);
      throw err;
    }
  },

  /**
   * Restores database from a given backup file.
   * 1. Validates backup file existence & runs PRAGMA integrity_check.
   * 2. Safely closes live DB connection.
   * 3. Cleans up live WAL/SHM files and copies backup over live DB.
   * 4. Reopens DB connection and runs PRAGMA integrity_check on live connection.
   */
  async restoreDatabase(backupFilePath: string): Promise<{ success: boolean; liveDbPath: string; integrity: string }> {
    try {
      if (!fs.existsSync(backupFilePath)) {
        throw new Error(`Backup file not found at: ${backupFilePath}`);
      }

      logger.info('Validating backup file integrity before restore...', { backupFilePath });
      const verifyDb = new Database(backupFilePath, { readonly: true });
      try {
        const check = verifyDb.pragma('integrity_check') as Array<{ integrity_check: string }>;
        const status = check?.[0]?.integrity_check;
        if (status !== 'ok') {
          throw new Error(`Cannot restore: Backup file integrity check failed: ${JSON.stringify(check)}`);
        }
        logger.info('Backup file integrity check passed (ok)');
      } finally {
        verifyDb.close();
      }

      const liveDbPath = databaseProvider.getDbPath();
      logger.info('Closing active database connection for restore...', { liveDbPath });
      databaseProvider.close();

      // Clean up WAL and SHM files if they exist to prevent WAL replay corruption
      const walPath = `${liveDbPath}-wal`;
      const shmPath = `${liveDbPath}-shm`;
      if (fs.existsSync(walPath)) {
        try {
          fs.unlinkSync(walPath);
        } catch (e) {
          try {
            fs.writeFileSync(walPath, Buffer.alloc(0));
          } catch (truncateErr) {
            logger.warn('Failed to delete/truncate WAL file during restore', { error: String(e) });
          }
        }
      }
      if (fs.existsSync(shmPath)) {
        try {
          fs.unlinkSync(shmPath);
        } catch (e) {
          try {
            fs.writeFileSync(shmPath, Buffer.alloc(0));
          } catch (truncateErr) {
            logger.warn('Failed to delete/truncate SHM file during restore', { error: String(e) });
          }
        }
      }

      // Copy backup over live DB file
      logger.info('Copying backup file over live database...', { from: backupFilePath, to: liveDbPath });
      fs.copyFileSync(backupFilePath, liveDbPath);

      // Reopen connection
      logger.info('Reopening database connection...');
      const reconnectedDb = databaseProvider.reopen();

      // Verify restored live database integrity
      const liveCheck = reconnectedDb.pragma('integrity_check') as Array<{ integrity_check: string }>;
      const liveStatus = liveCheck?.[0]?.integrity_check || 'unknown';
      if (liveStatus !== 'ok') {
        throw new Error(`Restored live database failed integrity check: ${JSON.stringify(liveCheck)}`);
      }

      logger.info('Database restored successfully and live integrity verified (ok)', { liveDbPath, integrity: liveStatus });
      return { success: true, liveDbPath, integrity: liveStatus };
    } catch (err) {
      logger.error('Failed to restore database', err);
      // Attempt reconnection if closed
      try { databaseProvider.getRawConnection(); } catch {}
      throw err;
    }
  },

  /**
   * Retains only the most recent database backups (defaults to 7)
   */
  cleanupOldBackups(destDir: string, keepCount = 7): void {
    try {
      if (!fs.existsSync(destDir)) return;

      const files = fs.readdirSync(destDir)
        .filter(f => f.startsWith('backup-') && f.endsWith('.db'))
        .map(f => {
          const filePath = path.join(destDir, f);
          const stat = fs.statSync(filePath);
          return { filePath, mtime: stat.mtimeMs };
        });

      if (files.length <= keepCount) return;

      // Sort oldest first (ascending time)
      files.sort((a, b) => a.mtime - b.mtime);

      const filesToDelete = files.slice(0, files.length - keepCount);
      for (const file of filesToDelete) {
        fs.unlinkSync(file.filePath);
        logger.info('Deleted old database backup file', { path: file.filePath });
      }

      // Cleanup bills directories
      const dirs = fs.readdirSync(destDir)
        .filter(f => f.startsWith('bills-') && fs.statSync(path.join(destDir, f)).isDirectory())
        .map(f => {
          const dirPath = path.join(destDir, f);
          const stat = fs.statSync(dirPath);
          return { dirPath, mtime: stat.mtimeMs };
        });

      if (dirs.length > keepCount) {
        dirs.sort((a, b) => a.mtime - b.mtime);
        const dirsToDelete = dirs.slice(0, dirs.length - keepCount);
        for (const d of dirsToDelete) {
          fs.rmSync(d.dirPath, { recursive: true, force: true });
          logger.info('Deleted old bills backup directory', { path: d.dirPath });
        }
      }
    } catch (err) {
      logger.error('Failed to clean up old database backups', err);
    }
  },

  /**
   * Safely formats and exports table contents into RFC 4180 standard CSV file.
   */
  exportToCSV(type: 'invoices' | 'ledger', targetFilePath: string): void {
    try {
      let csvContent = '';
      if (type === 'invoices') {
        csvContent = 'Invoice Number,Date,Subtotal (INR),Tax (INR),Discount (INR),Total Amount (INR),Payment Status,Payment Method\n';
        
        // Retrieve today's completed invoices
        const rows = db.prepare(`
          SELECT i.*, GROUP_CONCAT(p.method, '+') as payment_methods
          FROM invoices i
          LEFT JOIN payments p ON p.invoice_id = i.id
          WHERE i.status = 'completed' AND DATE(i.completed_at) = DATE('now')
          GROUP BY i.id
          ORDER BY i.completed_at DESC
        `).all() as any[];

        for (const row of rows) {
          const number = row.invoice_number || '';
          const date = row.completed_at || '';
          const subtotal = (row.subtotal_paise / 100).toFixed(2);
          const tax = (row.tax_paise / 100).toFixed(2);
          const discount = (row.discount_paise / 100).toFixed(2);
          const total = (row.total_paise / 100).toFixed(2);
          const paymentStatus = row.payment_status || '';
          const paymentMethod = row.payment_methods || 'N/A';
          
          const safeNumber = `"${number.replace(/"/g, '""')}"`;
          const safeMethod = `"${paymentMethod.replace(/"/g, '""')}"`;
          csvContent += `${safeNumber},${date},${subtotal},${tax},${discount},${total},${paymentStatus},${safeMethod}\n`;
        }
      } else if (type === 'ledger') {
        csvContent = 'Category,Product Name,Variant Name,Unit Type,Current Stock,Safety Threshold\n';

        const rows = db.prepare(`
          SELECT 
            p.category, 
            p.name as product_name, 
            pv.variant_name, 
            p.unit_type,
            sl.quantity_grams as current_stock,
            sl.safety_threshold_grams as safety_threshold
          FROM stock_ledger sl
          JOIN product_variants pv ON sl.product_variant_id = pv.id
          JOIN products p ON pv.product_id = p.id
          ORDER BY p.category, p.name, pv.variant_name
        `).all() as any[];

        for (const row of rows) {
          const category = row.category || '';
          const prodName = row.product_name || '';
          const varName = row.variant_name || '';
          const unitType = row.unit_type === 'weight' ? 'kg' : 'pcs';
          
          let stock = '0';
          let threshold = '0';
          if (row.unit_type === 'weight') {
            stock = (row.current_stock / 1000).toFixed(3);
            threshold = (row.safety_threshold / 1000).toFixed(3);
          } else {
            stock = String(row.current_stock || 0);
            threshold = String(row.safety_threshold || 0);
          }

          const safeCat = `"${category.replace(/"/g, '""')}"`;
          const safeProd = `"${prodName.replace(/"/g, '""')}"`;
          const safeVar = `"${varName.replace(/"/g, '""')}"`;
          csvContent += `${safeCat},${safeProd},${safeVar},${unitType},${stock},${threshold}\n`;
        }
      }

      fs.writeFileSync(targetFilePath, csvContent, 'utf-8');
      logger.info('CSV export completed successfully', { type, path: targetFilePath });
    } catch (err) {
      logger.error('Failed to export to CSV', err);
      throw err;
    }
  }
};

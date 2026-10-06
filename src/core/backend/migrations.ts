import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { db } from './db';
import { logger } from './logger';
import { DatabaseError } from './errors';
import { configService } from '../config/config_service';

export interface SchemaManifestItem {
  table: string;
  columns: string[];
}

export const CRITICAL_SCHEMA_MANIFEST: SchemaManifestItem[] = [
  { table: 'users', columns: ['id', 'username', 'role', 'emp_code', 'pin_code'] },
  { table: 'products', columns: ['id', 'name', 'category', 'stock_classification'] },
  { table: 'product_variants', columns: ['id', 'product_id', 'variant_name', 'current_rate_paise_per_unit'] },
  { table: 'product_stock_batches', columns: ['id', 'batch_number', 'product_variant_id', 'location_id', 'status'] },
  { table: 'stock_ledger', columns: ['id', 'product_variant_id', 'location_id', 'quantity_grams', 'quantity_units'] },
  { table: 'stock_transfers', columns: ['id', 'transfer_number', 'from_location_id', 'to_location_id', 'status'] },
  { table: 'locations', columns: ['id', 'code', 'name', 'is_active'] },
  { table: 'branches', columns: ['id', 'code', 'name', 'is_active'] },
  { table: 'invoices', columns: ['id', 'invoice_number', 'total_paise', 'payment_status', 'invoice_date'] },
  { table: 'pos_sessions', columns: ['id', 'cashier_id', 'opening_cash_paise', 'status'] },
  { table: 'store_cash_box', columns: ['id', 'session_id', 'type', 'direction', 'amount_paise'] },
  { table: 'shift_cash_movements', columns: ['id', 'session_id', 'movement_type', 'amount_paise', 'reason'] },
  { table: 'shift_closing_records', columns: ['id', 'session_id', 'expected_cash_paise', 'physical_cash_paise', 'difference_paise', 'status'] },
  { table: 'shift_corrections', columns: ['id', 'session_id', 'entity_type', 'entity_id', 'reason', 'authorized_by'] },
  { table: 'employees', columns: ['id', 'emp_code', 'full_name', 'salary_type', 'is_active'] },
  { table: 'employee_attendance', columns: ['id', 'employee_id', 'date', 'status'] },
  { table: 'expenses', columns: ['id', 'amount_paise', 'payment_method', 'status'] },
  { table: 'live_chicken_batches', columns: ['id', 'batch_number', 'remaining_weight_grams', 'remaining_count', 'status'] },
  { table: 'processing_events', columns: ['id', 'event_number', 'batch_id', 'live_weight_grams', 'processed_weight_grams', 'yield_ratio_used'] },
  { table: 'refrigerator_stock', columns: ['id', 'item_name', 'item_type', 'quantity_grams', 'count', 'status'] },
];

/**
 * Splits an SQL script into executable statements, safely handling:
 * - Line comments (-- ...) without splitting on semicolons inside comments
 * - Block comments (/* ... *\/)
 * - Single and double quoted strings ('...' and "...")
 * - Triggers with BEGIN ... END blocks
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let inTrigger = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = sql[i + 1];

    if (inLineComment) {
      if (char === '\n' || char === '\r') {
        inLineComment = false;
        current += '\n';
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        i++; // skip /
        current += ' ';
      }
      continue;
    }

    if (inSingleQuote) {
      current += char;
      if (char === "'") {
        if (nextChar === "'") {
          current += nextChar;
          i++; // skip escaped quote
        } else {
          inSingleQuote = false;
        }
      }
      continue;
    }

    if (inDoubleQuote) {
      current += char;
      if (char === '"') {
        if (nextChar === '"') {
          current += nextChar;
          i++; // skip escaped quote
        } else {
          inDoubleQuote = false;
        }
      }
      continue;
    }

    // Check for comment starts
    if (char === '-' && nextChar === '-') {
      inLineComment = true;
      i++; // skip next -
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      i++; // skip next *
      continue;
    }

    // Check for quote starts
    if (char === "'") {
      inSingleQuote = true;
      current += char;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      current += char;
      continue;
    }

    // Check if statement is CREATE [TEMP/TEMPORARY] TRIGGER
    if (!inTrigger) {
      if (/\bCREATE\s+(?:TEMPORARY\s+|TEMP\s+)?TRIGGER\b/i.test(current)) {
        inTrigger = true;
      }
    }

    // If inside trigger, semicolon only ends the statement if preceded by END
    if (inTrigger) {
      if (char === ';') {
        const trimmed = current.trim();
        if (/\bEND$/i.test(trimmed)) {
          inTrigger = false;
          const stmt = (current + ';').trim();
          if (stmt.length > 0) {
            statements.push(stmt);
          }
          current = '';
          continue;
        }
      }
      current += char;
      continue;
    }

    if (char === ';') {
      const stmt = current.trim();
      if (stmt.length > 0) {
        statements.push(stmt);
      }
      current = '';
      continue;
    }

    current += char;
  }

  const remaining = current.trim();
  if (remaining.length > 0) {
    statements.push(remaining);
  }

  return statements;
}

export class MigrationEngine {
  private migrationsPath: string;

  constructor() {
    const isDev = process.env.NODE_ENV === 'development' || !app?.isPackaged;
    
    if (isDev) {
      this.migrationsPath = path.join(process.cwd(), 'src/core/database/migrations');
    } else {
      // In production, electron-builder copies extraResources to the 'resources' folder next to the app
      this.migrationsPath = path.join(process.resourcesPath, 'migrations');
    }

    logger.info('Migration engine initialized', { path: this.migrationsPath });
  }

  /**
   * Automatically backup database file prior to running any pending migrations.
   */
  private createPreMigrationBackup(): void {
    try {
      const config = configService.get();
      const dbPath = config.dbPath || path.join(process.cwd(), 'dev.db');
      
      if (!fs.existsSync(dbPath)) {
        logger.info('No existing database file found to backup before migration.');
        return;
      }

      const backupDir = path.join(path.dirname(dbPath), 'db_backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `db_pre_migration_backup_${timestamp}.db`);

      fs.copyFileSync(dbPath, backupPath);
      logger.info('Pre-migration database backup created successfully', { backupPath });
    } catch (err: any) {
      logger.warn('Failed to create pre-migration database backup (continuing with migration)', { error: err?.message });
    }
  }

  /**
   * Safely execute an SQL script statement-by-statement, tolerating idempotent errors like "duplicate column name".
   */
  private executeIdempotentSql(sql: string): void {
    const statements = splitSqlStatements(sql);

    for (const stmt of statements) {
      try {
        db.exec(stmt);
      } catch (stmtErr: any) {
        const stmtMsg = (stmtErr?.message || '').toLowerCase();
        if (
          stmtMsg.includes('duplicate column name') || 
          stmtMsg.includes('already exists') ||
          stmtMsg.includes('column location_id already exists')
        ) {
          logger.debug(`Ignoring safe idempotent statement notice: ${stmtErr.message}`);
          continue;
        }
        throw stmtErr;
      }
    }
  }

  /**
   * Verify all critical tables and columns exist on the database.
   */
  public verifySchemaIntegrity(): { isValid: boolean; missing: string[] } {
    logger.info('Running startup database schema integrity verification...');
    const missing: string[] = [];

    for (const item of CRITICAL_SCHEMA_MANIFEST) {
      try {
        const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(item.table);
        if (!tableCheck) {
          missing.push(`Table [${item.table}] is missing`);
          continue;
        }

        const columns = (db.prepare(`PRAGMA table_info(${item.table})`).all() as Array<{ name: string }>).map(c => c.name);
        for (const col of item.columns) {
          if (!columns.includes(col)) {
            missing.push(`Column [${item.table}.${col}] is missing`);
          }
        }
      } catch (err: any) {
        missing.push(`Error checking table [${item.table}]: ${err?.message}`);
      }
    }

    if (missing.length > 0) {
      logger.error('Startup schema integrity verification FAILED', { missing });
      return { isValid: false, missing };
    }

    logger.info('Startup schema integrity verification passed: All critical tables and columns verified.');
    return { isValid: true, missing: [] };
  }

  public run(): void {
    logger.info('Starting database migration checks...');
    
    // 1. Ensure migrations table exists
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } catch (err) {
      logger.error('Failed to ensure migrations metadata table exists', err);
      throw new DatabaseError('Database initialization failed during metadata checks', err);
    }

    // 2. Read migration directory
    if (!fs.existsSync(this.migrationsPath)) {
      logger.warn('Migration directory does not exist, creating it...', { path: this.migrationsPath });
      fs.mkdirSync(this.migrationsPath, { recursive: true });
      return;
    }

    const files = fs.readdirSync(this.migrationsPath)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort alphanumerically to ensure strict ordering (001, 002...)

    logger.info(`Found ${files.length} migration files locally.`);

    // 3. Query applied migrations and map legacy filename aliases
    const appliedMigrationsSet = new Set<string>();
    const LEGACY_MIGRATION_ALIASES: Record<string, string> = {
      '011_supplier_procurement_system.sql': '012_supplier_procurement_system.sql',
      '012_enterprise_erp_expansion.sql': '013_enterprise_erp_expansion.sql',
      '012_oversold_tracking.sql': '014_oversold_tracking.sql',
    };

    try {
      const rows = db.prepare('SELECT name FROM migrations').all() as { name: string }[];
      rows.forEach(row => {
        appliedMigrationsSet.add(row.name);
        if (LEGACY_MIGRATION_ALIASES[row.name]) {
          appliedMigrationsSet.add(LEGACY_MIGRATION_ALIASES[row.name]);
        }
      });
    } catch (err) {
      logger.error('Failed to fetch applied migrations from DB', err);
      throw new DatabaseError('Failed to fetch applied migrations', err);
    }

    // Check if there are any pending migrations to apply
    const pendingFiles = files.filter(f => !appliedMigrationsSet.has(f));

    if (pendingFiles.length > 0) {
      logger.info(`Found ${pendingFiles.length} pending migrations to apply. Creating safety backup first.`);
      this.createPreMigrationBackup();
    }

    // 4. Run pending migrations in a single transaction sequence or file-by-file transactions
    for (const file of pendingFiles) {
      logger.info(`Applying database migration: ${file}`);
      const filePath = path.join(this.migrationsPath, file);
      const sqlContent = fs.readFileSync(filePath, 'utf-8');

      // Execute migration
      try {
        if (sqlContent.includes('-- @no-transaction')) {
          logger.info(`Migration ${file} specifies @no-transaction. Running outside transaction wrapper.`);
          const fkState = db.pragma('foreign_keys', { simple: true });
          db.pragma('foreign_keys = OFF');
          this.executeIdempotentSql(sqlContent);
          db.prepare('INSERT OR IGNORE INTO migrations (name) VALUES (?)').run(file);
          if (fkState) db.pragma('foreign_keys = ON');
        } else {
          db.transaction(() => {
            // Execute statements in the file
            this.executeIdempotentSql(sqlContent);
            
            // Log migration completion
            db.prepare('INSERT OR IGNORE INTO migrations (name) VALUES (?)').run(file);
          })();
        }
        logger.info(`Migration ${file} applied successfully.`);
      } catch (err: any) {
        logger.error(`Migration ${file} FAILED. Rolling back/aborting: ${err?.message}`, err);
        throw new DatabaseError(`Migration failed: ${file} — ${err?.message}`, err);
      }
    }

    // 5. Post-migration schema integrity verification
    const integrity = this.verifySchemaIntegrity();
    if (!integrity.isValid) {
      throw new DatabaseError(`Database schema integrity failure after migration:\n${integrity.missing.join('\n')}`);
    }

    logger.info('Database migrations and schema integrity checks completed successfully.');
  }

  public getMigrationStatus() {
    try {
      const rows = db.prepare('SELECT * FROM migrations ORDER BY applied_at DESC').all();
      return rows;
    } catch (err) {
      logger.error('Failed to get migration status', err);
      throw new DatabaseError('Failed to get migration status', err);
    }
  }
}

export const migrationEngine = new MigrationEngine();


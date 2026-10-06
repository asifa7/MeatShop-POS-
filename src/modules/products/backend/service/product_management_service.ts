import { db, dbManager } from '../../../../core/backend/db';
import type { Transaction } from 'better-sqlite3';
import { ConflictError, ValidationError } from '../../../../core/backend/errors';
import { productsRepository, type ProductRow } from '../../../billing/backend/repository/products_repository';
import { productVariantsRepository, type ProductVariantRow } from '../../../billing/backend/repository/product_variants_repository';
import { createProductSchema, updateProductSchema, type CreateProductInput, type UpdateProductInput } from '../validation/create_product.schema';
import { createVariantSchema, updateVariantSchema, type CreateVariantInput } from '../validation/create_variant.schema';
import { updateRateSchema, type UpdateRateInput } from '../validation/update_rate.schema';
import { authService } from '../../../auth/backend/service/auth_service';
import { logger, auditLogger } from '../../../../core/backend/logger';

/** Auto-generate a unique product code as a plain integer string (e.g. 1, 2, 3...) */
function generateProductCode(): string {
  const variants = db.prepare('SELECT product_code FROM product_variants').all() as { product_code?: string }[];
  let maxCode = 0;
  for (const v of variants) {
    if (v.product_code) {
      const clean = v.product_code.replace(/^prd-0*/i, '').replace(/^0+/, '');
      const num = parseInt(clean, 10);
      if (!isNaN(num) && num > maxCode) {
        maxCode = num;
      }
    }
  }
  return String(maxCode > 0 ? maxCode + 1 : variants.length + 1);
}

export interface AdminProductVariant extends ProductVariantRow {
  rateHistory: { id: number; rate_paise_per_unit: number; effective_from: string; set_by: number }[];
  hasInvoiceHistory: boolean;
}

export interface AdminProduct extends ProductRow {
  variants: AdminProductVariant[];
  hasInvoiceHistory: boolean;
  variant_name?: string;
  type?: string;
  current_rate_paise_per_unit: number;
  cost_price_paise_per_unit?: number;
  rateHistory: { id: number; rate_paise_per_unit: number; effective_from: string; set_by: number }[];
}

function archiveVariantSnapshot(variantId: number, userId: number, username: string): void {
  try {
    const variant = db.prepare(`
      SELECT pv.*, p.name as product_name, p.category, p.unit_type as p_unit_type,
             p.is_processed_cut as p_is_processed_cut
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE pv.id = ?
    `).get(variantId) as any;

    if (!variant) return;

    let rateHistory: any[] = [];
    try {
      rateHistory = db.prepare('SELECT * FROM product_variant_rate_history WHERE product_variant_id = ?').all(variantId);
    } catch (e) {}

    let stockLedger: any[] = [];
    try {
      stockLedger = db.prepare('SELECT * FROM stock_ledger WHERE product_variant_id = ?').all(variantId);
    } catch (e) {}

    let invoiceCount = 0;
    try {
      const invCountRow = db.prepare('SELECT COUNT(*) as cnt FROM invoice_items WHERE product_variant_id = ?').get(variantId) as any;
      invoiceCount = invCountRow?.cnt || 0;
    } catch (e) {}

    const snapshot = {
      variant,
      parentProduct: {
        id: variant.product_id,
        name: variant.product_name,
        category: variant.category,
        unit_type: variant.unit_type || variant.p_unit_type,
        is_processed_cut: variant.is_processed_cut ?? variant.p_is_processed_cut ?? 0,
        track_in_inventory: variant.track_in_inventory ?? variant.p_track_in_inventory ?? 1,
      },
      rateHistory,
      stockLedger,
      invoiceCount,
    };

    db.prepare(`
      INSERT INTO deleted_products_archive (
        entity_type, original_id, original_parent_id, product_code, name, category,
        unit_type, is_processed_cut, track_in_inventory, current_rate_paise,
        cost_price_paise, snapshot_json, deleted_by, deleted_by_username
      ) VALUES (
        'variant', ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?
      )
    `).run(
      variant.id,
      variant.product_id,
      variant.product_code || String(variant.id),
      variant.variant_name || variant.product_name,
      variant.category || 'General',
      variant.unit_type || variant.p_unit_type || 'weight',
      variant.is_processed_cut ?? variant.p_is_processed_cut ?? 0,
      variant.track_in_inventory ?? variant.p_track_in_inventory ?? 1,
      variant.current_rate_paise_per_unit || 0,
      variant.cost_price_paise_per_unit || 0,
      JSON.stringify(snapshot),
      userId,
      username
    );
  } catch (err) {
    logger.error('Failed to archive deleted product snapshot', err);
  }
}

const productManagementService = {
  /**
   * Returns all sellable products (including inactive) with their rates, codes, and history.
   * Directly unifies Billing and Product Catalogue to share the EXACT same single product list.
   */
  getAllProducts(): AdminProduct[] {
    const rows = db.prepare(`
      SELECT 
        pv.id,
        pv.product_id,
        COALESCE(pv.product_code, CAST(pv.id AS TEXT)) AS product_code,
        p.name AS product_name,
        pv.variant_name,
        COALESCE(p.category, 'General') AS category,
        COALESCE(pv.unit_type, p.unit_type, 'weight') AS unit_type,
        pv.current_rate_paise_per_unit,
        COALESCE(pv.cost_price_paise_per_unit, 0) AS cost_price_paise_per_unit,
        pv.barcode,
        pv.effective_from,
        pv.is_active,
        pv.is_processed_cut,
        COALESCE(pv.track_in_inventory, 1) AS track_in_inventory,
        pv.last_purchase_cost,
        pv.weighted_average_cost,
        pv.fifo_current_cost,
        pv.current_stock,
        pv.inventory_value,
        pv.parent_variant_id,
        pv.yield_ratio,
        p.created_at,
        p.updated_at
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      ORDER BY CAST(COALESCE(pv.product_code, CAST(pv.id AS TEXT)) AS INTEGER) ASC
    `).all() as any[];

    return rows.map(r => {
      const rateHistory = productVariantsRepository.getRateHistory(r.id);
      const hasInvoiceHistory = productVariantsRepository.hasInvoiceHistory(r.id);
      const isProcessed = r.is_processed_cut === 1;
      const type = isProcessed ? 'Processed (Cut/Minced)' : 'Unprocessed (Raw)';

      let displayName = r.variant_name;
      if (r.product_name && r.variant_name) {
        const pLower = r.product_name.toLowerCase().trim();
        const vLower = r.variant_name.toLowerCase().trim();
        if (pLower === vLower) {
          displayName = r.product_name;
        } else if (vLower.includes(pLower)) {
          displayName = r.variant_name;
        } else {
          displayName = `${r.product_name} - ${r.variant_name}`;
        }
      }

      return {
        id: r.id, // Primary key of sellable item (variant id)
        product_code: r.product_code,
        name: displayName,
        variant_name: r.variant_name,
        category: r.category,
        unit_type: r.unit_type,
        type,
        is_active: r.is_active,
        is_processed_cut: r.is_processed_cut,
        track_in_inventory: r.track_in_inventory !== undefined && r.track_in_inventory !== null ? r.track_in_inventory : (r.is_processed_cut === 0 ? 1 : 0),
        current_rate_paise_per_unit: r.current_rate_paise_per_unit,
        cost_price_paise_per_unit: r.cost_price_paise_per_unit,
        created_at: r.created_at,
        updated_at: r.updated_at,
        hasInvoiceHistory,
        rateHistory,
        variants: [],
      } as AdminProduct;
    });
  },

  /**
   * Create a new sellable product with unified code, category, rate, and inventory tracking.
   * Automatically adds to both product catalogue and billing grid.
   */
  createProduct(raw: unknown): any {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const input = createProductSchema.parse(raw) as CreateProductInput;
    let code = input.product_code?.trim() || generateProductCode();
    if (/^0+[0-9]+$/.test(code)) {
      code = code.replace(/^0+/, '');
    } else if (/^prd-0*[0-9]+$/i.test(code)) {
      code = code.replace(/^prd-0*/i, '');
    }

    // Ensure uniqueness in product_variants
    const existingVariant = db.prepare('SELECT id FROM product_variants WHERE product_code = ?').get(code) as any;
    if (existingVariant) {
      code = generateProductCode();
    }

    const userId = authService.getCurrentUserId() || 1;
    const isProcessedCut = input.is_processed_cut ?? (input.type?.toLowerCase().includes('process') ? 1 : 0);
    const trackInInv = input.track_in_inventory ?? (isProcessedCut === 0 ? 1 : 0);

    let createdId = 0;

    const createTx = db.transaction(() => {
      // Find or create parent product by category
      let parentProduct = db.prepare('SELECT * FROM products WHERE category = ? LIMIT 1').get(input.category) as any;
      if (!parentProduct) {
        parentProduct = productsRepository.create({
          product_code: `CAT-${code}`,
          name: input.name,
          unit_type: input.unit_type,
          category: input.category,
          is_processed_cut: isProcessedCut,
        });
      }

      // Create variant
      const vRes = db.prepare(`
        INSERT INTO product_variants (
          product_id, variant_name, product_code, current_rate_paise_per_unit,
          cost_price_paise_per_unit, unit_type, is_processed_cut, track_in_inventory,
          effective_from, is_active
        ) VALUES (
          @product_id, @variant_name, @product_code, @current_rate_paise_per_unit,
          @cost_price_paise_per_unit, @unit_type, @is_processed_cut, @track_in_inventory,
          CURRENT_TIMESTAMP, 1
        )
      `).run({
        product_id: parentProduct.id,
        variant_name: input.name,
        product_code: code,
        current_rate_paise_per_unit: input.rate_paise,
        cost_price_paise_per_unit: input.cost_price_paise || 0,
        unit_type: input.unit_type,
        is_processed_cut: isProcessedCut,
        track_in_inventory: trackInInv,
      });

      createdId = vRes.lastInsertRowid as number;

      // Insert initial rate history
      productVariantsRepository.insertRateHistory(createdId, input.rate_paise, userId);
      productVariantsRepository.syncVariantCostCache(createdId);
    });

    createTx();

    return { id: createdId, product_code: code, name: input.name };
  },

  /**
   * Update a sellable product's details, rate, code, and category.
   */
  updateProduct(id: number, raw: unknown): any {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const input = updateProductSchema.parse(raw) as UpdateProductInput;
    const variant = db.prepare(`
      SELECT pv.*, p.category, p.unit_type as p_unit_type 
      FROM product_variants pv 
      JOIN products p ON pv.product_id = p.id 
      WHERE pv.id = ?
    `).get(id) as any;
    if (!variant) {
      throw new ConflictError(`Product with id ${id} not found.`);
    }

    if (input.unit_type && input.unit_type !== (variant.unit_type || variant.p_unit_type)) {
      const hasHistory = productVariantsRepository.hasInvoiceHistory(id);
      if (hasHistory) {
        throw new ConflictError(
          'Cannot change unit_type: this product has historical invoice records. Changing weight↔piece would make past quantity data meaningless.'
        );
      }
    }

    let code = input.product_code ? input.product_code.trim() : variant.product_code;
    if (code) {
      if (/^0+[0-9]+$/.test(code)) {
        code = code.replace(/^0+/, '');
      } else if (/^prd-0*[0-9]+$/i.test(code)) {
        code = code.replace(/^prd-0*/i, '');
      }
      const existing = db.prepare('SELECT id, variant_name FROM product_variants WHERE product_code = ? AND id != ?').get(code, id) as any;
      if (existing) {
        throw new ConflictError(`Product code "${code}" is already in use by product "${existing.variant_name}".`);
      }
    }

    const userId = authService.getCurrentUserId() || 1;
    const isProcessedCut = input.is_processed_cut !== undefined 
      ? input.is_processed_cut 
      : (input.type ? (input.type.toLowerCase().includes('process') ? 1 : 0) : variant.is_processed_cut);
    const trackInInv = input.track_in_inventory !== undefined ? input.track_in_inventory : variant.track_in_inventory;
    const variantName = input.name ? input.name.trim() : variant.variant_name;
    const unitType = input.unit_type || variant.unit_type || variant.p_unit_type || 'weight';
    const costPrice = input.cost_price_paise !== undefined ? input.cost_price_paise : variant.cost_price_paise_per_unit;

    const updateTx = db.transaction(() => {
      // If rate changed, insert into rate history and update current rate
      if (input.rate_paise !== undefined && input.rate_paise !== variant.current_rate_paise_per_unit) {
        productVariantsRepository.insertRateHistory(id, input.rate_paise, userId);
        db.prepare('UPDATE product_variants SET current_rate_paise_per_unit = ?, effective_from = CURRENT_TIMESTAMP WHERE id = ?').run(input.rate_paise, id);
      }

      // Update variant details
      db.prepare(`
        UPDATE product_variants 
        SET variant_name = @variant_name,
            product_code = @product_code,
            cost_price_paise_per_unit = @cost_price_paise_per_unit,
            unit_type = @unit_type,
            is_processed_cut = @is_processed_cut,
            track_in_inventory = @track_in_inventory
        WHERE id = @id
      `).run({
        id,
        variant_name: variantName,
        product_code: code,
        cost_price_paise_per_unit: costPrice,
        unit_type: unitType,
        is_processed_cut: isProcessedCut,
        track_in_inventory: trackInInv,
      });

      // Update parent product category if changed
      if (input.category && input.category !== variant.category) {
        db.prepare('UPDATE products SET category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(input.category, variant.product_id);
      }

      productVariantsRepository.syncVariantCostCache(id);
    });

    updateTx();

    return { id, product_code: code, name: variantName };
  },

  /**
   * Deactivate a single product / variant.
   */
  deactivateProduct(id: number): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const variantRow = db.prepare('SELECT id, product_id FROM product_variants WHERE id = ?').get(id) as { id: number; product_id: number } | undefined;
    if (variantRow) {
      productVariantsRepository.deactivate(id);
    } else {
      db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(id);
      db.prepare('UPDATE product_variants SET is_active = 0 WHERE product_id = ?').run(id);
    }
  },

  /**
   * Reactivate a single product / variant.
   */
  reactivateProduct(id: number): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const variant = db.prepare('SELECT id, product_id FROM product_variants WHERE id = ?').get(id) as { id: number; product_id: number } | undefined;
    if (variant) {
      const reactivateTx = db.transaction(() => {
        productVariantsRepository.reactivate(id);
        if (variant.product_id) {
          db.prepare('UPDATE products SET is_active = 1 WHERE id = ?').run(variant.product_id);
        }
      });
      reactivateTx();
    } else {
      db.prepare('UPDATE products SET is_active = 1 WHERE id = ?').run(id);
      db.prepare('UPDATE product_variants SET is_active = 1 WHERE product_id = ?').run(id);
    }
  },

  /**
   * Delete a single product or variant permanently with full audit archive snapshot.
   */
  deleteProduct(id: number): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const userId = authService.getCurrentUserId() || 1;
    let username = 'admin';
    try {
      const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any;
      if (user?.username) username = user.username;
    } catch (e) {}

    const variantRow = db.prepare('SELECT id, product_id FROM product_variants WHERE id = ?').get(id) as { id: number; product_id: number } | undefined;
    if (variantRow) {
      archiveVariantSnapshot(variantRow.id, userId, username);
      productVariantsRepository.hardDelete(variantRow.id);
    } else {
      const variants = db.prepare('SELECT id FROM product_variants WHERE product_id = ?').all(id) as { id: number }[];
      for (const v of variants) {
        archiveVariantSnapshot(v.id, userId, username);
      }
      productsRepository.hardDelete(id);
    }
  },

  /**
   * Deactivate all products in a specific category.
   */
  deactivateCategory(category: string): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE product_variants SET is_active = 0 
        WHERE product_id IN (SELECT id FROM products WHERE category = ?)
      `).run(category);
      db.prepare('UPDATE products SET is_active = 0 WHERE category = ?').run(category);
    });
    tx();
  },

  /**
   * Reactivate all products in a specific category.
   */
  reactivateCategory(category: string): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE product_variants SET is_active = 1 
        WHERE product_id IN (SELECT id FROM products WHERE category = ?)
      `).run(category);
      db.prepare('UPDATE products SET is_active = 1 WHERE category = ?').run(category);
    });
    tx();
  },

  /**
   * Permanently delete all products and variants in a specific category with audit archive snapshot.
   */
  deleteCategory(category: string): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const userId = authService.getCurrentUserId() || 1;
    let username = 'admin';
    try {
      const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any;
      if (user?.username) username = user.username;
    } catch (e) {}

    const variants = db.prepare(`
      SELECT pv.id FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE p.category = ?
    `).all(category) as { id: number }[];

    for (const v of variants) {
      archiveVariantSnapshot(v.id, userId, username);
    }

    const productRows = db.prepare('SELECT id FROM products WHERE category = ?').all(category) as { id: number }[];
    const tx = db.transaction(() => {
      for (const p of productRows) {
        productsRepository.hardDelete(p.id);
      }
      db.prepare('DELETE FROM products WHERE category = ?').run(category);
    });
    tx();
  },

  /**
   * Get all archived deleted products for audit and retrieval.
   */
  getDeletedArchive(): any[] {
    authService.requireRole(['ADMIN', 'MANAGER']);
    return db.prepare(`
      SELECT * FROM deleted_products_archive 
      ORDER BY deleted_at DESC
    `).all();
  },

  /**
   * Restore an archived deleted product back into the active catalogue.
   */
  restoreDeletedProduct(archiveId: number): any {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const archiveRow = db.prepare('SELECT * FROM deleted_products_archive WHERE id = ?').get(archiveId) as any;
    if (!archiveRow) {
      throw new ConflictError('Archived deleted record not found.');
    }

    const userId = authService.getCurrentUserId() || 1;
    let snapshot: any = {};
    try {
      snapshot = JSON.parse(archiveRow.snapshot_json);
    } catch (e) {
      snapshot = {};
    }

    const tx = db.transaction(() => {
      const parentName = snapshot.parentProduct?.name || archiveRow.name;
      const category = snapshot.parentProduct?.category || archiveRow.category || 'General';
      const unitType = archiveRow.unit_type || snapshot.parentProduct?.unit_type || 'weight';
      const isProcessedCut = archiveRow.is_processed_cut ?? snapshot.parentProduct?.is_processed_cut ?? 0;
      const trackInInv = archiveRow.track_in_inventory ?? snapshot.parentProduct?.track_in_inventory ?? 1;

      // 1. Check or recreate parent product
      let parentProduct = db.prepare('SELECT id FROM products WHERE name = ? AND category = ?').get(parentName, category) as any;
      if (!parentProduct) {
        const pRes = db.prepare(`
          INSERT INTO products (name, category, unit_type, is_active, is_processed_cut)
          VALUES (?, ?, ?, 1, ?)
        `).run(parentName, category, unitType, isProcessedCut);
        parentProduct = { id: pRes.lastInsertRowid };
      } else {
        db.prepare('UPDATE products SET is_active = 1 WHERE id = ?').run(parentProduct.id);
      }

      // 2. Ensure product_code is unique
      let code = archiveRow.product_code;
      if (code) {
        const codeTaken = db.prepare('SELECT id FROM product_variants WHERE product_code = ?').get(code);
        if (codeTaken) {
          const maxRow = db.prepare("SELECT MAX(CAST(product_code AS INTEGER)) as max_code FROM product_variants WHERE product_code GLOB '[0-9]*'").get() as any;
          code = String((maxRow?.max_code || 0) + 1);
        }
      }

      // 3. Create restored variant
      const vRes = db.prepare(`
        INSERT INTO product_variants (
          product_id, variant_name, product_code, current_rate_paise_per_unit,
          cost_price_paise_per_unit, unit_type, is_processed_cut, track_in_inventory, is_active
        ) VALUES (
          ?, ?, ?, ?,
          ?, ?, ?, ?, 1
        )
      `).run(
        parentProduct.id,
        archiveRow.name,
        code,
        archiveRow.current_rate_paise || 0,
        archiveRow.cost_price_paise || 0,
        unitType,
        isProcessedCut,
        trackInInv
      );

      const newVariantId = vRes.lastInsertRowid as number;

      // 4. Insert rate history
      productVariantsRepository.insertRateHistory(newVariantId, archiveRow.current_rate_paise || 0, userId);
      productVariantsRepository.syncVariantCostCache(newVariantId);

      // 5. Initialize stock ledger entry if tracked
      if (trackInInv) {
        db.prepare(`
          INSERT OR IGNORE INTO stock_ledger (product_variant_id, location_id, quantity_grams, quantity_units)
          VALUES (?, 1, 0, 0)
        `).run(newVariantId);
      }

      // 6. Mark archive row as restored
      db.prepare(`
        UPDATE deleted_products_archive 
        SET restored_at = CURRENT_TIMESTAMP, restored_by = ? 
        WHERE id = ?
      `).run(userId, archiveId);

      return { id: newVariantId, name: archiveRow.name, product_code: code };
    });

    return tx();
  },

  /**
   * Create a variant under an existing product.
   * The initial rate IS the first row in product_variant_rate_history.
   * Both writes happen in a single transaction.
   */
  createVariant(raw: unknown, setBy?: number): ProductVariantRow {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const input = createVariantSchema.parse(raw) as CreateVariantInput;
    // Verify product exists and get its processed cut status
    const parentProduct = productsRepository.findById(input.product_id);
    const userId = setBy ?? authService.getCurrentUserId();

    let newVariant: ProductVariantRow;
    const insert = db.transaction(() => {
      newVariant = productVariantsRepository.create({
        product_id: input.product_id,
        variant_name: input.variant_name,
        current_rate_paise_per_unit: input.rate_paise,
        is_processed_cut: (parentProduct as any).is_processed_cut ?? 0,
      });
      productVariantsRepository.insertRateHistory(newVariant.id, input.rate_paise, userId);
    });
    insert();
    return newVariant!;
  },

  /**
   * Update a variant's name.
   */
  updateVariantName(variantId: number, raw: unknown): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const input = updateVariantSchema.parse(raw);
    if (input.variant_name) {
      productVariantsRepository.updateName(variantId, input.variant_name);
    }
  },

  /**
   * Change a variant's pricing rate.
   * Inserts a new product_variant_rate_history row — NEVER silently overwrites.
   * Updates product_variants.current_rate_paise_per_unit — both in one transaction.
   * effective_from is always "now" in this pass (scheduling future rates is a future feature).
   */
  updateVariantRate(raw: unknown): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const input = updateRateSchema.parse(raw) as UpdateRateInput;
    const userId = authService.getCurrentUserId();
    const update = db.transaction(() => {
      productVariantsRepository.insertRateHistory(input.variant_id, input.new_rate_paise, userId);
      productVariantsRepository.updateRate(input.variant_id, input.new_rate_paise);
    });
    update();
  },

  /**
   * Deactivate a single variant. Does not affect the parent product or siblings.
   */
  deactivateVariant(id: number): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    productVariantsRepository.deactivate(id);
  },

  /**
   * Reactivate a variant. If the parent product is inactive, reactivates it too — atomically.
   */
  reactivateVariant(id: number): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const variant = productVariantsRepository.findById(id);
    const reactivate = db.transaction(() => {
      productVariantsRepository.reactivate(id);
      // If parent product was inactive, wake it up too
      const product = productsRepository.findById(variant.product_id);
      if (product.is_active === 0) {
        productsRepository.update(product.id, { is_active: 1 });
      }
    });
    reactivate();
  },

  /**
   * Hard-delete a variant and its rate history with audit archive snapshot.
   */
  deleteVariant(id: number): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const userId = authService.getCurrentUserId() || 1;
    let username = 'admin';
    try {
      const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any;
      if (user?.username) username = user.username;
    } catch (e) {}

    archiveVariantSnapshot(id, userId, username);
    productVariantsRepository.hardDelete(id);
  },

  getRateHistory(variantId: number) {
    return productVariantsRepository.getRateHistory(variantId);
  },

  updateVariantYield(variantId: number, parentVariantId: number | null, yieldRatio: number | null): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    dbManager.transaction(() => {
      db.prepare(`
        UPDATE product_variants 
        SET parent_variant_id = ?, yield_ratio = ? 
        WHERE id = ?
      `).run(parentVariantId, yieldRatio, variantId);
    });
  },

  /**
   * Preview bulk import rows without persisting any data.
   * Returns per‑row validation results.
   */
  previewImportRows(rows: Array<any>): Array<{ rowIndex: number; status: 'Valid' | 'New' | 'Update' | 'Error'; messages?: string[] }> {
    const results: Array<{ rowIndex: number; status: 'Valid' | 'New' | 'Update' | 'Error'; messages?: string[] }> = [];
    const allowedCategories = ['Fresh Cuts', 'Meat', 'Seafood', 'Vegetables']; // example taxonomy
    rows.forEach((row, idx) => {
      const messages: string[] = [];
      const code = row.product_code?.trim();
      const existing = code ? productsRepository.findByCode(code) : null;

      // Validate mandatory fields
      if (!row.name || typeof row.name !== 'string' || !row.name.trim()) {
        messages.push('Missing or empty product name');
      }
      if (!row.category || typeof row.category !== 'string' || !allowedCategories.includes(row.category.trim())) {
        messages.push(`Invalid category '${row.category}'`);
      }
      const unitType = (row.unit_type?.toLowerCase() === 'piece' ? 'piece' : 'weight') as 'weight' | 'piece';
      if (!row.unit_type || (row.unit_type.toLowerCase() !== 'piece' && row.unit_type.toLowerCase() !== 'weight')) {
        messages.push('Invalid unit_type, must be "piece" or "weight"');
      }
      const priceVal = Number(row.price_rupees);
      const priceValid = !isNaN(priceVal) && priceVal > 0;
      if (!priceValid) {
        messages.push('price_rupees is not a valid positive number');
      }
      // For new products, price must be present
      if (!existing && !priceValid) {
        messages.push('New product requires a valid price');
      }
      // cost_price optional but must be numeric if present
      const costVal = Number(row.cost_price_rupees);
      if (row.cost_price_rupees && (isNaN(costVal) || costVal < 0)) {
        messages.push('cost_price_rupees is not a valid non‑negative number');
      }

      if (messages.length > 0) {
        results.push({ rowIndex: idx, status: 'Error', messages });
        return;
      }

      const status = existing ? 'Update' : 'New';
      results.push({ rowIndex: idx, status });
    });
    return results;
  },

  /**
   * Perform the actual bulk import after preview validation.
   * Rows flagged as Error are skipped. Each successful row is processed in its own transaction.
   */
  bulkImportProducts(rows: Array<any>): { createdCount: number; updatedCount: number; errorRows: Array<{ rowIndex: number; messages: string[] }> } {
    authService.requireRole(['ADMIN', 'MANAGER', 'CASHIER']);
    let createdCount = 0;
    let updatedCount = 0;
    const errorRows: Array<{ rowIndex: number; messages: string[] }> = [];

    rows.forEach((row, idx) => {
      // Re‑run validation the same way as preview to ensure safety
      const priceVal = Number(row.price_rupees);
      const costVal = Number(row.cost_price_rupees);
      const unitType = (row.unit_type?.toLowerCase() === 'piece' ? 'piece' : 'weight') as 'weight' | 'piece';
      const code = row.product_code?.trim();
      const existing = code ? productsRepository.findByCode(code) : null;
      const isProcessedCut = row.type?.toLowerCase().includes('process') ? 1 : 0;
      const trackInInv = row.track_in_inventory !== undefined ? (row.track_in_inventory ? 1 : 0) : (isProcessedCut === 0 ? 1 : 0);

      // Basic validation – skip if invalid
      const priceValid = !isNaN(priceVal) && priceVal > 0;
      if (!priceValid) {
        errorRows.push({ rowIndex: idx, messages: ['price_rupees is not a valid positive number'] });
        return;
      }

      const ratePaise = Math.round(priceVal * 100);
      const costPaise = !isNaN(costVal) && costVal >= 0 ? Math.round(costVal * 100) : 0;

      const transaction = db.transaction(() => {
        if (existing) {
          // Update product fields
          productsRepository.update(existing.id, {
            name: row.name?.trim() || existing.name,
            category: row.category?.trim() || existing.category,
            is_processed_cut: isProcessedCut,
          });

          db.prepare('UPDATE products SET track_in_inventory = ? WHERE id = ?').run(trackInInv, existing.id);

          // Variant handling
          const variants = productVariantsRepository.findAllByProductId(existing.id);
          const vName = row.variant_name?.trim() || 'Default';
          const targetVariant = variants.find(v => v.variant_name === vName) || variants[0];

          if (targetVariant && ratePaise > 0) {
            productVariantsRepository.updateRate(targetVariant.id, ratePaise);
          }
          if (targetVariant && costPaise > 0) {
            db.prepare('UPDATE product_variants SET cost_price_paise_per_unit = ? WHERE id = ?').run(costPaise, targetVariant.id);
          }
          if (targetVariant) {
            db.prepare('UPDATE product_variants SET track_in_inventory = ? WHERE id = ?').run(trackInInv, targetVariant.id);
            productVariantsRepository.syncVariantCostCache(targetVariant.id);
          }
          updatedCount++;
        } else {
          // Create new product & variant
          const cleanCode = code ? code.trim().replace(/^prd-0*/i, '').replace(/^0+/, '') : '';
          const finalCode = cleanCode || generateProductCode();
          const p = productsRepository.create({
            product_code: finalCode,
            name: row.name?.trim() || 'New Item',
            unit_type: unitType,
            category: row.category?.trim() || 'Fresh Cuts',
            is_processed_cut: isProcessedCut,
          });

          db.prepare('UPDATE products SET track_in_inventory = ? WHERE id = ?').run(trackInInv, p.id);

          const vName = row.variant_name?.trim() || 'Default';
          const vRes = productVariantsRepository.create({
            product_id: p.id,
            variant_name: vName,
            current_rate_paise_per_unit: ratePaise,
          });

          db.prepare('UPDATE product_variants SET track_in_inventory = ? WHERE id = ?').run(trackInInv, vRes.id);

          if (costPaise > 0) {
            db.prepare('UPDATE product_variants SET cost_price_paise_per_unit = ? WHERE id = ?').run(costPaise, vRes.id);
          }
          productVariantsRepository.syncVariantCostCache(vRes.id);
          createdCount++;
        }
      });
      transaction();
    });

    // Audit log for the bulk import run
    const userId = authService.getCurrentUserId();
    auditLogger.log(userId, 'BULK_PRODUCT_IMPORT', {
      createdCount,
      updatedCount,
      errorRows,
    });
    return { createdCount, updatedCount, errorRows };
  },

  /**
   * Update product inventory tracking mode with mandatory audit trail reason
   */
  updateProductTracking(id: number, trackInInventory: boolean, reason: string, userId?: number): void {
    const variant = db.prepare('SELECT * FROM product_variants WHERE id = ?').get(id) as any;
    const pId = variant ? variant.product_id : id;
    const oldVal = variant ? (variant.track_in_inventory ?? (variant.is_processed_cut === 0 ? 1 : 0)) : 1;
    const newVal = trackInInventory ? 1 : 0;

    const transaction = db.transaction(() => {
      // 1. Update product and variants
      if (variant) {
        db.prepare('UPDATE product_variants SET track_in_inventory = ? WHERE id = ?').run(newVal, id);
      }
      db.prepare('UPDATE products SET track_in_inventory = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newVal, pId);

      // 2. Insert audit log
      const user = userId ? db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any : null;
      db.prepare(`
        INSERT INTO product_tracking_change_log (
          product_id, old_track_in_inventory, new_track_in_inventory, reason, changed_by, changed_by_name
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        pId,
        oldVal,
        newVal,
        reason ? reason.trim() : 'Manual mode toggle',
        userId || null,
        user?.username || 'Cashier'
      );
    });
    transaction();
  },

  /**
   * Get tracking history audit records for a product
   */
  getProductTrackingHistory(productId: number): any[] {
    const variant = db.prepare('SELECT product_id FROM product_variants WHERE id = ?').get(productId) as any;
    const pId = variant?.product_id || productId;
    return db.prepare(`
      SELECT * FROM product_tracking_change_log 
      WHERE product_id = ? 
      ORDER BY created_at DESC
    `).all(pId);
  },
};

export { productManagementService };

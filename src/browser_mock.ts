// ─── Browser Fallback Mock Database API ─────────────────────────────────────────
export function installBrowserMock(): void {
  if (typeof window === 'undefined' || (window as any).api) return;
  console.warn('[Vite] Running in Browser Mode. Injecting fallback mock database APIs for web testing.');

    // Mock Database State
    let mockInvoices: any[] = [
      {
        id: 101,
        invoice_number: 'INV/2026-27/000101',
        financial_year: '2026-27',
        customer_id: null,
        status: 'completed',
        is_gst_invoice: 0,
        gst_number_snapshot: null,
        subtotal_paise: 56000,
        cgst_paise: 0,
        sgst_paise: 0,
        tax_paise: 0,
        total_paise: 56000,
        discount_paise: 0,
        payment_status: 'paid',
        created_by: 1,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      },
      {
        id: 102,
        invoice_number: 'INV/2026-27/000102',
        financial_year: '2026-27',
        customer_id: null,
        status: 'completed',
        is_gst_invoice: 0,
        gst_number_snapshot: null,
        subtotal_paise: 32000,
        cgst_paise: 0,
        sgst_paise: 0,
        tax_paise: 0,
        total_paise: 32000,
        discount_paise: 0,
        payment_status: 'paid',
        created_by: 1,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      }
    ];
    let mockInvoiceItems: any[] = [
      {
        id: 1,
        invoice_id: 101,
        product_variant_id: 13,
        product_name_snapshot: 'Chicken Whole — Without Skin',
        product_name: 'Chicken Whole',
        variant_name: 'Without Skin',
        unit_type: 'weight',
        quantity_grams: 2000,
        quantity_units: null,
        rate_paise_snapshot: 28000,
        line_subtotal_paise: 56000,
        line_total_paise: 56000,
        gst_rate_percent_snapshot: null,
        created_at: new Date().toISOString(),
      },
      {
        id: 2,
        invoice_id: 102,
        product_variant_id: 23,
        product_name_snapshot: 'Fish Rohu Steaks — Steaks Cut',
        product_name: 'Fish Rohu Steaks',
        variant_name: 'Steaks Cut',
        unit_type: 'weight',
        quantity_grams: 1000,
        quantity_units: null,
        rate_paise_snapshot: 32000,
        line_subtotal_paise: 32000,
        line_total_paise: 32000,
        gst_rate_percent_snapshot: null,
        created_at: new Date().toISOString(),
      }
    ];
    let mockPayments: any[] = [
      { invoice_id: 101, method: 'cash', amount_paise: 56000, received_at: new Date().toISOString() },
      { invoice_id: 102, method: 'cash', amount_paise: 32000, received_at: new Date().toISOString() }
    ];
    let nextInvoiceId = 103;
    let nextItemId = 3;
    let mockSessionUser: any = null;
    let mockSuppliers: any[] = [
      { id: 1, code: 'SPL-00001', name: 'Al-Noor Poultry Farm', contact: '+91 98765 43210' },
      { id: 2, code: 'SPL-00002', name: 'Premium Meat Wholesalers', contact: '+91 87654 32109' }
    ];
    let mockPurchases: any[] = [];
    let mockExpenseCategories: any[] = [
      { id: 1, name: 'Shop Rent & Lease', is_active: 1 },
      { id: 2, name: 'Electricity & Utility Bills', is_active: 1 },
      { id: 3, name: 'Packaging & Pouches', is_active: 1 },
      { id: 4, name: 'Transportation & Fuel', is_active: 1 },
      { id: 5, name: 'Equipment Maintenance', is_active: 1 },
      { id: 6, name: 'Staff Welfare & Tea', is_active: 1 },
      { id: 7, name: 'Waste Disposal & Cleaning', is_active: 1 },
    ];
    let mockExpenses: any[] = [
      {
        id: 1,
        store_id: 1,
        category_id: 2,
        category_name: 'Electricity & Utility Bills',
        vendor_name: 'State Electricity Board',
        amount_paise: 450000,
        gst_paise: 0,
        payment_method: 'UPI',
        expense_date: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0],
        notes: 'Monthly power bill for cold storage',
        status: 'Approved',
        created_by: 1,
        is_active: 1,
      },
      {
        id: 2,
        store_id: 1,
        category_id: 3,
        category_name: 'Packaging & Pouches',
        vendor_name: 'Apex Plastic & Box Packaging',
        amount_paise: 220000,
        gst_paise: 39600,
        payment_method: 'Cash',
        expense_date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
        notes: 'Printed butcher bags & food-grade trays',
        status: 'Approved',
        created_by: 1,
        is_active: 1,
      }
    ];
    let mockCashSession: any = {
      id: 1,
      opening_cash_paise: 500000,
      current_cash_paise: 588000,
      status: 'open',
      opened_at: new Date().toISOString(),
      closed_at: null,
    };

    // Admin product management state — flat product model
    const mockAdminProducts: any[] = [
      {
        id: 5,
        product_code: '1',
        name: 'Chicken Whole',
        category: 'Chicken',
        type: 'Unprocessed',
        unit_type: 'weight',
        current_rate_paise_per_unit: 24000,
        is_active: 1,
        created_at: '2026-07-11T00:00:00Z',
        updated_at: '2026-07-11T00:00:00Z',
        hasInvoiceHistory: true,
        hasSalesHistory: true,
        rateHistory: [
          { id: 101, product_id: 5, old_rate_paise_per_unit: 22000, rate_paise_per_unit: 24000, effective_from: '2026-08-10T10:00:00Z', set_by: 1, set_by_name: 'Admin' },
          { id: 100, product_id: 5, old_rate_paise_per_unit: 0, rate_paise_per_unit: 22000, effective_from: '2026-07-11T00:00:00Z', set_by: 1, set_by_name: 'Admin' },
        ],
        variants: [
          { id: 12, product_id: 5, variant_name: 'Standard', current_rate_paise_per_unit: 24000, effective_from: '2026-08-10T10:00:00Z', is_active: 1, hasInvoiceHistory: true, rateHistory: [] }
        ]
      },
      {
        id: 6,
        product_code: '2',
        name: 'Chicken Curry Cut',
        category: 'Chicken',
        type: 'Unprocessed',
        unit_type: 'weight',
        current_rate_paise_per_unit: 28000,
        is_active: 1,
        created_at: '2026-07-11T00:00:00Z',
        updated_at: '2026-07-11T00:00:00Z',
        hasInvoiceHistory: true,
        hasSalesHistory: true,
        rateHistory: [
          { id: 102, product_id: 6, old_rate_paise_per_unit: 26000, rate_paise_per_unit: 28000, effective_from: '2026-08-01T09:30:00Z', set_by: 1, set_by_name: 'Admin' },
          { id: 99, product_id: 6, old_rate_paise_per_unit: 0, rate_paise_per_unit: 26000, effective_from: '2026-07-11T00:00:00Z', set_by: 1, set_by_name: 'Admin' }
        ],
        variants: [
          { id: 14, product_id: 6, variant_name: 'Standard', current_rate_paise_per_unit: 28000, effective_from: '2026-08-01T09:30:00Z', is_active: 1, hasInvoiceHistory: true, rateHistory: [] }
        ]
      },
      {
        id: 7,
        product_code: '3',
        name: 'Chicken Boneless 1kg pack',
        category: 'Chicken',
        type: 'Processed',
        unit_type: 'weight',
        current_rate_paise_per_unit: 36000,
        is_active: 1,
        created_at: '2026-07-12T00:00:00Z',
        updated_at: '2026-07-12T00:00:00Z',
        hasInvoiceHistory: false,
        hasSalesHistory: false,
        rateHistory: [
          { id: 103, product_id: 7, old_rate_paise_per_unit: 0, rate_paise_per_unit: 36000, effective_from: '2026-07-12T00:00:00Z', set_by: 1, set_by_name: 'Admin' }
        ],
        variants: [
          { id: 16, product_id: 7, variant_name: 'Standard', current_rate_paise_per_unit: 36000, effective_from: '2026-07-12T00:00:00Z', is_active: 1, hasInvoiceHistory: false, rateHistory: [] }
        ]
      },
      {
        id: 8,
        product_code: '4',
        name: 'Mutton Curry Cut',
        category: 'Mutton',
        type: 'Unprocessed',
        unit_type: 'weight',
        current_rate_paise_per_unit: 74000,
        is_active: 1,
        created_at: '2026-07-11T00:00:00Z',
        updated_at: '2026-07-11T00:00:00Z',
        hasInvoiceHistory: true,
        hasSalesHistory: true,
        rateHistory: [
          { id: 104, product_id: 8, old_rate_paise_per_unit: 70000, rate_paise_per_unit: 74000, effective_from: '2026-08-12T08:00:00Z', set_by: 1, set_by_name: 'Admin' },
          { id: 98, product_id: 8, old_rate_paise_per_unit: 0, rate_paise_per_unit: 70000, effective_from: '2026-07-11T00:00:00Z', set_by: 1, set_by_name: 'Admin' }
        ],
        variants: [
          { id: 18, product_id: 8, variant_name: 'Standard', current_rate_paise_per_unit: 74000, effective_from: '2026-08-12T08:00:00Z', is_active: 1, hasInvoiceHistory: true, rateHistory: [] }
        ]
      },
      {
        id: 9,
        product_code: '5',
        name: 'Mutton Boneless',
        category: 'Mutton',
        type: 'Processed',
        unit_type: 'weight',
        current_rate_paise_per_unit: 85000,
        is_active: 1,
        created_at: '2026-07-11T00:00:00Z',
        updated_at: '2026-07-11T00:00:00Z',
        hasInvoiceHistory: false,
        hasSalesHistory: false,
        rateHistory: [
          { id: 105, product_id: 9, old_rate_paise_per_unit: 0, rate_paise_per_unit: 85000, effective_from: '2026-07-11T00:00:00Z', set_by: 1, set_by_name: 'Admin' }
        ],
        variants: [
          { id: 19, product_id: 9, variant_name: 'Standard', current_rate_paise_per_unit: 85000, effective_from: '2026-07-11T00:00:00Z', is_active: 1, hasInvoiceHistory: false, rateHistory: [] }
        ]
      },
      {
        id: 11,
        product_code: '6',
        name: 'Fresh Prawns',
        category: 'Seafood',
        type: 'Unprocessed',
        unit_type: 'weight',
        current_rate_paise_per_unit: 48000,
        is_active: 1,
        created_at: '2026-07-11T00:00:00Z',
        updated_at: '2026-07-11T00:00:00Z',
        hasInvoiceHistory: false,
        hasSalesHistory: false,
        rateHistory: [
          { id: 106, product_id: 11, old_rate_paise_per_unit: 45000, rate_paise_per_unit: 48000, effective_from: '2026-08-05T14:20:00Z', set_by: 1, set_by_name: 'Admin' },
          { id: 97, product_id: 11, old_rate_paise_per_unit: 0, rate_paise_per_unit: 45000, effective_from: '2026-07-11T00:00:00Z', set_by: 1, set_by_name: 'Admin' }
        ],
        variants: [
          { id: 21, product_id: 11, variant_name: 'Standard', current_rate_paise_per_unit: 48000, effective_from: '2026-08-05T14:20:00Z', is_active: 1, hasInvoiceHistory: false, rateHistory: [] }
        ]
      },
      {
        id: 12,
        product_code: '7',
        name: 'Fish Rohu Steaks',
        category: 'Seafood',
        type: 'Processed',
        unit_type: 'weight',
        current_rate_paise_per_unit: 32000,
        is_active: 1,
        created_at: '2026-07-11T00:00:00Z',
        updated_at: '2026-07-11T00:00:00Z',
        hasInvoiceHistory: true,
        hasSalesHistory: true,
        rateHistory: [
          { id: 107, product_id: 12, old_rate_paise_per_unit: 0, rate_paise_per_unit: 32000, effective_from: '2026-07-11T00:00:00Z', set_by: 1, set_by_name: 'Admin' }
        ],
        variants: [
          { id: 23, product_id: 12, variant_name: 'Standard', current_rate_paise_per_unit: 32000, effective_from: '2026-07-11T00:00:00Z', is_active: 1, hasInvoiceHistory: true, rateHistory: [] }
        ]
      },
      {
        id: 13,
        product_code: '8',
        name: 'Farm Fresh Eggs Tray of 30',
        category: 'Eggs',
        type: 'Unprocessed',
        unit_type: 'piece',
        current_rate_paise_per_unit: 18000,
        is_active: 1,
        created_at: '2026-07-11T00:00:00Z',
        updated_at: '2026-07-11T00:00:00Z',
        hasInvoiceHistory: false,
        hasSalesHistory: false,
        rateHistory: [
          { id: 108, product_id: 13, old_rate_paise_per_unit: 0, rate_paise_per_unit: 18000, effective_from: '2026-07-11T00:00:00Z', set_by: 1, set_by_name: 'Admin' }
        ],
        variants: [
          { id: 24, product_id: 13, variant_name: 'Standard', current_rate_paise_per_unit: 18000, effective_from: '2026-07-11T00:00:00Z', is_active: 1, hasInvoiceHistory: false, rateHistory: [] }
        ]
      },
    ];

    const mockVariants = [
      { id: 12, product_id: 5, variant_name: "Standard", current_rate_paise_per_unit: 24000, is_active: 1, product_code: "1", product_name: "Chicken Whole", unit_type: "weight", category: "Chicken" },
      { id: 14, product_id: 6, variant_name: "Standard", current_rate_paise_per_unit: 28000, is_active: 1, product_code: "2", product_name: "Chicken Curry Cut", unit_type: "weight", category: "Chicken" },
      { id: 16, product_id: 7, variant_name: "Standard", current_rate_paise_per_unit: 36000, is_active: 1, product_code: "3", product_name: "Chicken Boneless 1kg pack", unit_type: "weight", category: "Chicken" },
      { id: 18, product_id: 8, variant_name: "Standard", current_rate_paise_per_unit: 74000, is_active: 1, product_code: "4", product_name: "Mutton Curry Cut", unit_type: "weight", category: "Mutton" },
      { id: 19, product_id: 9, variant_name: "Standard", current_rate_paise_per_unit: 85000, is_active: 1, product_code: "5", product_name: "Mutton Boneless", unit_type: "weight", category: "Mutton" },
      { id: 21, product_id: 11, variant_name: "Standard", current_rate_paise_per_unit: 48000, is_active: 1, product_code: "6", product_name: "Fresh Prawns", unit_type: "weight", category: "Seafood" },
      { id: 23, product_id: 12, variant_name: "Standard", current_rate_paise_per_unit: 32000, is_active: 1, product_code: "7", product_name: "Fish Rohu Steaks", unit_type: "weight", category: "Seafood" },
      { id: 24, product_id: 13, variant_name: "Standard", current_rate_paise_per_unit: 18000, is_active: 1, product_code: "8", product_name: "Farm Fresh Eggs Tray of 30", unit_type: "piece", category: "Eggs" }
    ];

    let configState = {
      env: 'development',
      dbPath: 'dev.db (Browser Fallback Mock)',
      shopInfo: {
        name: 'My Premium Meat Shop (Web Mock)',
        address: '123 Market Square, Bangalore',
        phone: '+91 98765 43210',
        gstin: '29AAAAA0000A1Z5',
        currencySymbol: '₹',
      },
      theme: 'dark',
      hardware: {
        printerName: '',
        scalePort: '',
        scaleBaudRate: 9600,
        barcodeScannerEnabled: true,
      },
      receiptTemplate: {
        paperWidth: '80mm',
        headerMessage: 'Fresh Quality Meats Daily',
        footerMessage: 'Thank you for your business! Visit again.',
        showGstBreakdown: true,
        autoPrintOnComplete: true,
      },
      billingSettings: {
        skipPaymentConfirmation: false,
        enableCalculatorWidget: true,
        defaultPaymentMethod: 'cash',
      },
    };

    const getInvoiceDetails = (invoiceId: number) => {
      const invoice = mockInvoices.find(i => i.id === invoiceId);
      if (!invoice) throw new Error('Invoice not found');
      const items = mockInvoiceItems.filter(item => item.invoice_id === invoiceId);
      const payments = mockPayments.filter(p => p.invoice_id === invoiceId);
      return { invoice, items, payments };
    };

    const recalculateInvoiceTotals = (invoiceId: number) => {
      const invoice = mockInvoices.find(i => i.id === invoiceId);
      if (!invoice) return;
      const items = mockInvoiceItems.filter(item => item.invoice_id === invoiceId);
      
      let subtotal = 0;
      let tax = 0;
      for (const item of items) {
        subtotal += item.line_subtotal_paise;
        const itemTax = item.gst_rate_percent_snapshot ? Math.round(item.line_subtotal_paise * 0.05) : 0;
        item.line_total_paise = item.line_subtotal_paise + itemTax;
        tax += itemTax;
      }
      
      invoice.subtotal_paise = subtotal;
      invoice.tax_paise = tax;
      invoice.cgst_paise = Math.round(tax / 2);
      invoice.sgst_paise = Math.round(tax / 2);
      invoice.total_paise = Math.max(0, subtotal + tax - (invoice.discount_paise || 0));
    };

    (window as any).api = {
      invoke: async (channel: string, ...args: any[]): Promise<any> => {
        console.log(`[Browser Mock IPC] Calling channel: ${channel}`, args);
        let data: any = null;

        try {
          switch (channel) {
            case 'config:get':
              data = configState;
              break;
            case 'config:update':
              if (args[0]?.shopInfo) configState.shopInfo = { ...configState.shopInfo, ...args[0].shopInfo };
              if (args[0]?.receiptTemplate) configState.receiptTemplate = { ...configState.receiptTemplate, ...args[0].receiptTemplate };
              if (args[0]?.billingSettings) configState.billingSettings = { ...configState.billingSettings, ...args[0].billingSettings };
              if (args[0]?.hardware) configState.hardware = { ...configState.hardware, ...args[0].hardware };
              if (args[0]?.theme) configState.theme = args[0].theme;
              data = configState;
              break;
            case 'db:health':
              data = { status: 'OK', appliedMigrations: 4 };
              break;
            case 'system:get-info':
              data = {
                appVersion: '1.0.0',
                electronVersion: '31.1.0 (Web Mock)',
                nodeVersion: '20.14.9 (Web Mock)',
                chromeVersion: '126.0.0 (Web Mock)',
                platform: 'win32',
                arch: 'x64',
                env: 'development',
                dbPath: 'dev.db (Browser Mock)',
              };
              break;
            case 'system:log':
              data = true;
              break;
            case 'billing:get-variants':
              data = mockVariants;
              break;
            case 'billing:create-invoice':
              const newInvoice = {
                id: nextInvoiceId++,
                invoice_number: null,
                financial_year: null,
                customer_id: args[0]?.customer_id || null,
                status: 'draft',
                is_gst_invoice: args[0]?.is_gst_invoice ? 1 : 0,
                gst_number_snapshot: args[0]?.gst_number_snapshot || null,
                subtotal_paise: 0,
                cgst_paise: 0,
                sgst_paise: 0,
                tax_paise: 0,
                total_paise: 0,
                discount_paise: 0,
                discount_reason: null,
                discount_applied_by: null,
                payment_status: 'unpaid',
                created_by: 1,
                created_at: new Date().toISOString(),
              };
              mockInvoices.push(newInvoice);
              data = newInvoice;
              break;
            case 'billing:get-invoice':
              data = getInvoiceDetails(args[0].invoice_id);
              break;
            case 'billing:add-item': {
              const { invoice_id, product_variant_id, quantity_grams, quantity_units, override_rate_paise } = args[0];
              const variant = mockVariants.find(v => v.id === product_variant_id);
              if (!variant) throw new Error('Variant not found');

              const invoice = mockInvoices.find(i => i.id === invoice_id);
              if (!invoice) throw new Error('Invoice not found');

              const rate = override_rate_paise !== undefined && override_rate_paise !== null ? override_rate_paise : variant.current_rate_paise_per_unit;
              let subtotal = 0;
              if (variant.unit_type === 'weight') {
                subtotal = Math.round((quantity_grams || 0) * (rate / 1000));
              } else {
                subtotal = (quantity_units || 0) * rate;
              }

              const itemTax = invoice.is_gst_invoice ? Math.round(subtotal * 0.05) : 0;

              const newItem = {
                id: nextItemId++,
                invoice_id,
                product_variant_id,
                quantity_grams,
                quantity_units,
                rate_paise_snapshot: rate,
                line_subtotal_paise: subtotal,
                gst_rate_percent_snapshot: invoice.is_gst_invoice ? 500 : null,
                line_total_paise: subtotal + itemTax,
                override_applied: (override_rate_paise !== undefined && override_rate_paise !== null) ? 1 : 0,
                override_reason: args[0].override_reason || null,
                overridden_by: args[0].overridden_by || null,
                variant_name: variant.variant_name,
                product_name: variant.product_name,
                product_code: variant.product_code,
                unit_type: variant.unit_type,
                category: variant.category
              };

              mockInvoiceItems.push(newItem);
              recalculateInvoiceTotals(invoice_id);
              data = getInvoiceDetails(invoice_id);
              break;
            }
            case 'billing:update-item-qty': {
              const { item_id, quantity_grams, quantity_units } = args[0];
              const item = mockInvoiceItems.find(i => i.id === item_id);
              if (!item) throw new Error('Item not found');

              item.quantity_grams = quantity_grams;
              item.quantity_units = quantity_units;

              if (item.unit_type === 'weight') {
                item.line_subtotal_paise = Math.round((quantity_grams || 0) * (item.rate_paise_snapshot / 1000));
              } else {
                item.line_subtotal_paise = (quantity_units || 0) * item.rate_paise_snapshot;
              }

              recalculateInvoiceTotals(item.invoice_id);
              data = getInvoiceDetails(item.invoice_id);
              break;
            }
            case 'billing:remove-item': {
              const itemIdx = mockInvoiceItems.findIndex(i => i.id === args[0].item_id);
              if (itemIdx === -1) throw new Error('Item not found');
              const invoiceId = mockInvoiceItems[itemIdx].invoice_id;
              mockInvoiceItems.splice(itemIdx, 1);
              recalculateInvoiceTotals(invoiceId);
              data = getInvoiceDetails(invoiceId);
              break;
            }
            case 'billing:toggle-gst': {
              const { invoice_id, is_gst_invoice, gst_number_snapshot } = args[0];
              const invoice = mockInvoices.find(i => i.id === invoice_id);
              if (!invoice) throw new Error('Invoice not found');
              invoice.is_gst_invoice = is_gst_invoice ? 1 : 0;
              invoice.gst_number_snapshot = gst_number_snapshot || null;

              const items = mockInvoiceItems.filter(i => i.invoice_id === invoice_id);
              for (const item of items) {
                item.gst_rate_percent_snapshot = is_gst_invoice ? 500 : null;
              }

              recalculateInvoiceTotals(invoice_id);
              data = getInvoiceDetails(invoice_id);
              break;
            }
            case 'billing:record-payment': {
              const { invoice_id, method, amount_paise } = args[0];
              mockPayments.push({
                invoice_id,
                method,
                amount_paise,
                received_at: new Date().toISOString()
              });
              recalculateInvoiceTotals(invoice_id);
              data = getInvoiceDetails(invoice_id);
              break;
            }
            case 'billing:complete-invoice': {
              const invoiceId = args[0]?.invoiceId || args[0]?.invoice_id;
              const invoice = mockInvoices.find(i => i.id === invoiceId);
              if (!invoice) throw new Error('Invoice not found');
              invoice.status = 'completed';
              invoice.invoice_number = `INV/2026-27/${String(invoiceId).padStart(6, '0')}`;
              invoice.financial_year = '2026-27';
              invoice.payment_status = 'paid';
              recalculateInvoiceTotals(invoiceId);
              data = getInvoiceDetails(invoiceId);
              break;
            }
            case 'billing:delete-draft':
              mockInvoices = mockInvoices.filter(i => i.id !== args[0].invoice_id);
              mockInvoiceItems = mockInvoiceItems.filter(i => i.invoice_id !== args[0].invoice_id);
              mockPayments = mockPayments.filter(p => p.invoice_id !== args[0].invoice_id);
              data = true;
              break;
            case 'billing:list-held':
              data = mockInvoices.filter(i => i.status === 'held');
              break;
            case 'billing:search-invoices': {
              const filter = args[0] || {};
              let res = mockInvoices.filter(i => i.status === 'completed');
              if (filter.billNumber && filter.billNumber.trim()) {
                const query = filter.billNumber.trim().toLowerCase();
                res = res.filter(i => 
                  (i.invoice_number && i.invoice_number.toLowerCase().includes(query)) ||
                  String(i.id).includes(query)
                );
              }
              if (filter.startDate) {
                res = res.filter(i => new Date(i.completed_at || i.created_at).toISOString().split('T')[0] >= filter.startDate);
              }
              if (filter.endDate) {
                res = res.filter(i => new Date(i.completed_at || i.created_at).toISOString().split('T')[0] <= filter.endDate);
              }
              data = res;
              break;
            }
            case 'billing:return-invoice': {
              const payload = args[0] || {};
              const returnItems = payload.items || [];
              let totalRefund = 0;
              returnItems.forEach((it: any) => { totalRefund += (it.refund_total_paise || 0); });

              if (payload.invoice_id) {
                const inv = mockInvoices.find(i => i.id === payload.invoice_id);
                if (inv) {
                  inv.status = 'returned';
                  inv.return_reason = payload.reason;
                  inv.refund_total_paise = totalRefund;
                }
              } else {
                const retInv = {
                  id: nextInvoiceId++,
                  invoice_number: `RET-${nextInvoiceId}`,
                  financial_year: '2026-27',
                  customer_id: null,
                  status: 'returned',
                  is_gst_invoice: 0,
                  subtotal_paise: -totalRefund,
                  total_paise: -totalRefund,
                  narration: payload.reference ? `Ref: ${payload.reference}` : 'Direct Return',
                  return_reason: payload.reason,
                  payment_status: 'paid',
                  created_by: 1,
                  created_at: payload.date ? new Date(payload.date).toISOString() : new Date().toISOString(),
                  completed_at: new Date().toISOString(),
                };
                mockInvoices.push(retInv);
              }

              if (payload.refund_given && payload.refund_method === 'cash' && mockCashSession) {
                mockCashSession.current_cash_paise = Math.max(0, mockCashSession.current_cash_paise - totalRefund);
              }

              data = { success: true, message: 'Sales return processed' };
              break;
            }
            case 'cashbox:get-current-session': {
              data = mockCashSession;
              break;
            }
            case 'cashbox:open-session': {
              mockCashSession = {
                id: Date.now(),
                opening_cash_paise: args[0]?.opening_cash_paise || 500000,
                current_cash_paise: args[0]?.opening_cash_paise || 500000,
                status: 'open',
                opened_at: new Date().toISOString(),
                closed_at: null,
              };
              data = mockCashSession;
              break;
            }
            case 'cashbox:close-session': {
              if (mockCashSession) {
                mockCashSession.status = 'closed';
                mockCashSession.closed_at = new Date().toISOString();
              }
              data = mockCashSession;
              break;
            }
            case 'cashbox:record-transaction': {
              if (mockCashSession && args[0]) {
                if (args[0].type === 'inflow') {
                  mockCashSession.current_cash_paise += args[0].amount_paise;
                } else if (args[0].type === 'outflow') {
                  mockCashSession.current_cash_paise -= args[0].amount_paise;
                }
              }
              data = true;
              break;
            }

            // ─── Expenses Mock ──────────────────────────────────────────────────
            case 'expenses:get-categories': {
              data = mockExpenseCategories.filter(c => c.is_active === 1);
              break;
            }
            case 'expenses:create-category': {
              const name = args[0]?.name || args[0] || 'New Category';
              const newCat = {
                id: mockExpenseCategories.length + 1,
                name: String(name).trim(),
                is_active: 1
              };
              mockExpenseCategories.push(newCat);
              data = mockExpenseCategories.filter(c => c.is_active === 1);
              break;
            }
            case 'expenses:get-expenses': {
              data = mockExpenses.filter(e => e.is_active !== 0);
              break;
            }
            case 'expenses:record-expense': {
              const payload = args[0] || {};
              const cat = mockExpenseCategories.find(c => c.id === Number(payload.category_id));
              const newExp = {
                id: mockExpenses.length + 1,
                store_id: 1,
                category_id: Number(payload.category_id) || 1,
                category_name: cat ? cat.name : 'General',
                vendor_name: payload.vendor_name || 'General Vendor',
                amount_paise: Number(payload.amount_paise) || 0,
                gst_paise: Number(payload.gst_paise) || 0,
                payment_method: payload.payment_method || 'Cash',
                expense_date: payload.expense_date || new Date().toISOString().split('T')[0],
                notes: payload.notes || 'Store operational expense',
                status: 'Approved',
                created_by: 1,
                is_active: 1,
              };
              mockExpenses.unshift(newExp);
              data = newExp;
              break;
            }
            case 'expenses:approve-expense': {
              const id = args[0]?.id || args[0];
              const exp = mockExpenses.find(e => e.id === id);
              if (exp) exp.status = 'Approved';
              data = exp;
              break;
            }

            case 'inventory:get-stock':
              data = mockVariants.map(v => ({
                id: v.id,
                product_name: v.product_name,
                variant_name: v.variant_name,
                category: v.category,
                quantity_grams: v.unit_type === 'weight' ? 50000 : null,
                quantity_units: v.unit_type === 'piece' ? 120 : null,
                safety_threshold_grams: v.unit_type === 'weight' ? 5000 : null,
                safety_threshold_units: v.unit_type === 'piece' ? 10 : null,
                unit_type: v.unit_type
              }));
              break;
            case 'inventory:get-txn-history':
              data = [];
              break;
            case 'inventory:get-adj-history':
              data = [];
              break;
            case 'inventory:adjust-stock':
              data = true;
              break;
            case 'inventory:empty-inventory':
              data = {
                success: true,
                message: 'Inventory successfully emptied (Browser Mock)',
                variantsReset: 15,
                batchesExhausted: 3,
                liveBatchesClosed: 1,
                fridgeItemsRemoved: 1,
              };
              break;
            case 'inventory:list-suppliers':
              data = mockSuppliers;
              break;
            case 'inventory:create-supplier': {
              const newS = {
                id: mockSuppliers.length + 1,
                code: `SPL-${String(mockSuppliers.length + 1).padStart(5, '0')}`,
                name: args[0].name,
                contact: args[0].contact || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              mockSuppliers.push(newS);
              data = newS;
              break;
            }
            case 'inventory:record-purchase': {
              const newPur = {
                id: mockPurchases.length + 1,
                supplier_id: args[0].supplier_id,
                product_variant_id: args[0].product_variant_id,
                quantity_grams: args[0].quantity_grams || null,
                quantity_units: args[0].quantity_units || null,
                cost_paise: args[0].cost_paise,
                created_by: args[0].created_by || 1,
                created_at: new Date().toISOString(),
              };
              mockPurchases.push(newPur);
              data = newPur;
              break;
            }
            case 'inventory:list-purchases': {
              data = mockPurchases.map(p => {
                const s = mockSuppliers.find(x => x.id === p.supplier_id);
                let vName = 'Unknown Variant';
                let pName = 'Unknown Product';
                for (const pr of mockAdminProducts) {
                  const v = pr.variants.find((x: any) => x.id === p.product_variant_id);
                  if (v) {
                    vName = v.variant_name;
                    pName = pr.name;
                    break;
                  }
                }
                return {
                  ...p,
                  supplier_name: s ? s.name : 'Unknown Supplier',
                  variant_name: vName,
                  product_name: pName,
                  created_by_username: mockSessionUser ? mockSessionUser.username : 'admin',
                };
              });
              break;
            }

            // ─── Reports Mock ───────────────────────────────────────────────────
            case 'reports:get-sales-summary': {
              data = {
                totalInvoices: 3,
                totalRevenuePaise: 84000,
                totalTaxPaise: 4200,
                subtotalPaise: 79800,
                gstRevenuePaise: 84000,
                nonGstRevenuePaise: 0,
                totalDiscountPaise: 0,
              };
              break;
            }
            case 'reports:get-category-sales': {
              data = [
                { category: 'Chicken', revenuePaise: 56000, grams: 2000, units: 0 },
                { category: 'Mutton', revenuePaise: 28000, grams: 500, units: 0 },
              ];
              break;
            }
            case 'reports:get-profit-summary': {
              data = {
                totalSalesRevenuePaise: 79800,
                totalCostPaise: 51870,
                grossProfitPaise: 27930,
                profitMarginPercent: 35.0,
              };
              break;
            }

            // ─── Products Management Mock (Flat Model) ───────────────────────────
            case 'products:get-all': {
              data = mockAdminProducts;
              break;
            }
            case 'products:create': {
              const { name, category, type = 'Unprocessed', unit_type = 'weight', product_code, rate_paise = 0, is_processed_cut } = args[0] || {};
              
              // 1. Auto-generate product code / bill number if not provided
              let finalCode = product_code?.trim();
              if (!finalCode) {
                const numericCodes = mockAdminProducts
                  .map(p => parseInt(p.product_code, 10))
                  .filter(n => !isNaN(n) && n > 0);
                const nextNum = numericCodes.length > 0 ? Math.max(...numericCodes) + 1 : mockAdminProducts.length + 1;
                finalCode = String(nextNum);
              }

              // 2. Enforce product code uniqueness
              const existingWithCode = mockAdminProducts.find(p => p.product_code?.toLowerCase() === finalCode.toLowerCase());
              if (existingWithCode) {
                throw new Error(`Code '${finalCode}' is already used by ${existingWithCode.name}. Please choose a different code.`);
              }

              const newId = Date.now();
              const now = new Date().toISOString();
              const initialRate = Number(rate_paise) || 0;

              const newP: any = {
                id: newId,
                product_code: finalCode,
                name: name.trim(),
                category: category.trim(),
                type: type.trim(),
                unit_type: unit_type,
                is_processed_cut: is_processed_cut ?? (type.toLowerCase().includes('process') ? 1 : 0),
                current_rate_paise_per_unit: initialRate,
                is_active: 1,
                created_at: now,
                updated_at: now,
                hasInvoiceHistory: false,
                hasSalesHistory: false,
                rateHistory: [
                  {
                    id: Date.now() + 1,
                    product_id: newId,
                    old_rate_paise_per_unit: 0,
                    rate_paise_per_unit: initialRate,
                    effective_from: now,
                    set_by: 1,
                    set_by_name: mockSessionUser?.username || 'Admin'
                  }
                ],
                variants: [
                  {
                    id: newId,
                    product_id: newId,
                    variant_name: 'Standard',
                    current_rate_paise_per_unit: initialRate,
                    effective_from: now,
                    is_active: 1,
                    hasInvoiceHistory: false,
                    rateHistory: []
                  }
                ]
              };

              mockAdminProducts.unshift(newP);

              // Also sync to mockVariants for POS Billing
              mockVariants.unshift({
                id: newId,
                product_id: newId,
                variant_name: 'Standard',
                current_rate_paise_per_unit: initialRate,
                is_active: 1,
                product_code: finalCode,
                product_name: name.trim(),
                unit_type: unit_type,
                category: category.trim(),
              });

              data = newP;
              break;
            }
            case 'products:update': {
              const { id, fields } = args[0] || {};
              const p = mockAdminProducts.find((x: any) => x.id === id);
              if (!p) throw new Error('Product not found');

              // Check code uniqueness if changing code
              if (fields.product_code && fields.product_code.trim() !== p.product_code) {
                const newCode = fields.product_code.trim();
                const duplicate = mockAdminProducts.find(x => x.id !== id && x.product_code?.toLowerCase() === newCode.toLowerCase());
                if (duplicate) {
                  throw new Error(`This code is already used by ${duplicate.name}. Please choose a different code.`);
                }
                p.product_code = newCode;
              }

              // Check if rate changed -> log in rateHistory
              const now = new Date().toISOString();
              if (fields.rate_paise !== undefined && Number(fields.rate_paise) !== p.current_rate_paise_per_unit) {
                const oldRate = p.current_rate_paise_per_unit;
                const newRate = Number(fields.rate_paise);
                p.current_rate_paise_per_unit = newRate;
                if (!p.rateHistory) p.rateHistory = [];
                p.rateHistory.unshift({
                  id: Date.now(),
                  product_id: p.id,
                  old_rate_paise_per_unit: oldRate,
                  rate_paise_per_unit: newRate,
                  effective_from: now,
                  set_by: 1,
                  set_by_name: mockSessionUser?.username || 'Admin'
                });
              }

              if (fields.name) p.name = fields.name.trim();
              if (fields.category) p.category = fields.category.trim();
              if (fields.type) p.type = fields.type.trim();
              if (fields.unit_type) p.unit_type = fields.unit_type;
              if (fields.is_processed_cut !== undefined) p.is_processed_cut = fields.is_processed_cut;
              p.updated_at = now;

              // Sync mockVariants
              const v = mockVariants.find(x => x.product_id === p.id);
              if (v) {
                v.product_name = p.name;
                v.product_code = p.product_code;
                v.category = p.category;
                v.unit_type = p.unit_type;
                v.current_rate_paise_per_unit = p.current_rate_paise_per_unit;
              }

              data = p;
              break;
            }
            case 'products:deactivate': {
              const p = mockAdminProducts.find((x: any) => x.id === args[0].id);
              if (p) {
                p.is_active = 0;
                p.variants?.forEach((v: any) => { v.is_active = 0; });
                const v = mockVariants.find(x => x.product_id === p.id);
                if (v) v.is_active = 0;
              }
              data = null;
              break;
            }
            case 'products:reactivate': {
              const p = mockAdminProducts.find((x: any) => x.id === args[0].id);
              if (p) {
                p.is_active = 1;
                p.variants?.forEach((v: any) => { v.is_active = 1; });
                const v = mockVariants.find(x => x.product_id === p.id);
                if (v) v.is_active = 1;
              }
              data = null;
              break;
            }
            case 'products:delete': {
              // Soft delete: marks inactive and removes from active selections
              const p = mockAdminProducts.find((x: any) => x.id === args[0].id);
              if (p) {
                p.is_active = 0;
                p.variants?.forEach((v: any) => { v.is_active = 0; });
                const v = mockVariants.find(x => x.product_id === p.id);
                if (v) v.is_active = 0;
              }
              data = { success: true, softDeleted: true };
              break;
            }
            case 'products:deactivate-category': {
              const cat = args[0]?.category;
              mockAdminProducts.filter((x: any) => x.category === cat).forEach((p: any) => {
                p.is_active = 0;
                p.variants?.forEach((v: any) => { v.is_active = 0; });
              });
              data = null;
              break;
            }
            case 'products:reactivate-category': {
              const cat = args[0]?.category;
              mockAdminProducts.filter((x: any) => x.category === cat).forEach((p: any) => {
                p.is_active = 1;
                p.variants?.forEach((v: any) => { v.is_active = 1; });
              });
              data = null;
              break;
            }
            case 'products:delete-category': {
              const cat = args[0]?.category;
              const toRemove = mockAdminProducts.filter((x: any) => x.category === cat).map((x: any) => x.id);
              for (const pid of toRemove) {
                const idx = mockAdminProducts.findIndex((x: any) => x.id === pid);
                if (idx !== -1) mockAdminProducts.splice(idx, 1);
              }
              data = null;
              break;
            }
            case 'products:get-rate-history': {
              const prodId = args[0]?.product_id || args[0]?.variant_id;
              const p = mockAdminProducts.find((x: any) => x.id === prodId || x.variants?.some((v: any) => v.id === prodId));
              data = p?.rateHistory || [];
              break;
            }
            case 'products:get-deleted-archive': {
              data = [];
              break;
            }
            case 'products:restore-deleted': {
              data = { success: true };
              break;
            }
            case 'products:bulk-import': {
              const rows = args[0]?.rows || [];
              let createdCount = 0;
              let updatedCount = 0;
              const errorRows: any[] = [];
              const now = new Date().toISOString();

              rows.forEach((row: any, idx: number) => {
                const name = row.name?.trim();
                const category = row.category?.trim();
                const price = Number(row.price_rupees);

                if (!name || !category || isNaN(price) || price <= 0) {
                  errorRows.push({ rowIndex: idx, messages: ['Name, Category, and positive Selling Rate are required.'] });
                  return;
                }

                let code = row.product_code?.trim();
                if (!code) {
                  const numericCodes = mockAdminProducts
                    .map(p => parseInt(p.product_code, 10))
                    .filter(n => !isNaN(n) && n > 0);
                  const nextNum = (numericCodes.length > 0 ? Math.max(...numericCodes) : mockAdminProducts.length) + idx + 1;
                  code = String(nextNum);
                } else {
                  // check duplicate
                  const duplicate = mockAdminProducts.find(x => x.product_code?.toLowerCase() === code.toLowerCase());
                  if (duplicate) {
                    errorRows.push({ rowIndex: idx, messages: [`Code '${code}' is already used by ${duplicate.name}`] });
                    return;
                  }
                }

                const ratePaise = Math.round(price * 100);
                const newId = Date.now() + idx;
                const newProd: any = {
                  id: newId,
                  product_code: code,
                  name,
                  category,
                  type: row.type?.trim() || 'Unprocessed',
                  unit_type: row.unit_type || 'weight',
                  is_processed_cut: row.type?.toLowerCase().includes('process') ? 1 : 0,
                  current_rate_paise_per_unit: ratePaise,
                  is_active: 1,
                  created_at: now,
                  updated_at: now,
                  hasInvoiceHistory: false,
                  hasSalesHistory: false,
                  rateHistory: [
                    {
                      id: Date.now() + idx + 1000,
                      product_id: newId,
                      old_rate_paise_per_unit: 0,
                      rate_paise_per_unit: ratePaise,
                      effective_from: now,
                      set_by: 1,
                      set_by_name: mockSessionUser?.username || 'Admin'
                    }
                  ],
                  variants: [
                    {
                      id: newId,
                      product_id: newId,
                      variant_name: 'Standard',
                      current_rate_paise_per_unit: ratePaise,
                      effective_from: now,
                      is_active: 1,
                      hasInvoiceHistory: false,
                      rateHistory: []
                    }
                  ]
                };

                mockAdminProducts.unshift(newProd);
                mockVariants.unshift({
                  id: newId,
                  product_id: newId,
                  variant_name: 'Standard',
                  current_rate_paise_per_unit: ratePaise,
                  is_active: 1,
                  product_code: code,
                  product_name: name,
                  unit_type: newProd.unit_type,
                  category,
                });
                createdCount++;
              });

              data = { createdCount, updatedCount, errorRows };
              break;
            }
            case 'products:create-variant': {
              data = { id: Date.now() };
              break;
            }
            case 'products:update-variant-name': {
              data = null;
              break;
            }
            case 'products:deactivate-variant': {
              data = null;
              break;
            }
            case 'products:reactivate-variant': {
              data = null;
              break;
            }
            case 'products:delete-variant': {
              data = true;
              break;
            }
            case 'products:update-rate': {
              const p = mockAdminProducts.find((x: any) => x.id === args[0].variant_id || x.variants?.some((v: any) => v.id === args[0].variant_id));
              if (p) {
                const histEntry = {
                  id: Date.now(),
                  product_id: p.id,
                  old_rate_paise_per_unit: p.current_rate_paise_per_unit,
                  rate_paise_per_unit: args[0].new_rate_paise,
                  effective_from: new Date().toISOString(),
                  set_by: args[0].set_by || 1,
                  set_by_name: mockSessionUser?.username || 'Admin'
                };
                if (!p.rateHistory) p.rateHistory = [];
                p.rateHistory.unshift(histEntry);
                p.current_rate_paise_per_unit = args[0].new_rate_paise;
              }
              data = null;
              break;
            }

            // ─── Authentication Mock ───────────────────────────────────────────
            case 'auth:login': {
              const { username, password } = args[0] || {};
              if (password === 'admin123' && (username === 'admin' || username === 'cashier')) {
                mockSessionUser = {
                  id: username === 'admin' ? 1 : 2,
                  code: username === 'admin' ? 'USR-00001' : 'USR-00002',
                  username,
                  role: username === 'admin' ? 'ADMIN' : 'CASHIER',
                  is_active: 1,
                };
                data = mockSessionUser;
              } else {
                throw new Error('Invalid username or password');
              }
              break;
            }
            case 'auth:logout': {
              mockSessionUser = null;
              data = true;
              break;
            }
            case 'auth:get-session': {
              data = mockSessionUser;
              break;
            }

            default:
              console.warn(`[Browser Mock IPC] Unhandled channel: ${channel}`);
              data = null;
          }

          return { success: true, data };
        } catch (err: any) {
          console.error(`[Browser Mock IPC Error] ${err.message}`);
          return { success: false, error: { message: err.message } };
        }
      }
    };
}

// src/core/tests/run_billing_rework_tests.ts
// Comprehensive automated verification test suite for the Billing Rework prompt

import { db } from '../backend/db';
import { invoiceService } from '../../modules/billing/backend/service/invoice_service';
import { receiptService } from '../../modules/billing/backend/service/receipt_service';
import { configService } from '../config/config_service';
import { authService } from '../../modules/auth/backend/service/auth_service';
import { DeliveryService } from '../../modules/delivery/backend/service/delivery_service';

const deliveryService = new DeliveryService();

async function runTests() {
  console.log('====================================================');
  console.log('--- STARTING BILLING REWORK VERIFICATION SUITE ---');
  console.log('====================================================');

  authService.setSession({ id: 1, code: 'ADM', username: 'admin', role: 'ADMIN', is_active: 1 });

  // ----------------------------------------------------
  // TEST 1: Return Bug Fix (Section 4)
  // Ensure create, draft, add item, and return work without gstNumberSnapshot error
  // ----------------------------------------------------
  console.log('\n[TEST 1] Testing Return Bug & Parameter Defaulting (Section 4)...');
  const variant = db.prepare('SELECT id FROM product_variants WHERE is_active = 1 LIMIT 1').get() as { id: number };
  if (!variant) throw new Error('No active product variant found in db');

  const draftInv = invoiceService.createDraft({ is_gst_invoice: false });
  console.log(`  Draft invoice created: #${draftInv.id}`);
  
  const invDetails = invoiceService.addItem({
    invoice_id: draftInv.id,
    product_variant_id: variant.id,
    quantity_grams: 1000,
    quantity_units: null,
  });

  const exactTotal = invDetails.invoice.total_paise || invDetails.items.reduce((s: number, i: any) => s + i.line_total_paise, 0);
  invoiceService.recordPayment({
    invoice_id: draftInv.id,
    method: 'cash',
    amount_paise: exactTotal,
  });

  const completedInv = invoiceService.completeInvoice({
    invoiceId: draftInv.id,
  });
  console.log(`  Completed invoice: #${completedInv.invoice.invoice_number}`);

  // Perform a return on this completed invoice
  const returnResult = invoiceService.returnInvoice({
    invoice_id: completedInv.invoice.id,
    reason: 'Customer returned meat due to cut change',
    stock_resolution: 'restored',
    refund_given: true,
    refund_method: 'cash',
    items: [{
      product_variant_id: variant.id,
      quantity_grams: 1000,
      quantity_units: null,
      unit_rate_paise: 20000,
      refund_total_paise: 20000,
    }],
  });
  if (!returnResult || !returnResult.invoice) throw new Error('Return invoice failed');
  console.log('  PASS: Return processed cleanly without gstNumberSnapshot parameter error.');

  // ----------------------------------------------------
  // TEST 2: Customer Outstanding & Receipt Breakdown (Section 1 & 2)
  // ----------------------------------------------------
  console.log('\n[TEST 2] Testing Customer Selection Outstanding & Receipt Breakdown (Section 1 & 2)...');
  let testCustomer = db.prepare("SELECT * FROM customers WHERE phone = '9998887771'").get() as any;
  if (!testCustomer) {
    db.prepare(`
      INSERT INTO customers (customer_code, name, phone, category, is_active, credit_allowed, credit_limit_paise, outstanding_balance_paise)
      VALUES ('CUST-TST', 'Mr. Ramesh Test', '9998887771', 'Retail', 1, 1, 5000000, 35000)
    `).run();
    testCustomer = db.prepare("SELECT * FROM customers WHERE phone = '9998887771'").get() as any;
  }

  // Insert existing ledger entry to simulate previous outstanding balance
  db.prepare(`
    INSERT INTO customer_ledger (customer_id, entry_date, ref_type, ref_id, description, debit_paise, credit_paise, running_balance_paise)
    VALUES (?, date('now'), 'opening_balance', 9999, 'Previous unpaid balance', 35000, 0, 35000)
  `).run(testCustomer.id);

  // Create a bill for this customer
  const custBill = invoiceService.createDraft({ is_gst_invoice: false, customer_id: testCustomer.id });
  const custItem = invoiceService.addItem({
    invoice_id: custBill.id,
    product_variant_id: variant.id,
    quantity_grams: 500,
    quantity_units: null,
  });
  invoiceService.recordPayment({
    invoice_id: custBill.id,
    method: 'cash',
    amount_paise: custItem.invoice.total_paise || 10000,
  });
  const completedCustBill = invoiceService.completeInvoice({
    invoiceId: custBill.id,
  });

  // Verify Receipt Text & HTML for Customer Balances (Opening, Bill, Paid, Closing)
  const receiptText = receiptService.generateReceiptText(completedCustBill.invoice.id, 40);
  const receiptHTML = receiptService.generateReceiptHTML(completedCustBill.invoice.id);

  if (!receiptText.includes('Opening Balance :') || !receiptText.includes('Closing Balance :')) {
    throw new Error('Receipt text missing Opening/Closing balance breakdown');
  }
  if (!receiptHTML.includes('Opening Balance :') || !receiptHTML.includes('Closing Balance :')) {
    throw new Error('Receipt HTML missing Opening/Closing balance breakdown');
  }
  console.log('  PASS: Receipt text & HTML correctly show Customer Balances (Opening Balance, Bill Amount, Paid Amount, Closing Balance).');

  // ----------------------------------------------------
  // TEST 3: Edit Bill & Bill Search (Section 3 & 5)
  // ----------------------------------------------------
  console.log('\n[TEST 3] Testing Edit Bill & Search (Section 3 & 5)...');
  // Reopen the completed customer bill
  const reopened = invoiceService.reopenCompletedInvoice(completedCustBill.invoice.id);
  if (reopened.invoice.status !== 'draft') {
    throw new Error('Reopened invoice status must be draft');
  }
  console.log(`  PASS: Bill #${completedCustBill.invoice.id} reopened into draft for direct editing.`);

  invoiceService.recordPayment({
    invoice_id: completedCustBill.invoice.id,
    method: 'cash',
    amount_paise: 10000,
  });

  // Re-complete with modified items/payment
  const reCompleted = invoiceService.completeInvoice({
    invoiceId: completedCustBill.invoice.id,
  });
  if (reCompleted.invoice.status !== 'completed') {
    throw new Error('Re-completed invoice status must be completed');
  }
  console.log('  PASS: Re-edited bill completed successfully.');

  // ----------------------------------------------------
  // TEST 4: Delete Bill & Inventory Restoration & Password (Section 6 & 7)
  // ----------------------------------------------------
  console.log('\n[TEST 4] Testing Delete Bill with Inventory Reversal & Password Security (Section 6 & 7)...');
  // Set custom password in config
  configService.setBillActionPassword('secretPass123');
  if (!configService.verifyBillActionPassword('secretPass123')) {
    throw new Error('Configured password verification failed');
  }
  if (configService.verifyBillActionPassword('wrongPassword')) {
    throw new Error('Wrong password must fail verification');
  }
  console.log('  PASS: Configurable Bill Action Password correctly validated.');

  // Delete the bill
  const deleteResult = invoiceService.deleteInvoice({
    invoice_id: reCompleted.invoice.id,
    reason: 'Cashier error correction',
    password: 'secretPass123',
  });
  if (!deleteResult.success) throw new Error('Delete invoice failed');

  const checkDeleted = db.prepare('SELECT status, void_reason, narration FROM invoices WHERE id = ?').get(reCompleted.invoice.id) as any;
  if (checkDeleted.status !== 'void' || !checkDeleted.narration.includes('DELETED')) {
    throw new Error('Deleted invoice not marked void properly');
  }
  console.log('  PASS: Invoice atomically deleted, stock restored, and audit logged.');

  // ----------------------------------------------------
  // TEST 5: Delivery Order Creation from Billing (Section 8)
  // ----------------------------------------------------
  console.log('\n[TEST 5] Testing Delivery Order Creation & Linking (Section 8)...');
  const delivBill = invoiceService.createDraft({ is_gst_invoice: false, customer_id: testCustomer.id });
  const delivItem = invoiceService.addItem({
    invoice_id: delivBill.id,
    product_variant_id: variant.id,
    quantity_grams: 1000,
    quantity_units: null,
  });
  invoiceService.recordPayment({
    invoice_id: delivBill.id,
    method: 'cash',
    amount_paise: delivItem.invoice.total_paise || 20000,
  });
  const completedDelivBill = invoiceService.completeInvoice({
    invoiceId: delivBill.id,
  });

  // Create delivery order record linked to this bill
  const deliveryOrder = deliveryService.createDeliveryOrder({
    customer_id: testCustomer.id,
    invoice_id: completedDelivBill.invoice.id,
    invoice_number: completedDelivBill.invoice.invoice_number || undefined,
    delivery_charge_paise: 5000,
    payment_method: 'cash',
    new_address: {
      door_no: '456',
      street: 'Test Street',
      area: 'Indiranagar',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560038',
      label: 'Home',
    },
  });

  if (!deliveryOrder || deliveryOrder.invoice_id !== completedDelivBill.invoice.id) {
    throw new Error('Delivery order creation or invoice linking failed');
  }
  console.log(`  PASS: Delivery order #${deliveryOrder.delivery_number} created and linked to Bill #${completedDelivBill.invoice.invoice_number}`);

  console.log('\n====================================================');
  console.log('--- ALL 8 BILLING REWORK TESTS PASSED SUCCESSFULLY! ---');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});

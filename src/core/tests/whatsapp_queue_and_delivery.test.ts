import { app } from 'electron';
import { db } from '../backend/db';
import { migrationEngine } from '../backend/migrations';
import { configService } from '../config/config_service';
import { whatsAppQueueRepository } from '../../modules/whatsapp/backend/whatsapp_queue_repository';
import { invoiceRepository } from '../../modules/billing/backend/repository/invoice_repository';
import { whatsAppService } from '../../modules/billing/backend/service/whatsapp_service';
import { getWhatsAppBillsDir } from '../../electron/receipt_image_generator';
import * as fs from 'fs';

app.whenReady().then(async () => {
  console.log('\n======================================================');
  console.log('   STARTING WHATSAPP QUEUE & HEADLESS DELIVERY TEST SUITE');
  console.log('======================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] Test ${totalTests}: ${testName}`);
      passedTests++;
    } else {
      console.error(`[FAIL] Test ${totalTests}: ${testName}`);
      if (detail) console.error(`       Detail: ${detail}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  try {
    // 1. Run migrations including 063
    console.log('[STEP 1] Running database migrations...');
    migrationEngine.run();
    console.log('Migrations completed successfully.');

    // 2. Verify Schema Integrity for Migration 063
    console.log('\n[STEP 2] Verifying Migration 063 schema columns and table...');
    const invoiceCols = db.prepare("PRAGMA table_info(invoices)").all() as Array<{ name: string }>;
    const hasStatusCol = invoiceCols.some((c) => c.name === 'whatsapp_delivery_status');
    assert(hasStatusCol, 'invoices table has whatsapp_delivery_status column');

    const queueCols = db.prepare("PRAGMA table_info(whatsapp_send_queue)").all() as Array<{ name: string }>;
    assert(queueCols.length > 0, 'whatsapp_send_queue table exists');
    const colNames = queueCols.map((c) => c.name);
    assert(colNames.includes('invoice_id'), 'whatsapp_send_queue has invoice_id column');
    assert(colNames.includes('phone'), 'whatsapp_send_queue has phone column');
    assert(colNames.includes('message_type'), 'whatsapp_send_queue has message_type column');
    assert(colNames.includes('payload_json'), 'whatsapp_send_queue has payload_json column');
    assert(colNames.includes('status'), 'whatsapp_send_queue has status column');
    assert(colNames.includes('retry_count'), 'whatsapp_send_queue has retry_count column');
    assert(colNames.includes('max_retries'), 'whatsapp_send_queue has max_retries column');
    assert(colNames.includes('next_retry_at'), 'whatsapp_send_queue has next_retry_at column');

    // 3. Test Config & Template Defaults
    console.log('\n[STEP 3] Verifying WhatsApp config and template placeholders...');
    const config = configService.get();
    assert(Boolean(config.whatsAppConfig), 'AppConfig has whatsAppConfig object');
    assert(config.whatsAppConfig?.maxRetries === 3, 'Default maxRetries is 3');
    assert(config.whatsAppConfig?.retryBackoffSeconds === 30, 'Default retryBackoffSeconds is 30');
    assert(config.whatsAppConfig?.billCaptionTemplate.includes('{billNo}'), 'billCaptionTemplate includes {billNo}');
    assert(config.whatsAppConfig?.billCaptionTemplate.includes('{customerName}'), 'billCaptionTemplate includes {customerName}');
    assert(config.whatsAppConfig?.deliveryMessageTemplate.includes('{customerName}'), 'deliveryMessageTemplate includes {customerName}');

    // 4. Test Queue Repository Lifecycle Operations
    console.log('\n[STEP 4] Testing Queue Repository Lifecycle Operations...');

    // Clean any prior test queue items
    db.prepare("DELETE FROM whatsapp_send_queue WHERE phone = '919876500001'").run();

    const queueId = whatsAppQueueRepository.enqueue({
      invoice_id: null,
      phone: '919876500001',
      message_type: 'bill_image',
      payload: { test: 'payload_data' },
      max_retries: 3,
    });
    assert(queueId > 0, `Item enqueued successfully with ID #${queueId}`);

    const item = whatsAppQueueRepository.findById(queueId);
    assert(item !== null, 'Item can be retrieved by ID');
    assert(item?.status === 'pending', 'Initial status is pending');
    assert(item?.retry_count === 0, 'Initial retry_count is 0');

    // Test peekNext
    const nextItem = whatsAppQueueRepository.peekNext();
    assert(nextItem !== null, 'peekNext returns pending queue item');

    // Test markProcessing
    whatsAppQueueRepository.markProcessing(queueId);
    const processingItem = whatsAppQueueRepository.findById(queueId);
    assert(processingItem?.status === 'processing', 'Item marked as processing');

    // Test markFailedTransient with exponential backoff
    whatsAppQueueRepository.markFailedTransient(queueId, 'Simulated DOM timeout', 30);
    const transientItem = whatsAppQueueRepository.findById(queueId);
    assert(transientItem?.status === 'failed_transient', 'Item status is failed_transient');
    assert(transientItem?.retry_count === 1, 'Retry count incremented to 1');
    assert(transientItem?.next_retry_at !== null, 'next_retry_at is set for future retry');

    // Test hold_not_logged_in (Zero retry consumption)
    whatsAppQueueRepository.markHoldNotLoggedIn(queueId, 'WhatsApp QR code not scanned');
    const heldItem = whatsAppQueueRepository.findById(queueId);
    assert(heldItem?.status === 'hold_not_logged_in', 'Item marked as hold_not_logged_in');
    assert(heldItem?.retry_count === 1, 'Retry count was NOT incremented by login hold');

    // Test releaseHoldItems (Auto-flush on login)
    const releasedCount = whatsAppQueueRepository.releaseHoldItems();
    assert(releasedCount >= 1, `releaseHoldItems released ${releasedCount} item(s) back to pending`);
    const releasedItem = whatsAppQueueRepository.findById(queueId);
    assert(releasedItem?.status === 'pending', 'Held item successfully restored to pending');

    // Test markFailedFinal
    whatsAppQueueRepository.markFailedFinal(queueId, 'Retries exhausted');
    const finalItem = whatsAppQueueRepository.findById(queueId);
    assert(finalItem?.status === 'failed_final', 'Item marked as failed_final');

    // Test retryItem (Manual retry from toast or UI)
    const retryOk = whatsAppQueueRepository.retryItem(queueId);
    assert(retryOk === true, 'retryItem returns true');
    const retriedItem = whatsAppQueueRepository.findById(queueId);
    assert(retriedItem?.status === 'pending', 'Manual retry reset status to pending');
    assert(retriedItem?.retry_count === 0, 'Manual retry reset retry_count to 0');

    // Test markSent
    whatsAppQueueRepository.markSent(queueId);
    const sentItem = whatsAppQueueRepository.findById(queueId);
    assert(sentItem?.status === 'sent', 'Item marked as sent');

    // Test queue status counts
    const statusStats = whatsAppQueueRepository.getQueueStatus();
    assert(typeof statusStats.sent === 'number', 'getQueueStatus returns valid stats object');

    // 5. Test Receipt Image Cache Directory Resolution
    console.log('\n[STEP 5] Verifying Receipt PNG Cache Directory...');
    const cacheDir = getWhatsAppBillsDir();
    assert(fs.existsSync(cacheDir), `Receipt bills cache directory exists at ${cacheDir}`);

    // Clean up test queue item
    db.prepare("DELETE FROM whatsapp_send_queue WHERE id = ?").run(queueId);

    console.log('\n======================================================');
    console.log(`   ALL TESTS PASSED! (${passedTests}/${totalTests} tests successful)`);
    console.log('======================================================\n');
  } catch (err: any) {
    console.error('Test execution error:', err);
  } finally {
    app.quit();
  }
});

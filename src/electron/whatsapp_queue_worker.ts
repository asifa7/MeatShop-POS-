import * as fs from 'fs';
import { whatsAppQueueRepository } from '../modules/whatsapp/backend/whatsapp_queue_repository';
import { invoiceRepository } from '../modules/billing/backend/repository/invoice_repository';
import { backgroundWhatsAppManager } from './background_whatsapp';
import { generateReceiptPng } from './receipt_image_generator';
import { configService } from '../core/config/config_service';
import { logger } from '../core/backend/logger';

export type WhatsAppEventNotifier = (event: string, payload: any) => void;

class WhatsAppQueueWorker {
  private isRunning = false;
  private isLoopActive = false;
  private wakeSignalResolver: (() => void) | null = null;
  private eventNotifier: WhatsAppEventNotifier | null = null;

  public setEventNotifier(notifier: WhatsAppEventNotifier): void {
    this.eventNotifier = notifier;
  }

  private notify(event: string, payload: any): void {
    if (this.eventNotifier) {
      try {
        this.eventNotifier(event, payload);
      } catch (err) {
        logger.warn('[WhatsApp Worker] Failed to send notification event', { event, error: String(err) });
      }
    }
  }

  /**
   * Starts the background queue worker processing loop.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    whatsAppQueueRepository.resetStuckProcessingItems();
    logger.info('[WhatsApp Worker] Starting queue worker service');
    this.processLoop().catch((err) => {
      logger.error('[WhatsApp Worker] Fatal error in process loop', err);
    });
  }

  /**
   * Stops the background queue worker loop.
   */
  public stop(): void {
    this.isRunning = false;
    this.wake();
    logger.info('[WhatsApp Worker] Stopped queue worker service');
  }

  /**
   * Signals the worker to wake up immediately (e.g. on new item enqueued or re-authentication).
   */
  public wake(): void {
    if (this.wakeSignalResolver) {
      const resolve = this.wakeSignalResolver;
      this.wakeSignalResolver = null;
      resolve();
    }
  }

  /**
   * Main sequential processing loop.
   */
  private async processLoop(): Promise<void> {
    this.isLoopActive = true;

    while (this.isRunning) {
      try {
        // If background worker is paused (e.g., user is currently viewing visible /whatsapp tab), sleep and yield
        if (backgroundWhatsAppManager.isWorkerPaused()) {
          await this.sleep(2500);
          continue;
        }

        const item = whatsAppQueueRepository.peekNext();

        if (!item) {
          // No items ready to process; wait up to 3 seconds or until woken
          await this.sleepOrWake(3000);
          continue;
        }

        logger.info(`[WhatsApp Worker] Processing queue item #${item.id} (type: ${item.message_type}) for ${item.phone}`);
        whatsAppQueueRepository.markProcessing(item.id);

        let payload: any = {};
        try {
          payload = JSON.parse(item.payload_json);
        } catch {
          payload = { text: item.payload_json };
        }

        let sendResult: { success: boolean; notLoggedIn?: boolean; invalidNumber?: boolean; failureReason?: string } = {
          success: false,
          failureReason: 'Unknown error',
        };

        if (item.message_type === 'bill_image') {
          let buffer: Buffer | null = null;
          let dataUrl = payload.dataUrl || '';

          if (payload.filePath && fs.existsSync(payload.filePath)) {
            try {
              buffer = fs.readFileSync(payload.filePath);
              if (!dataUrl) {
                const isPng = payload.filePath.endsWith('.png');
                dataUrl = `data:image/${isPng ? 'png' : 'jpeg'};base64,${buffer.toString('base64')}`;
              }
            } catch (readErr) {
              logger.warn(`[WhatsApp Worker] Could not read cached image at ${payload.filePath}`, { error: String(readErr) });
            }
          }

          if (!buffer && item.invoice_id) {
            try {
              const gen = await generateReceiptPng(item.invoice_id);
              buffer = gen.buffer;
              dataUrl = gen.dataUrl;
            } catch (genErr: any) {
              logger.error(`[WhatsApp Worker] Failed generating receipt PNG for invoice #${item.invoice_id}`, genErr);
              whatsAppQueueRepository.markFailedFinal(item.id, `Failed to render receipt image: ${genErr.message}`);
              if (item.invoice_id) {
                invoiceRepository.updateWhatsAppDeliveryStatus(item.invoice_id, 'not_delivered');
              }
              this.notify('whatsapp:event:send-failed', {
                queueId: item.id,
                invoiceId: item.invoice_id,
                phone: item.phone,
                reason: 'Failed to render receipt image',
              });
              continue;
            }
          }

          if (!buffer) {
            whatsAppQueueRepository.markFailedFinal(item.id, 'Missing receipt image buffer and invoice ID');
            if (item.invoice_id) {
              invoiceRepository.updateWhatsAppDeliveryStatus(item.invoice_id, 'not_delivered');
            }
            this.notify('whatsapp:event:send-failed', {
              queueId: item.id,
              invoiceId: item.invoice_id,
              phone: item.phone,
              reason: 'Missing receipt image buffer',
            });
            continue;
          }

          sendResult = await backgroundWhatsAppManager.sendBillImageAndCaption(
            item.phone,
            buffer,
            dataUrl,
            payload.captionText || ''
          );
        } else {
          // message_type === 'delivery_notice' or 'custom_text'
          const messageText = payload.text || '';
          sendResult = await backgroundWhatsAppManager.sendMessage(item.phone, messageText);
        }

        // Handle send outcome
        if (sendResult.success) {
          logger.info(`[WhatsApp Worker] Successfully dispatched queue item #${item.id}`);
          whatsAppQueueRepository.markSent(item.id);

          if (item.invoice_id && item.message_type === 'bill_image') {
            invoiceRepository.updateWhatsAppDeliveryStatus(item.invoice_id, 'sent');
          }

          this.notify('whatsapp:event:send-success', {
            queueId: item.id,
            invoiceId: item.invoice_id,
            phone: item.phone,
            messageType: item.message_type,
          });
        } else if (sendResult.notLoggedIn) {
          logger.warn(`[WhatsApp Worker] WhatsApp is not linked. Putting queue item #${item.id} on hold.`);
          whatsAppQueueRepository.markHoldNotLoggedIn(
            item.id,
            sendResult.failureReason || 'WhatsApp Web is not linked. Scan QR code in WhatsApp tab.'
          );

          this.notify('whatsapp:event:login-required', {
            queueId: item.id,
            invoiceId: item.invoice_id,
            phone: item.phone,
          });

          // Wait 5 seconds before checking again to avoid hot loop when not logged in
          await this.sleep(5000);
        } else if (sendResult.invalidNumber) {
          logger.warn(`[WhatsApp Worker] Recipient phone number ${item.phone} is invalid or not registered on WhatsApp.`);
          whatsAppQueueRepository.markFailedFinal(
            item.id,
            sendResult.failureReason || 'Recipient number is not on WhatsApp'
          );

          if (item.invoice_id && item.message_type === 'bill_image') {
            invoiceRepository.updateWhatsAppDeliveryStatus(item.invoice_id, 'not_delivered');
          }

          this.notify('whatsapp:event:send-failed', {
            queueId: item.id,
            invoiceId: item.invoice_id,
            phone: item.phone,
            reason: sendResult.failureReason || 'Phone number is not registered on WhatsApp',
          });
        } else {
          // Transient failure (DOM timeout, network disconnect, etc.)
          const nextRetryCount = item.retry_count + 1;
          if (nextRetryCount >= item.max_retries) {
            logger.warn(`[WhatsApp Worker] Retries exhausted for queue item #${item.id} (${nextRetryCount}/${item.max_retries}).`);
            whatsAppQueueRepository.markFailedFinal(
              item.id,
              sendResult.failureReason || `Failed after ${nextRetryCount} attempts`
            );

            if (item.invoice_id && item.message_type === 'bill_image') {
              invoiceRepository.updateWhatsAppDeliveryStatus(item.invoice_id, 'not_delivered');
            }

            this.notify('whatsapp:event:send-failed', {
              queueId: item.id,
              invoiceId: item.invoice_id,
              phone: item.phone,
              reason: `Retries exhausted (${sendResult.failureReason || 'Timeout'})`,
            });
          } else {
            const config = configService.get();
            const baseBackoff = config.whatsAppConfig?.retryBackoffSeconds || 30;
            const backoffSeconds = baseBackoff * Math.pow(2, item.retry_count);

            logger.info(`[WhatsApp Worker] Transient failure on item #${item.id}. Retrying in ${backoffSeconds}s (attempt ${nextRetryCount}/${item.max_retries})`);
            whatsAppQueueRepository.markFailedTransient(
              item.id,
              sendResult.failureReason || 'Delivery verification timed out',
              backoffSeconds
            );
          }
        }
      } catch (err: any) {
        logger.error('[WhatsApp Worker] Unexpected error in worker cycle', err);
        await this.sleep(2000);
      }
    }

    this.isLoopActive = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private sleepOrWake(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.wakeSignalResolver = null;
        resolve();
      }, ms);

      this.wakeSignalResolver = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }
}

export const whatsappQueueWorker = new WhatsAppQueueWorker();

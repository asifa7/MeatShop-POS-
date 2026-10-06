import { BrowserWindow, nativeImage, clipboard } from 'electron';
import { logger } from '../core/backend/logger';

class BackgroundWhatsAppManager {
  private window: BrowserWindow | null = null;
  private isPaused = false;
  private isBusy = false;

  /**
   * Initializes or returns the hidden background window for WhatsApp Web.
   */
  public getOrCreateWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      return this.window;
    }

    const chromeVersion = process.versions.chrome || '126.0.6478.234';
    const userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;

    this.window = new BrowserWindow({
      title: 'WhatsApp Background Sender',
      width: 1280,
      height: 800,
      show: false, // Strictly hidden - zero physical window shown to user
      webPreferences: {
        partition: 'persist:whatsapp',
        nodeIntegration: false,
        contextIsolation: false,
        backgroundThrottling: false, // Critical: do NOT throttle WebSockets/timers when hidden
        webSecurity: true,
      },
    });

    this.window.webContents.setUserAgent(userAgent);

    this.window.webContents.on('did-finish-load', () => {
      logger.info('[WhatsApp Background] Page finished loading');
    });

    this.window.webContents.on('did-fail-load', (_e, code, desc) => {
      logger.warn('[WhatsApp Background] Page load failed', { code, desc });
    });

    this.window.on('closed', () => {
      this.window = null;
    });

    // Warm up WhatsApp Web immediately
    this.window.loadURL('https://web.whatsapp.com').catch((err) => {
      logger.warn('[WhatsApp Background] Initial warm-up load error', err);
    });

    return this.window;
  }

  /**
   * When user navigates to the visible /whatsapp tab, pause background window
   * so both don't conflict over active web client session.
   */
  public pause(): void {
    this.isPaused = true;
    if (this.window && !this.window.isDestroyed()) {
      try {
        this.window.loadURL('about:blank');
        logger.info('[WhatsApp Background] Paused background worker while user is viewing WhatsApp tab');
      } catch (e) {}
    }
  }

  /**
   * When user leaves the /whatsapp tab, resume background window.
   */
  public resume(): void {
    this.isPaused = false;
    if (this.window && !this.window.isDestroyed()) {
      this.window.loadURL('https://web.whatsapp.com').catch(() => {});
      logger.info('[WhatsApp Background] Resumed background worker');
    } else {
      this.getOrCreateWindow();
    }
  }

  public isWorkerPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Checks if WhatsApp Web has an active session or is showing a QR code.
   */
  public async checkLoginStatus(): Promise<{ loggedIn: boolean; qrPresent?: boolean }> {
    if (this.isPaused) return { loggedIn: false };
    try {
      const win = this.getOrCreateWindow();
      const status = await win.webContents.executeJavaScript(`
        (() => {
          const qr = document.querySelector('canvas[aria-label*="Scan"]') || 
                     document.querySelector('div[data-ref]') || 
                     document.querySelector('div[data-testid="qrcode"]') ||
                     document.querySelector('h1[data-testid="landing-title"]') ||
                     (document.body && document.body.innerText && document.body.innerText.includes('Scan to log in'));
          if (qr) return { loggedIn: false, qrPresent: true };
          const chatList = document.querySelector('div[data-testid="chat-list"]') || 
                           document.querySelector('#pane-side') ||
                           document.querySelector('div[aria-label*="Chat list" i]');
          if (chatList) return { loggedIn: true };
          return { loggedIn: !qr };
        })()
      `);
      return status;
    } catch {
      return { loggedIn: false };
    }
  }

  /**
   * Sends a receipt PNG/JPEG image along with a formatted greeting, delivery status, and outstanding reminder in the background.
   */
  public async sendBillImageAndCaption(
    rawPhone: string,
    jpegBuffer: Buffer,
    jpegDataUrl: string,
    captionText: string
  ): Promise<{ success: boolean; phone: string; failureReason?: string; notLoggedIn?: boolean; attempts?: number }> {
    if (this.isPaused) {
      this.resume();
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (this.isBusy) {
      let waitCount = 0;
      while (this.isBusy && waitCount < 30) {
        await new Promise((r) => setTimeout(r, 500));
        waitCount++;
      }
    }

    this.isBusy = true;

    try {
      let cleanPhone = rawPhone.replace(/[^0-9]/g, '');
      if (!cleanPhone) {
        return { success: false, phone: rawPhone, failureReason: 'Invalid phone number' };
      }
      if (cleanPhone.length === 10) {
        cleanPhone = `91${cleanPhone}`;
      }

      const bgWin = this.getOrCreateWindow();
      const targetUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}`;

      logger.info(`[WhatsApp Background] Loading chat for +${cleanPhone}`);
      
      const currentUrl = bgWin.webContents.getURL() || '';
      if (currentUrl.includes('web.whatsapp.com')) {
        await bgWin.webContents.executeJavaScript(`
          if (window.location.href !== ${JSON.stringify(targetUrl)}) {
            window.location.href = ${JSON.stringify(targetUrl)};
          }
        `).catch(() => {});
        await new Promise((r) => setTimeout(r, 1500));
      } else {
        await Promise.race([
          bgWin.loadURL(targetUrl),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Page load timeout')), 15000))
        ]).catch((err) => {
          logger.warn('[WhatsApp Background] loadURL warning/timeout', { error: String(err) });
        });
      }

      // Put image onto clipboard in main process
      try {
        const natImg = nativeImage.createFromBuffer(jpegBuffer);
        clipboard.writeImage(natImg);
      } catch (clipErr: any) {
        logger.warn('[WhatsApp Background] Could not set clipboard image', { error: String(clipErr) });
      }

      // Execute script: wait for chat, paste image via DataTransfer/clipboard, add caption, click send, verify & retry
      const result = await bgWin.webContents.executeJavaScript(`
        (async () => {
          const dataUrl = ${JSON.stringify(jpegDataUrl)};
          const caption = ${JSON.stringify(captionText)};
          const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

          // Step 1: Wait for chat to load (or check for QR / error)
          let chatReady = false;
          for (let i = 0; i < 40; i++) {
            const qrCanvas = document.querySelector('canvas[aria-label*="Scan"]') || 
                             document.querySelector('div[data-ref]') || 
                             document.querySelector('div[data-testid="qrcode"]') ||
                             document.querySelector('h1[data-testid="landing-title"]') ||
                             (document.body && document.body.innerText && document.body.innerText.includes('Scan to log in'));
            if (qrCanvas) {
              return { success: false, notLoggedIn: true, failureReason: 'WhatsApp is not linked. Please scan QR code in WhatsApp tab once.' };
            }

            const modalPopup = document.querySelector('div[data-animate-modal-popup="true"]') || document.querySelector('div[role="alert"]');
            if (modalPopup && modalPopup.textContent && (modalPopup.textContent.includes('invalid') || modalPopup.textContent.includes('not on WhatsApp'))) {
              return { success: false, invalidNumber: true, failureReason: 'Phone number is not registered on WhatsApp.' };
            }

            const input = document.querySelector('footer div[contenteditable="true"]');
            if (input) {
              chatReady = true;
              break;
            }
            await sleep(500);
          }

          if (!chatReady) {
            return { success: false, failureReason: 'Chat took too long to load or WhatsApp disconnected.' };
          }

          const initialOutgoingCount = document.querySelectorAll('div.message-out').length;

          // Step 2: Inject image into the chat via DataTransfer File paste and file input
          let mediaOverlayOpened = false;
          try {
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            const isPng = dataUrl.startsWith('data:image/png');
            const mime = isPng ? 'image/png' : 'image/jpeg';
            const fileName = isPng ? 'bill_receipt.png' : 'bill_receipt.jpg';
            const file = new File([blob], fileName, { type: mime, lastModified: Date.now() });
            const dt = new DataTransfer();
            dt.items.add(file);

            const input = document.querySelector('footer div[contenteditable="true"]') || 
                          document.querySelector('div[data-lexical-editor="true"]') || 
                          document.querySelector('#main') || 
                          document.body;
            if (input) input.focus();

            // Method A: Dispatch synthetic ClipboardEvent paste
            const pasteEvt = new ClipboardEvent('paste', {
              clipboardData: dt,
              bubbles: true,
              cancelable: true
            });
            input.dispatchEvent(pasteEvt);
            document.dispatchEvent(pasteEvt);

            // Method B: Attach button & file input
            const attachBtn = document.querySelector('span[data-icon="plus"]')?.closest('button') ||
                              document.querySelector('span[data-icon="attach-menu-plus"]')?.closest('button') ||
                              document.querySelector('div[title="Attach"]');
            if (attachBtn) {
              attachBtn.click();
              await sleep(250);
            }
            const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
            for (const fi of fileInputs) {
              const acc = (fi.accept || '').toLowerCase();
              if (acc.includes('image') || acc === '*' || acc === '') {
                fi.files = dt.files;
                fi.dispatchEvent(new Event('change', { bubbles: true }));
                break;
              }
            }
          } catch (e) {
            console.error('Image injection error:', e);
          }

          // Wait up to 5 seconds for Media Preview Overlay to open
          for (let i = 0; i < 15; i++) {
            await sleep(300);
            const captionInput = document.querySelector('div[contenteditable="true"][data-tab="10"]') ||
                                 document.querySelector('div[aria-label*="caption" i]') ||
                                 document.querySelector('div[data-testid="media-caption-input-container"] div[contenteditable="true"]') ||
                                 document.querySelector('div[data-lexical-editor="true"]');
            const mediaSendBtn = document.querySelector('span[data-icon="send"]')?.closest('button') ||
                                 document.querySelector('span[data-icon="send-light"]')?.closest('button') ||
                                 document.querySelector('div[aria-label="Send"]');

            if (captionInput || mediaSendBtn) {
              mediaOverlayOpened = true;
              break;
            }
          }

          // Step 3: Handle Caption and Sending
          if (mediaOverlayOpened) {
            const captionEl = document.querySelector('div[contenteditable="true"][data-tab="10"]') ||
                              document.querySelector('div[aria-label*="caption" i]') ||
                              document.querySelector('div[data-testid="media-caption-input-container"] div[contenteditable="true"]') ||
                              document.querySelector('div[data-lexical-editor="true"]') ||
                              document.querySelector('div[contenteditable="true"]');
            if (captionEl) {
              captionEl.focus();
              document.execCommand('selectAll', false, null);
              document.execCommand('insertText', false, caption);
              await sleep(250);
            }

            const sendBtn = document.querySelector('span[data-icon="send"]')?.closest('button') ||
                            document.querySelector('span[data-icon="send-light"]')?.closest('button') ||
                            document.querySelector('div[aria-label="Send"]') ||
                            document.querySelector('button[aria-label="Send"]') ||
                            document.querySelector('div[role="button"][aria-label*="Send" i]');
            if (sendBtn) {
              sendBtn.click();
            } else if (captionEl) {
              captionEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            }
          } else {
            // Fallback: If media overlay did not open, paste text directly into chat input
            const input = document.querySelector('footer div[contenteditable="true"]') ||
                          document.querySelector('div[data-lexical-editor="true"]');
            if (input) {
              input.focus();
              document.execCommand('insertText', false, caption);
              await sleep(300);
              const sendBtn = document.querySelector('span[data-icon="send"]')?.closest('button') ||
                              document.querySelector('span[data-icon="send-light"]')?.closest('button') ||
                              document.querySelector('button[aria-label="Send"]');
              if (sendBtn) {
                sendBtn.click();
              }
            }
          }

          // Step 4: Double Check Verification with Automatic Retries
          // "double check wheather the mesg sent or not if not sended intiat sending again"
          let verified = false;
          for (let attempt = 1; attempt <= 3; attempt++) {
            for (let v = 0; v < 15; v++) {
              await sleep(500);

              const modalOpen = document.querySelector('div[data-testid="media-caption-input-container"]') ||
                                document.querySelector('div[contenteditable="true"][data-tab="10"]');
              const outgoingMsgs = document.querySelectorAll('div.message-out');

              if (!modalOpen && outgoingMsgs.length > initialOutgoingCount) {
                const latest = outgoingMsgs[outgoingMsgs.length - 1];
                const icon = latest.querySelector('span[data-icon="msg-time"], span[data-icon="msg-check"], span[data-icon="msg-dblcheck"], span[data-icon="msg-dblcheck-ack"]');
                if (icon || !modalOpen) {
                  verified = true;
                  return { success: true, attempts: attempt, detail: 'Bill image and description confirmed sent' };
                }
              }
            }

            // Retry clicking send if not verified
            const sendBtn = document.querySelector('span[data-icon="send"]')?.closest('button') ||
                            document.querySelector('span[data-icon="send-light"]')?.closest('button') ||
                            document.querySelector('button[aria-label="Send"]') ||
                            document.querySelector('div[aria-label="Send"]');
            if (sendBtn && !sendBtn.disabled) {
              sendBtn.click();
            }
          }

          return {
            success: verified,
            failureReason: verified ? undefined : 'Message send could not be confirmed after 3 verification cycles.'
          };
        })()
      `);

      logger.info(`[WhatsApp Background] Send image result for +${cleanPhone}:`, result);

      return {
        success: Boolean(result?.success),
        phone: cleanPhone,
        failureReason: result?.failureReason,
        notLoggedIn: Boolean(result?.notLoggedIn),
        attempts: result?.attempts || 1,
      };
    } catch (err: any) {
      logger.error('[WhatsApp Background] Error during sendBillImageAndCaption:', err);
      return {
        success: false,
        phone: rawPhone,
        failureReason: err.message || 'Internal background dispatch error',
      };
    } finally {
      this.isBusy = false;
    }
  }

  /**
   * Sends a plain WhatsApp message automatically in the background with double-check verification and retry.
   */
  public async sendMessage(
    rawPhone: string,
    messageText: string
  ): Promise<{ success: boolean; phone: string; failureReason?: string; notLoggedIn?: boolean; attempts?: number }> {
    if (this.isPaused) {
      this.resume();
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (this.isBusy) {
      let waitCount = 0;
      while (this.isBusy && waitCount < 30) {
        await new Promise((r) => setTimeout(r, 500));
        waitCount++;
      }
    }

    this.isBusy = true;

    try {
      let cleanPhone = rawPhone.replace(/[^0-9]/g, '');
      if (!cleanPhone) {
        return { success: false, phone: rawPhone, failureReason: 'Invalid phone number' };
      }
      if (cleanPhone.length === 10) {
        cleanPhone = `91${cleanPhone}`;
      }

      const bgWin = this.getOrCreateWindow();
      const targetUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(messageText)}`;

      logger.info(`[WhatsApp Background] Loading send URL for +${cleanPhone}`);
      
      const currentUrl = bgWin.webContents.getURL() || '';
      if (currentUrl.includes('web.whatsapp.com')) {
        await bgWin.webContents.executeJavaScript(`
          if (window.location.href !== ${JSON.stringify(targetUrl)}) {
            window.location.href = ${JSON.stringify(targetUrl)};
          }
        `).catch(() => {});
        await new Promise((r) => setTimeout(r, 1500));
      } else {
        await Promise.race([
          bgWin.loadURL(targetUrl),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Page load timeout')), 15000))
        ]).catch((err) => {
          logger.warn('[WhatsApp Background] loadURL warning/timeout', { error: String(err) });
        });
      }

      const result = await bgWin.webContents.executeJavaScript(`
        (async () => {
          const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

          let ready = false;
          for (let i = 0; i < 40; i++) {
            const qrCanvas = document.querySelector('canvas[aria-label*="Scan"]') || 
                             document.querySelector('div[data-ref]') || 
                             document.querySelector('div[data-testid="qrcode"]') ||
                             document.querySelector('h1[data-testid="landing-title"]') ||
                             (document.body && document.body.innerText && document.body.innerText.includes('Scan to log in'));
            if (qrCanvas) {
              return { success: false, notLoggedIn: true, failureReason: 'WhatsApp is not linked. Please scan QR code in WhatsApp tab once.' };
            }

            const modalPopup = document.querySelector('div[data-animate-modal-popup="true"]') || document.querySelector('div[role="alert"]');
            if (modalPopup && modalPopup.textContent && (modalPopup.textContent.includes('invalid') || modalPopup.textContent.includes('not on WhatsApp'))) {
              return { success: false, invalidNumber: true, failureReason: 'Phone number is not registered on WhatsApp.' };
            }

            const sendBtn = document.querySelector('button[aria-label="Send"]') || 
                            document.querySelector('button[aria-label*="send" i]') || 
                            document.querySelector('span[data-icon="send"]')?.closest('button');
            const input = document.querySelector('footer div[contenteditable="true"]');

            if (sendBtn || (input && input.textContent && input.textContent.trim().length > 0)) {
              ready = true;
              break;
            }

            await sleep(500);
          }

          if (!ready) {
            if (document.querySelector('canvas') || document.querySelector('div[data-ref]')) {
              return { success: false, notLoggedIn: true, failureReason: 'WhatsApp is not linked. Please scan QR code in WhatsApp tab once.' };
            }
            return { success: false, failureReason: 'Timeout waiting for WhatsApp chat to load.' };
          }

          let attempt = 0;
          const maxAttempts = 3;

          while (attempt < maxAttempts) {
            attempt++;

            let sendBtn = document.querySelector('button[aria-label="Send"]') || 
                          document.querySelector('button[aria-label*="send" i]') || 
                          document.querySelector('span[data-icon="send"]')?.closest('button');

            if (sendBtn && !sendBtn.disabled) {
              sendBtn.click();
            } else {
              const input = document.querySelector('footer div[contenteditable="true"]');
              if (input) {
                const enterEvent = new KeyboardEvent('keydown', {
                  key: 'Enter',
                  code: 'Enter',
                  keyCode: 13,
                  which: 13,
                  bubbles: true,
                  cancelable: true
                });
                input.dispatchEvent(enterEvent);
                await sleep(300);
                const sb = document.querySelector('span[data-icon="send"]')?.closest('button');
                if (sb && !sb.disabled) {
                  sb.click();
                }
              }
            }

            for (let v = 0; v < 12; v++) {
              await sleep(500);

              const inputAfter = document.querySelector('footer div[contenteditable="true"]');
              const inputEmpty = !inputAfter || !inputAfter.textContent || inputAfter.textContent.trim().length === 0;

              const outgoingMsgs = document.querySelectorAll('div.message-out');
              let statusVerified = false;
              if (outgoingMsgs.length > 0) {
                const latestMsg = outgoingMsgs[outgoingMsgs.length - 1];
                const icon = latestMsg.querySelector('span[data-icon="msg-time"], span[data-icon="msg-check"], span[data-icon="msg-dblcheck"], span[data-icon="msg-dblcheck-ack"]');
                if (icon) {
                  statusVerified = true;
                }
              }

              if (inputEmpty || statusVerified) {
                return {
                  success: true,
                  attempts: attempt,
                  detail: 'Message sent and verified successfully'
                };
              }
            }
          }

          return {
            success: false,
            attempts: maxAttempts,
            failureReason: 'Message could not be confirmed as sent after 3 automated attempts.'
          };
        })()
      `);

      logger.info(`[WhatsApp Background] Send result for +${cleanPhone}:`, result);

      return {
        success: Boolean(result?.success),
        phone: cleanPhone,
        failureReason: result?.failureReason,
        notLoggedIn: Boolean(result?.notLoggedIn),
        attempts: result?.attempts || 1,
      };
    } catch (err: any) {
      logger.error('[WhatsApp Background] Error during background send:', err);
      return {
        success: false,
        phone: rawPhone,
        failureReason: err.message || 'Internal background dispatch error',
      };
    } finally {
      this.isBusy = false;
    }
  }
}

export const backgroundWhatsAppManager = new BackgroundWhatsAppManager();

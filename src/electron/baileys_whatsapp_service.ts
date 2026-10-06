import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import QRCode from 'qrcode';
import pino from 'pino';
import type {
  WASocket,
  ConnectionState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { logger } from '../core/backend/logger';

export interface WhatsAppStatus {
  status: 'connected' | 'connecting' | 'disconnected';
  qrCodeDataUrl: string | null;
  userJid?: string;
  phone?: string;
  hasSavedSession?: boolean;
}

export type WhatsAppMessagePayload = string | { image: Buffer; caption?: string };

interface SendQueueItem {
  phone: string;
  payload: WhatsAppMessagePayload;
  resolve: (res: { success: boolean; messageId?: string; error?: string }) => void;
}

class SimpleCacheStore {
  private cache = new Map<string, any>();
  get<T>(key: string): T | undefined {
    return this.cache.get(key);
  }
  set<T>(key: string, value: T): void {
    this.cache.set(key, value);
    if (this.cache.size > 2000) {
      const first = this.cache.keys().next().value;
      if (first) this.cache.delete(first);
    }
  }
  del(key: string): void {
    this.cache.delete(key);
  }
  flushAll(): void {
    this.cache.clear();
  }
}

const msgRetryCounterCache = new SimpleCacheStore();

let baileysModule: typeof import('@whiskeysockets/baileys') | null = null;
async function getBaileys() {
  if (!baileysModule) {
    const importDynamic = new Function('modulePath', 'return import(modulePath)');
    baileysModule = await importDynamic('@whiskeysockets/baileys');
  }
  return baileysModule!;
}

export class BaileysWhatsAppService {
  private sock: WASocket | null = null;
  private status: 'connected' | 'connecting' | 'disconnected' = 'disconnected';
  private qrCodeDataUrl: string | null = null;
  private userJid: string | undefined = undefined;
  private phone: string | undefined = undefined;
  private reconnectAttempts = 0;
  private isConnecting = false;
  private sessionDir!: string;
  private sendQueue: SendQueueItem[] = [];
  private isProcessingQueue = false;
  private messageStore = new Map<string, any>();

  constructor() {
    this.initSessionDir();
  }

  private initSessionDir(): void {
    try {
      const userDataPath = app?.getPath ? app.getPath('userData') : process.cwd();
      this.sessionDir = path.join(userDataPath, 'whatsapp-session');
    } catch {
      this.sessionDir = path.join(process.cwd(), 'whatsapp-session');
    }
  }

  public async init(): Promise<void> {
    if (this.sock || this.isConnecting) return;
    logger.info('[Baileys] Initializing WhatsApp service on startup...');
    await this.connectToWhatsApp();
  }

  private getSessionPath(): string {
    if (!this.sessionDir) {
      this.initSessionDir();
    }
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
    return this.sessionDir;
  }

  private broadcastStatus(): void {
    const statusPayload: WhatsAppStatus = this.getStatus();
    try {
      if (typeof BrowserWindow !== 'undefined' && BrowserWindow && typeof BrowserWindow.getAllWindows === 'function') {
        const windows = BrowserWindow.getAllWindows();
        for (const win of windows) {
          if (!win.isDestroyed()) {
            win.webContents.send('whatsapp:status-update', statusPayload);
          }
        }
      }
    } catch (e) {}
  }

  private broadcastQr(qrDataUrl: string | null): void {
    try {
      if (typeof BrowserWindow !== 'undefined' && BrowserWindow && typeof BrowserWindow.getAllWindows === 'function') {
        const windows = BrowserWindow.getAllWindows();
        for (const win of windows) {
          if (!win.isDestroyed()) {
            win.webContents.send('whatsapp:qr-update', { qrCodeDataUrl: qrDataUrl });
          }
        }
      }
    } catch (e) {}
  }

  public hasSavedSession(): boolean {
    try {
      const credsPath = path.join(this.getSessionPath(), 'creds.json');
      if (!fs.existsSync(credsPath)) return false;
      const raw = fs.readFileSync(credsPath, 'utf8');
      const data = JSON.parse(raw);
      // Baileys MD stores account identity in me (e.g. { id: '917...:2@s.whatsapp.net' })
      return Boolean(data?.me?.id || data?.registered === true || data?.account);
    } catch {
      return false;
    }
  }

  public getStatus(): WhatsAppStatus {
    const hasSaved = this.hasSavedSession();

    if (this.sock?.user?.id) {
      this.status = 'connected';
      this.userJid = this.sock.user.id;
      const digits = this.sock.user.id.split(':')[0] || this.sock.user.id.split('@')[0];
      if (digits) {
        this.phone = `+${digits}`;
      }
    } else if (hasSaved && !this.phone) {
      try {
        const credsPath = path.join(this.getSessionPath(), 'creds.json');
        if (fs.existsSync(credsPath)) {
          const raw = fs.readFileSync(credsPath, 'utf8');
          const data = JSON.parse(raw);
          if (data?.me?.id) {
            this.userJid = data.me.id;
            const digits = data.me.id.split(':')[0] || data.me.id.split('@')[0];
            if (digits) {
              this.phone = `+${digits}`;
            }
          }
        }
      } catch (e) {}
    }

    // Accurate status reporting:
    // If socket has open user id, report connected.
    // If we have saved credentials and socket is reconnecting, report connecting (never falsely report disconnected).
    let reportedStatus = this.status;
    if (this.sock?.user?.id) {
      reportedStatus = 'connected';
    } else if (hasSaved) {
      reportedStatus = reportedStatus === 'connected' ? 'connected' : 'connecting';
    }

    return {
      status: reportedStatus,
      qrCodeDataUrl: reportedStatus === 'connected' ? null : this.qrCodeDataUrl,
      userJid: this.userJid,
      phone: this.phone,
      hasSavedSession: hasSaved,
    };
  }

  public async forceReconnect(): Promise<WhatsAppStatus> {
    logger.info('[Baileys] Force reconnect requested by client');
    this.reconnectAttempts = 0;
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners('connection.update');
        this.sock.ev.removeAllListeners('creds.update');
        this.sock.end(undefined);
      } catch (e) {}
      this.sock = null;
    }
    this.isConnecting = false;
    this.status = 'connecting';
    this.broadcastStatus();
    // Do NOT delete session folder! Persist existing credentials and re-establish connection.
    await this.connectToWhatsApp();
    return this.getStatus();
  }

  public async connectToWhatsApp(): Promise<void> {
    if (this.isConnecting) {
      logger.info('[Baileys] WhatsApp connection attempt already in progress, skipping duplicate call');
      return;
    }
    if (this.sock && this.status === 'connected') {
      logger.info('[Baileys] WhatsApp is already connected and active, skipping redundant connect');
      return;
    }
    this.isConnecting = true;
    this.status = 'connecting';
    this.broadcastStatus();

    try {
      const sessionPath = this.getSessionPath();
      logger.info(`[Baileys] Initializing WhatsApp session at: ${sessionPath}`);

      const {
        default: makeWASocket,
        DisconnectReason,
        useMultiFileAuthState,
        makeCacheableSignalKeyStore,
        Browsers,
      } = await getBaileys();
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

      const silentLogger = pino({ level: 'silent' });

      this.sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore ? makeCacheableSignalKeyStore(state.keys, silentLogger) : state.keys,
        },
        logger: silentLogger,
        printQRInTerminal: false,
        browser: Browsers ? Browsers.windows('Desktop') : ['Windows', 'Desktop', '10.0.22631'],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        msgRetryCounterCache: msgRetryCounterCache as any,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        generateHighQualityLinkPreview: false,
        getMessage: async (key: any) => {
          if (key && key.id) {
            const found = this.messageStore.get(key.id) || (key.remoteJid ? this.messageStore.get(`${key.remoteJid}:${key.id}`) : undefined);
            if (found?.message) {
              logger.info(`[Baileys] Fulfilling message decryption retry request for key ${key.id}`);
              return found.message;
            }
          }
          return undefined;
        },
      });

      this.sock.ev.on('creds.update', async () => {
        try {
          await saveCreds();
        } catch (e) {
          logger.error('[Baileys] Error persisting credentials update:', e);
        }
      });

      this.sock.ev.on('messages.upsert', async ({ messages }: any) => {
        for (const m of messages || []) {
          if (m?.key?.id) {
            this.messageStore.set(m.key.id, m);
            if (m.key.remoteJid) {
              this.messageStore.set(`${m.key.remoteJid}:${m.key.id}`, m);
            }
            if (this.messageStore.size > 1000) {
              const oldest = this.messageStore.keys().next().value;
              if (oldest) this.messageStore.delete(oldest);
            }
          }
        }
      });

      this.sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          logger.info('[Baileys] New pairing QR generated from connection update');
          try {
            this.qrCodeDataUrl = await QRCode.toDataURL(qr, {
              margin: 2,
              scale: 8,
              errorCorrectionLevel: 'M',
              color: {
                dark: '#050505',
                light: '#ffffff',
              },
            });
            this.status = 'connecting';
            this.broadcastQr(this.qrCodeDataUrl);
            this.broadcastStatus();
          } catch (qrErr: any) {
            logger.error('[Baileys] Failed to convert QR string to data URL', qrErr);
          }
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          logger.warn(`[Baileys] WhatsApp connection closed. StatusCode: ${statusCode}`);

          this.sock = null;
          this.isConnecting = false;

          const isLoggedOut = statusCode === DisconnectReason.loggedOut;

          if (isLoggedOut) {
            // ONLY 401 DisconnectReason.loggedOut is true device logout!
            logger.warn('[Baileys] WhatsApp device unlinked/logged out by user (401). Clearing local session.');
            this.status = 'disconnected';
            this.qrCodeDataUrl = null;
            this.userJid = undefined;
            this.phone = undefined;
            this.clearSessionFolder();
            this.broadcastStatus();
            setTimeout(() => this.connectToWhatsApp(), 1000);
          } else if (statusCode === DisconnectReason.restartRequired) {
            // Handshake completed! WhatsApp server restarted connection to finalize auth (515).
            logger.info('[Baileys] Restart required after pairing handshake (515). Reconnecting immediately...');
            this.reconnectAttempts = 0;
            this.status = 'connecting';
            this.broadcastStatus();
            setTimeout(() => this.connectToWhatsApp(), 300);
          } else {
            // For all other disconnects (badSession 500, connectionClosed 428, timedOut 408, connectionLost 408, unavailableService 503, etc.):
            // NEVER CLEAR THE SESSION FOLDER! Preserving auth state and reconnecting automatically.
            const hasSaved = this.hasSavedSession();
            this.status = hasSaved ? 'connecting' : 'disconnected';
            this.broadcastStatus();
            const delay = Math.min(10000, Math.max(1000, Math.pow(1.5, Math.min(this.reconnectAttempts, 8)) * 1000));
            this.reconnectAttempts++;
            logger.info(`[Baileys] Reconnecting to WhatsApp in ${Math.round(delay)}ms (Attempt #${this.reconnectAttempts}, reason: ${statusCode || 'socket_closed'})...`);
            setTimeout(() => {
              this.connectToWhatsApp();
            }, delay);
          }
        } else if (connection === 'open') {
          logger.info('[Baileys] WhatsApp connection successfully established and open!');
          this.reconnectAttempts = 0;
          this.isConnecting = false;
          this.status = 'connected';
          this.qrCodeDataUrl = null;

          const rawJid = this.sock?.user?.id || '';
          this.userJid = rawJid;
          const matchedPhone = rawJid.split(':')[0] || rawJid.split('@')[0];
          this.phone = matchedPhone ? `+${matchedPhone}` : undefined;

          logger.info(`[Baileys] Linked device user: ${this.userJid} (${this.phone || 'Unknown phone'})`);

          // Ensure credentials are explicitly written to disk on open
          try {
            await saveCreds();
          } catch (e: any) {
            logger.warn('[Baileys] Note saving credentials on open:', { error: e?.message || String(e) });
          }

          this.broadcastQr(null);
          this.broadcastStatus();

          // Flush any pending queue
          this.processQueue();
        }
      });
    } catch (err: any) {
      logger.error('[Baileys] Critical error connecting to WhatsApp', err);
      this.isConnecting = false;
      const hasSaved = this.hasSavedSession();
      this.status = hasSaved ? 'connecting' : 'disconnected';
      this.broadcastStatus();
      if (hasSaved) {
        setTimeout(() => {
          if (!this.sock && !this.isConnecting) {
            this.connectToWhatsApp();
          }
        }, 5000);
      }
    }
  }

  public async logout(): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info('[Baileys] Explicit logout requested by user');
      if (this.sock) {
        try {
          await this.sock.logout();
        } catch (e) {}
        try {
          this.sock.end(undefined);
        } catch (e) {}
        this.sock = null;
      }
      this.clearSessionFolder();
      this.status = 'disconnected';
      this.qrCodeDataUrl = null;
      this.userJid = undefined;
      this.phone = undefined;
      this.broadcastStatus();

      setTimeout(() => this.connectToWhatsApp(), 1000);
      return { success: true };
    } catch (err: any) {
      logger.error('[Baileys] Error during logout', err);
      return { success: false, error: err.message };
    }
  }

  private clearSessionFolder(): void {
    try {
      if (fs.existsSync(this.sessionDir)) {
        fs.rmSync(this.sessionDir, { recursive: true, force: true });
        logger.info('[Baileys] Successfully removed local session directory');
      }
    } catch (err: any) {
      logger.error('[Baileys] Failed to delete session folder', err);
    }
  }

  /**
   * Generates an official 8-digit WhatsApp Multi-Device pairing code (e.g. ABCD-1234)
   * for pairing via phone number instead of QR camera scan.
   */
  public async requestPairingCode(rawPhone: string): Promise<{ success: boolean; code?: string; error?: string }> {
    try {
      if (!rawPhone || !rawPhone.trim()) {
        return { success: false, error: 'Mobile number is required' };
      }

      let clean = rawPhone.replace(/[^0-9]/g, '');
      if (clean.length === 11 && clean.startsWith('0')) {
        clean = clean.slice(1);
      }
      if (clean.length === 10) {
        clean = `91${clean}`;
      }

      if (clean.length < 10) {
        return { success: false, error: 'Please enter a valid 10-digit mobile number' };
      }

      if (this.status === 'connected') {
        return { success: false, error: 'Device is already connected. Please unlink first if you wish to pair another phone.' };
      }

      // If socket is not ready or closed, initialize it
      if (!this.sock) {
        await this.connectToWhatsApp();
      }

      // Wait up to 6 seconds for socket to be initialized
      let tries = 0;
      while (!this.sock && tries < 30) {
        await new Promise((r) => setTimeout(r, 200));
        tries++;
      }

      if (!this.sock) {
        return { success: false, error: 'WhatsApp socket could not be initialized. Please try refreshing.' };
      }

      logger.info(`[Baileys] Requesting mobile pairing code for +${clean}...`);
      const rawCode = await this.sock.requestPairingCode(clean);
      const formattedCode = rawCode?.match(/.{1,4}/g)?.join('-') || rawCode;
      logger.info(`[Baileys] Mobile pairing code successfully issued: ${formattedCode}`);

      return {
        success: true,
        code: formattedCode,
      };
    } catch (err: any) {
      logger.error('[Baileys] Error requesting pairing code:', err);
      return {
        success: false,
        error: err?.message || 'Failed to request pairing code from WhatsApp servers',
      };
    }
  }

  public normalizePhoneNumber(phone: string): { cleanDigits: string; jid: string } {
    let clean = phone.replace(/[^0-9]/g, '');
    if (clean.length === 11 && clean.startsWith('0')) {
      clean = clean.slice(1);
    }
    if (clean.length === 10) {
      clean = `91${clean}`;
    }
    const jid = `${clean}@s.whatsapp.net`;
    return { cleanDigits: clean, jid };
  }

  /**
   * Enqueues a WhatsApp message to be dispatched with automated spacing (1-2s gap).
   * Supports both plain text and single-message image with caption.
   */
  public async sendMessage(
    phone: string,
    payload: WhatsAppMessagePayload
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return this.sendBillWhatsApp(phone, payload);
  }

  public async sendBillWhatsApp(
    phone: string,
    payload: WhatsAppMessagePayload
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return new Promise((resolve) => {
      this.sendQueue.push({
        phone,
        payload,
        resolve,
      });

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.sendQueue.length > 0) {
      const item = this.sendQueue.shift();
      if (!item) break;

      try {
        if (!this.sock || this.status !== 'connected') {
          if (this.hasSavedSession()) {
            logger.info('[Baileys] Socket is currently reconnecting with saved session. Waiting up to 8s for socket to open...');
            let waitTries = 0;
            while ((!this.sock || this.status !== 'connected') && waitTries < 16) {
              await new Promise((r) => setTimeout(r, 500));
              waitTries++;
            }
          }
        }

        if (!this.sock || this.status !== 'connected') {
          logger.warn('[Baileys] Cannot send message: WhatsApp socket is not connected');
          item.resolve({
            success: false,
            error: 'WhatsApp is not connected. Please pair your WhatsApp device in Settings.',
          });
          continue;
        }

        const { cleanDigits, jid } = this.normalizePhoneNumber(item.phone);
        if (!cleanDigits || cleanDigits.length < 10) {
          item.resolve({
            success: false,
            error: `Invalid phone number: "${item.phone}"`,
          });
          continue;
        }

        let messageContent: any;
        if (typeof item.payload === 'string') {
          messageContent = { text: item.payload };
        } else if (item.payload && Buffer.isBuffer(item.payload.image)) {
          messageContent = {
            image: item.payload.image,
            caption: item.payload.caption || '',
            mimetype: 'image/png',
          };
        } else {
          item.resolve({
            success: false,
            error: 'Invalid message payload: missing image Buffer or text string',
          });
          continue;
        }

        const isImage = messageContent && messageContent.image;
        if (this.phone && cleanDigits === this.phone.replace(/[^0-9]/g, '')) {
          logger.warn(`[Baileys] Target phone is the same as the linked sender account (${this.phone}). Note that WhatsApp Multi-Device self-chat takes time to decrypt.`);
        }
        logger.info(`[Baileys] Dispatching background WhatsApp ${isImage ? 'image receipt' : 'message'} to ${jid}...`);

        const result = await this.sock.sendMessage(jid, messageContent);

        if (result?.key?.id) {
          this.messageStore.set(result.key.id, result);
          if (result.key.remoteJid) {
            this.messageStore.set(`${result.key.remoteJid}:${result.key.id}`, result);
          }
          const pureJid = `${cleanDigits}@s.whatsapp.net`;
          this.messageStore.set(`${pureJid}:${result.key.id}`, result);

          if (this.messageStore.size > 1000) {
            const oldest = this.messageStore.keys().next().value;
            if (oldest) this.messageStore.delete(oldest);
          }
        }

        const messageId = result?.key?.id || undefined;
        logger.info(`[Baileys] Successfully dispatched message to ${jid} (Message ID: ${messageId})`);

        item.resolve({
          success: true,
          messageId,
        });
      } catch (sendErr: any) {
        logger.error(`[Baileys] Failed to send message to ${item.phone}:`, sendErr);
        item.resolve({
          success: false,
          error: sendErr?.message || 'Failed to dispatch WhatsApp message',
        });
      }

      // Safe rate-limiting delay (1.5 seconds) between consecutive messages
      if (this.sendQueue.length > 0) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    this.isProcessingQueue = false;
  }
}

export const baileysWhatsAppService = new BaileysWhatsAppService();

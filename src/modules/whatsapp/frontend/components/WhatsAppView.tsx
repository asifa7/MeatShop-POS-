import React, { useRef, useState, useEffect, useMemo } from 'react';
import { 
  MessageSquare, RefreshCw, Send, ShieldCheck, User, Users, Phone, 
  Plus, Search, ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, 
  X, Megaphone, Copy, DollarSign, Sparkles, RotateCcw
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useCustomers, useCreateCustomer } from '../../../customers/frontend/hooks/useCustomers';
import type { Customer, CustomerCategory } from '../../../customers/frontend/types/customer.types';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';

interface WhatsAppViewProps {
  initialPhone?: string;
  initialMessage?: string;
}

// Clean user-agent matching Electron's embedded Chromium version without Electron tokens
export const getCleanChromeUserAgent = () => {
  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    const cleaned = navigator.userAgent
      .replace(/\s*(?:Electron|meat-shop-pos|aistudio-pos)\/[0-9.]+/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.includes('Chrome/')) {
      return cleaned;
    }
  }
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.234 Safari/537.36';
};

export const WhatsAppView: React.FC<WhatsAppViewProps> = ({ initialPhone, initialMessage }) => {
  const location = useLocation();
  const locState = (location.state as { phone?: string; message?: string } | null) || {};

  const webviewRef = useRef<any>(null);

  const userAgentString = useMemo(() => getCleanChromeUserAgent(), []);

  // Compute the initial URL once: if navigated from Billing with phone & message,
  // load directly into that send URL. If normal navigation, load web.whatsapp.com directly.
  const initialWebviewUrl = useMemo(() => {
    const targetP = locState.phone || initialPhone;
    const targetM = locState.message || initialMessage;
    if (targetP && targetM) {
      let clean = targetP.replace(/[^0-9]/g, '');
      if (clean.length === 10) clean = `91${clean}`;
      return `https://web.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(targetM)}`;
    }
    return 'https://web.whatsapp.com';
  }, []);

  const pendingSendRef = useRef<boolean>(Boolean((locState.phone || initialPhone) && (locState.message || initialMessage)));
  const [isClearingSession, setIsClearingSession] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [recipientPhone, setRecipientPhone] = useState(locState.phone || initialPhone || '');
  const [messageText, setMessageText] = useState(locState.message || initialMessage || '');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Customer Management & Filter States
  const { data: customers = [], refetch: refetchCustomers } = useCustomers(false);
  const createCustomerMutation = useCreateCustomer();

  const [customerFilter, setCustomerFilter] = useState<'ALL' | 'OUTSTANDING' | 'WHOLESALE' | 'RETAIL'>('ALL');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Modal States
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustCategory, setNewCustCategory] = useState<CustomerCategory>('Retail');
  const [newCustCreditLimit, setNewCustCreditLimit] = useState('');
  const [addCustomerError, setAddCustomerError] = useState('');

  // Broadcast Modal States
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastTarget, setBroadcastTarget] = useState<'ALL' | 'OUTSTANDING' | 'WHOLESALE' | 'RETAIL'>('ALL');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastIndex, setBroadcastIndex] = useState(0);
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      // Category / Outstanding filter
      if (customerFilter === 'OUTSTANDING' && (!c.outstanding_balance_paise || c.outstanding_balance_paise <= 0)) {
        return false;
      }
      if (customerFilter === 'WHOLESALE' && c.category?.toLowerCase() !== 'wholesale') {
        return false;
      }
      if (customerFilter === 'RETAIL' && c.category?.toLowerCase() !== 'retail') {
        return false;
      }

      // Search query filter
      if (customerSearchQuery.trim()) {
        const q = customerSearchQuery.toLowerCase().trim();
        const matchName = c.name?.toLowerCase().includes(q);
        const matchPhone = (c.phone || '').includes(q) || (c.whatsapp || '').includes(q);
        const matchCode = (c.customer_code || '').toLowerCase().includes(q);
        return matchName || matchPhone || matchCode;
      }

      return true;
    });
  }, [customers, customerFilter, customerSearchQuery]);

  // Selected customer object
  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    return customers.find(c => c.id === selectedCustomerId) || null;
  }, [customers, selectedCustomerId]);

  // Auto-select initial phone or first customer (without disrupting the initial webview URL)
  useEffect(() => {
    const targetP = locState.phone || initialPhone;
    const targetM = locState.message || initialMessage;

    if (targetP) {
      setRecipientPhone(targetP);
      const matched = customers.find(c => (c.phone || '').replace(/\D/g, '').endsWith(targetP.replace(/\D/g, '')));
      if (matched) setSelectedCustomerId(matched.id);
    } else if (!selectedCustomerId && customers.length > 0) {
      setSelectedCustomerId(customers[0].id);
      setRecipientPhone(customers[0].phone || customers[0].whatsapp || '');
    }

    if (targetM) setMessageText(targetM);
  }, [initialPhone, initialMessage, locState.phone, locState.message, customers.length]);

  const handleReload = () => {
    if (webviewRef.current) {
      setIsLoading(true);
      try {
        webviewRef.current.reload();
      } catch (e) {
        console.warn('Webview reload error:', e);
      }
    }
  };

  const handleResetSession = async () => {
    if (!window.confirm('Reset WhatsApp session and clear cache? This will let you scan a fresh QR code and fix login loops.')) {
      return;
    }
    setIsClearingSession(true);
    setStatusNotice('Clearing WhatsApp session cache...');
    try {
      await window.api.invoke(IPC_CHANNELS.WHATSAPP.CLEAR_SESSION);
      setStatusNotice('WhatsApp cache cleared! Reloading fresh login page...');
      pendingSendRef.current = false;
      if (webviewRef.current) {
        webviewRef.current.loadURL('https://web.whatsapp.com');
      }
    } catch (err: any) {
      setStatusNotice(`Failed to reset session: ${err.message || err}`);
    } finally {
      setIsClearingSession(false);
      setTimeout(() => setStatusNotice(null), 5000);
    }
  };

  const handleSendViaWebview = async (phoneToSend?: string, textToSend?: string) => {
    const rawPhone = phoneToSend ?? recipientPhone ?? selectedCustomer?.phone ?? selectedCustomer?.whatsapp ?? '';
    const rawText = textToSend ?? messageText ?? 'Hi';

    let clean = rawPhone.replace(/[^0-9]/g, '');
    if (!clean) {
      setStatusNotice('Please select or enter a valid customer phone number.');
      setTimeout(() => setStatusNotice(null), 4000);
      return;
    }
    if (clean.length === 10) {
      clean = `91${clean}`;
    }

    const wv = webviewRef.current;
    if (!wv) {
      setStatusNotice('WhatsApp Web console is not ready. Please wait a moment.');
      setTimeout(() => setStatusNotice(null), 4000);
      return;
    }

    setStatusNotice(`Opening chat (+${clean}) and sending message...`);

    try {
      const targetUrl = `https://web.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(rawText)}`;

      // Execute dispatch directly in webview context
      const sendResult = await wv.executeJavaScript(`
        (async () => {
          const targetUrl = ${JSON.stringify(targetUrl)};
          const cleanPhone = ${JSON.stringify(clean)};
          const textToSend = ${JSON.stringify(rawText)};
          const sleep = (ms) => new Promise(r => setTimeout(r, ms));

          // 1. Navigate if not already in target chat
          if (!window.location.href.includes(cleanPhone)) {
            window.location.href = targetUrl;
            await sleep(1500);
          }

          // 2. Poll for chat readiness or QR code
          let chatReady = false;
          for (let i = 0; i < 40; i++) {
            await sleep(500);

            // Check if login QR code is present
            const qr = document.querySelector('canvas[aria-label*="Scan"]') ||
                       document.querySelector('div[data-ref]') ||
                       document.querySelector('div[data-testid="qrcode"]') ||
                       document.querySelector('h1[data-testid="landing-title"]') ||
                       (document.body && document.body.innerText && document.body.innerText.includes('Scan to log in'));
            if (qr) {
              return { success: false, notLoggedIn: true };
            }

            // Check if invalid phone modal
            const alertModal = document.querySelector('div[data-animate-modal-popup="true"]') || document.querySelector('div[role="alert"]');
            if (alertModal && alertModal.textContent && (alertModal.textContent.includes('invalid') || alertModal.textContent.includes('not on WhatsApp'))) {
              return { success: false, invalidNumber: true };
            }

            // Check if send button or message input is present
            const sendBtn = document.querySelector('button[aria-label="Send"]') ||
                            document.querySelector('button[aria-label*="send" i]') ||
                            document.querySelector('span[data-icon="send"]')?.closest('button') ||
                            document.querySelector('span[data-icon="send-light"]')?.closest('button');
            const input = document.querySelector('footer div[contenteditable="true"]') ||
                          document.querySelector('div[data-lexical-editor="true"]');

            if (sendBtn || input) {
              chatReady = true;
              break;
            }
          }

          if (!chatReady) {
            return { success: false, timeout: true };
          }

          // 3. Ensure text is present and click send / press Enter
          const initialOutCount = document.querySelectorAll('div.message-out').length;

          for (let attempt = 0; attempt < 5; attempt++) {
            // Check send button first
            let sendBtn = document.querySelector('button[aria-label="Send"]') ||
                          document.querySelector('button[aria-label*="send" i]') ||
                          document.querySelector('span[data-icon="send"]')?.closest('button') ||
                          document.querySelector('span[data-icon="send-light"]')?.closest('button');

            if (sendBtn && !sendBtn.disabled) {
              sendBtn.click();
            } else {
              // Target message input
              const input = document.querySelector('footer div[contenteditable="true"]') ||
                            document.querySelector('div[data-lexical-editor="true"]');
              if (input) {
                input.focus();
                if (!input.textContent || input.textContent.trim().length === 0) {
                  document.execCommand('insertText', false, textToSend);
                  await sleep(200);
                }
                const enterEvt = new KeyboardEvent('keydown', {
                  key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
                });
                input.dispatchEvent(enterEvt);
                await sleep(200);
                const sb = document.querySelector('span[data-icon="send"]')?.closest('button') ||
                           document.querySelector('button[aria-label="Send"]');
                if (sb && !sb.disabled) {
                  sb.click();
                }
              }
            }

            // Verify if message was dispatched
            await sleep(800);
            const currentOutCount = document.querySelectorAll('div.message-out').length;
            const inputAfter = document.querySelector('footer div[contenteditable="true"]');
            const inputEmpty = !inputAfter || !inputAfter.textContent || inputAfter.textContent.trim().length === 0;

            if (currentOutCount > initialOutCount || inputEmpty) {
              return { success: true, attempts: attempt + 1 };
            }
          }

          return { success: false, reason: 'Could not confirm message dispatch' };
        })()
      `);

      if (sendResult?.success) {
        setStatusNotice(`✓ Test message sent successfully to +${clean}!`);
      } else if (sendResult?.notLoggedIn) {
        setStatusNotice('⚠️ WhatsApp Web is not logged in. Please scan QR code below or log in with phone number first.');
      } else if (sendResult?.invalidNumber) {
        setStatusNotice(`⚠️ Phone number +${clean} is not registered on WhatsApp.`);
      } else {
        setStatusNotice(`⚠️ Send status: ${sendResult?.reason || 'Could not verify delivery. Please check the chat below.'}`);
      }
    } catch (err: any) {
      console.error('Direct webview send error:', err);
      setStatusNotice(`Send error: ${err.message || err}`);
    } finally {
      setTimeout(() => setStatusNotice(null), 8000);
    }
  };

  // Switch to customer
  const handleSelectCustomer = (cust: Customer) => {
    setSelectedCustomerId(cust.id);
    const phone = cust.phone || cust.whatsapp || '';
    setRecipientPhone(phone);
    setShowCustomerDropdown(false);
  };

  // Previous / Next customer navigation
  const handleNavigateCustomer = (direction: 'prev' | 'next') => {
    if (filteredCustomers.length === 0) return;
    const currentIndex = filteredCustomers.findIndex(c => c.id === selectedCustomerId);
    let nextIndex = 0;
    if (direction === 'prev') {
      nextIndex = currentIndex <= 0 ? filteredCustomers.length - 1 : currentIndex - 1;
    } else {
      nextIndex = currentIndex >= filteredCustomers.length - 1 ? 0 : currentIndex + 1;
    }
    const nextCust = filteredCustomers[nextIndex];
    handleSelectCustomer(nextCust);
  };

  // Sample Test Message ('Hi')
  const handleSendTestHi = (phoneToSend?: string) => {
    const rawPhone = phoneToSend || recipientPhone || selectedCustomer?.phone || selectedCustomer?.whatsapp || '';
    let clean = rawPhone.replace(/[^0-9]/g, '');
    if (!clean) {
      setStatusNotice('Please select a customer or enter a mobile number to send the test message.');
      setTimeout(() => setStatusNotice(null), 4000);
      return;
    }
    const hiMsg = 'Hi! This is a test message from your POS software. WhatsApp connectivity is working successfully! 👍';
    setMessageText(hiMsg);
    handleSendViaWebview(clean, hiMsg);
  };

  // Quick Payment Reminder Template
  const handleSendPaymentReminder = () => {
    if (!selectedCustomer) return;
    const phone = selectedCustomer.phone || selectedCustomer.whatsapp || '';
    const dueRupees = ((selectedCustomer.outstanding_balance_paise || 0) / 100).toFixed(2);
    const reminderMsg = `Dear ${selectedCustomer.name},\nThis is a friendly reminder that your outstanding balance at our shop is ₹${dueRupees}.\nKindly arrange to clear the pending amount at your earliest convenience.\nThank you for your valued patronage! 🙏`;
    setMessageText(reminderMsg);
    handleSendViaWebview(phone, reminderMsg);
  };

  // Quick Add Customer Submission
  const handleQuickAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddCustomerError('');

    if (!newCustName.trim()) {
      setAddCustomerError('Customer name is required');
      return;
    }
    const cleanPhone = newCustPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setAddCustomerError('Please enter a valid 10-digit phone number');
      return;
    }

    try {
      const creditLimitPaise = newCustCreditLimit ? Math.round(parseFloat(newCustCreditLimit) * 100) : 0;
      const res: any = await createCustomerMutation.mutateAsync({
        name: newCustName.trim(),
        phone: cleanPhone,
        whatsapp: cleanPhone,
        category: newCustCategory,
        credit_allowed: creditLimitPaise > 0,
        credit_limit_paise: creditLimitPaise,
        status: 'active'
      });

      setShowAddCustomerModal(false);
      setNewCustName('');
      setNewCustPhone('');
      setNewCustCreditLimit('');
      setStatusNotice(`Customer ${newCustName} created successfully!`);
      setTimeout(() => setStatusNotice(null), 4000);

      await refetchCustomers();
      if (res?.data?.id) {
        setSelectedCustomerId(res.data.id);
        setRecipientPhone(cleanPhone);
      }
    } catch (err: any) {
      setAddCustomerError(err.message || 'Failed to create customer');
    }
  };

  // Broadcast Recipients
  const broadcastRecipients = useMemo(() => {
    return customers.filter(c => {
      const hasPhone = Boolean(c.phone || c.whatsapp);
      if (!hasPhone) return false;
      if (broadcastTarget === 'OUTSTANDING') return (c.outstanding_balance_paise || 0) > 0;
      if (broadcastTarget === 'WHOLESALE') return c.category?.toLowerCase() === 'wholesale';
      if (broadcastTarget === 'RETAIL') return c.category?.toLowerCase() === 'retail';
      return true;
    });
  }, [customers, broadcastTarget]);

  // Send next broadcast item
  const handleSendNextBroadcast = () => {
    if (broadcastIndex >= broadcastRecipients.length) {
      setIsBroadcasting(false);
      setStatusNotice('Broadcast completed for all recipients!');
      setTimeout(() => setStatusNotice(null), 5000);
      return;
    }

    const recipient = broadcastRecipients[broadcastIndex];
    const phone = recipient.phone || recipient.whatsapp || '';
    const dueAmount = ((recipient.outstanding_balance_paise || 0) / 100).toFixed(2);
    
    // Replace template variables
    const formatted = broadcastMessage
      .replace(/{name}/gi, recipient.name)
      .replace(/{outstanding}/gi, `₹${dueAmount}`)
      .replace(/{phone}/gi, phone);

    handleSendViaWebview(phone, formatted);
    setBroadcastIndex(prev => prev + 1);
  };

  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    const handleDidFinishLoad = () => {
      setIsLoading(false);

      if (!pendingSendRef.current) {
        // Normal load, QR scan, or chat sync — DO NOT inject or click anything!
        return;
      }

      // Auto-send is pending for this specific chat
      try {
        wv.executeJavaScript(`
          (() => {
            let attempts = 0;
            const maxAttempts = 30; // 15 seconds max
            const timer = setInterval(() => {
              attempts++;

              // 1. Look for send button
              const sendBtn = 
                document.querySelector('button[aria-label="Send"]') ||
                document.querySelector('button[aria-label*="send" i]') ||
                document.querySelector('span[data-icon="send"]')?.closest('button');

              if (sendBtn && !sendBtn.disabled) {
                sendBtn.click();
                clearInterval(timer);
                return;
              }

              // 2. Look for message input with text and dispatch Enter key
              const activeInput = document.querySelector('footer div[contenteditable="true"]');
              if (activeInput && activeInput.textContent && activeInput.textContent.trim().length > 0) {
                const enterEvent = new KeyboardEvent('keydown', {
                  key: 'Enter',
                  code: 'Enter',
                  keyCode: 13,
                  which: 13,
                  bubbles: true,
                  cancelable: true
                });
                activeInput.dispatchEvent(enterEvent);

                setTimeout(() => {
                  const sb = document.querySelector('span[data-icon="send"]')?.closest('button');
                  if (sb && !sb.disabled) {
                    sb.click();
                  }
                }, 300);

                clearInterval(timer);
                return;
              }

              if (attempts >= maxAttempts) {
                clearInterval(timer);
              }
            }, 500);
          })()
        `).then(() => {
          setTimeout(() => {
            pendingSendRef.current = false;
          }, 15000);
        }).catch(() => {
          pendingSendRef.current = false;
        });
      } catch (e) {
        pendingSendRef.current = false;
      }
    };

    const handleDidFailLoad = () => {
      setIsLoading(false);
      pendingSendRef.current = false;
    };

    wv.addEventListener('did-finish-load', handleDidFinishLoad);
    wv.addEventListener('did-fail-load', handleDidFailLoad);

    return () => {
      try {
        wv.removeEventListener('did-finish-load', handleDidFinishLoad);
        wv.removeEventListener('did-fail-load', handleDidFailLoad);
      } catch (e) {}
    };
  }, []);

  // Coordinate background worker with visible webview so both don't conflict over active session
  useEffect(() => {
    window.api?.invoke(IPC_CHANNELS.WHATSAPP.PAUSE_BACKGROUND).catch(() => {});
    return () => {
      window.api?.invoke(IPC_CHANNELS.WHATSAPP.RESUME_BACKGROUND).catch(() => {});
    };
  }, []);

  return (
    <div className="flex flex-col h-full w-full bg-surface-app overflow-hidden select-none">
      {/* ─── Compact Top Section: Customer Navigation, Filter & Action Ribbon ─── */}
      <div className="bg-surface-panel border-b border-border-subtle px-3 py-2 shrink-0 flex flex-col gap-2">
        {/* Top Control Line */}
        <div className="flex items-center justify-between gap-3">
          {/* Left: Branding & Quick Filter Chips */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-xs">
              <MessageSquare size={15} />
            </div>
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-text-primary flex items-center gap-1.5">
                WhatsApp POS Console
                <span className="text-[8px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  DIRECT
                </span>
              </span>
            </div>

            <div className="h-4 w-px bg-border-subtle mx-1" />

            {/* Filter Pills */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCustomerFilter('ALL')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  customerFilter === 'ALL'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-surface-card hover:bg-surface-hover text-text-secondary border border-border-subtle'
                }`}
              >
                All ({customers.length})
              </button>
              <button
                type="button"
                onClick={() => setCustomerFilter('OUTSTANDING')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-all ${
                  customerFilter === 'OUTSTANDING'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-surface-card hover:bg-surface-hover text-rose-400 border border-border-subtle'
                }`}
              >
                <DollarSign size={11} />
                <span>Outstanding ({customers.filter(c => (c.outstanding_balance_paise || 0) > 0).length})</span>
              </button>
              <button
                type="button"
                onClick={() => setCustomerFilter('WHOLESALE')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  customerFilter === 'WHOLESALE'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-surface-card hover:bg-surface-hover text-text-secondary border border-border-subtle'
                }`}
              >
                Wholesale
              </button>
              <button
                type="button"
                onClick={() => setCustomerFilter('RETAIL')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  customerFilter === 'RETAIL'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-surface-card hover:bg-surface-hover text-text-secondary border border-border-subtle'
                }`}
              >
                Retail
              </button>
            </div>
          </div>

          {/* Right Tools: Quick Add Customer & Broadcast */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddCustomerModal(true)}
              className="px-2.5 py-1 bg-surface-card hover:bg-surface-hover text-emerald-400 border border-emerald-500/30 hover:border-emerald-500/60 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
              title="Add New Customer"
            >
              <Plus size={13} className="text-emerald-400" />
              <span>+ Quick Add Customer</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setBroadcastIndex(0);
                setIsBroadcasting(false);
                setShowBroadcastModal(true);
              }}
              className="px-2.5 py-1 bg-surface-card hover:bg-surface-hover text-cyan-400 border border-cyan-500/30 hover:border-cyan-500/60 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
              title="Send Broadcast Message"
            >
              <Megaphone size={13} className="text-cyan-400" />
              <span>Broadcast</span>
            </button>

            <button
              type="button"
              onClick={() => handleSendTestHi()}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
              title="Send a sample test 'Hi' message to verify WhatsApp sending"
            >
              <Sparkles size={12} />
              <span>Send Test &apos;Hi&apos;</span>
            </button>

            <button
              type="button"
              onClick={handleReload}
              className="p-1 bg-surface-card hover:bg-surface-hover border border-border-subtle rounded-lg text-text-secondary transition-all"
              title="Reload WhatsApp Web"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            </button>

            <button
              type="button"
              onClick={handleResetSession}
              disabled={isClearingSession}
              className="px-2 py-1 bg-surface-card hover:bg-rose-500/10 hover:border-rose-500/30 border border-border-subtle rounded-lg text-text-secondary hover:text-rose-400 text-xs font-semibold flex items-center gap-1 transition-all"
              title="Clear WhatsApp cache and re-scan QR code if session got stuck or disconnected"
            >
              <RotateCcw size={12} className={isClearingSession ? 'animate-spin' : ''} />
              <span>Re-link / Reset</span>
            </button>
          </div>
        </div>

        {/* Customer Selector & Active Customer Details Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Customer Search & Picker with Dropdown */}
          <div className="relative">
            <div className="flex items-center bg-surface-card border border-border-subtle rounded-lg px-2 py-1 w-64 focus-within:border-emerald-500 transition-colors">
              <Search size={13} className="text-text-muted mr-1.5 shrink-0" />
              <input
                type="text"
                placeholder="Search or pick customer..."
                value={customerSearchQuery}
                onFocus={() => setShowCustomerDropdown(true)}
                onChange={(e) => {
                  setCustomerSearchQuery(e.target.value);
                  setShowCustomerDropdown(true);
                }}
                className="bg-transparent text-xs text-text-primary outline-none w-full"
              />
              {customerSearchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomerSearchQuery('');
                    setShowCustomerDropdown(false);
                  }}
                  className="text-text-muted hover:text-text-primary"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Dropdown Menu */}
            {showCustomerDropdown && (
              <div 
                className="absolute z-50 left-0 top-full mt-1 w-80 bg-surface-card border border-border-subtle rounded-xl shadow-xl max-h-64 overflow-y-auto"
                onMouseLeave={() => setShowCustomerDropdown(false)}
              >
                <div className="px-3 py-1.5 border-b border-border-subtle text-[10px] font-bold text-text-muted uppercase flex justify-between">
                  <span>Filtered Customers ({filteredCustomers.length})</span>
                  <button onClick={() => setShowCustomerDropdown(false)} className="hover:text-text-primary">
                    <X size={11} />
                  </button>
                </div>
                {filteredCustomers.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-text-muted">
                    No matching customers found
                  </div>
                ) : (
                  filteredCustomers.map(c => {
                    const balance = (c.outstanding_balance_paise || 0) / 100;
                    return (
                      <div
                        key={c.id}
                        onClick={() => handleSelectCustomer(c)}
                        className={`px-3 py-2 border-b border-border-subtle/40 hover:bg-surface-hover cursor-pointer flex items-center justify-between text-xs transition-colors ${
                          c.id === selectedCustomerId ? 'bg-emerald-500/10 text-emerald-400 font-bold' : 'text-text-primary'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold truncate">{c.name}</div>
                          <div className="text-[10px] text-text-muted font-mono">{c.phone || c.whatsapp || 'No Phone'}</div>
                        </div>
                        <div className="text-right shrink-0">
                          {balance > 0 ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              ₹{balance.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-emerald-500 font-bold">
                              ₹0.00
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Stepper Buttons (Prev / Next customer) */}
          <div className="flex items-center gap-1 bg-surface-card border border-border-subtle rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => handleNavigateCustomer('prev')}
              className="p-1 hover:bg-surface-hover text-text-muted hover:text-text-primary rounded"
              title="Previous Customer"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-[10px] font-mono font-bold px-1.5 text-text-secondary">
              {filteredCustomers.findIndex(c => c.id === selectedCustomerId) + 1} / {filteredCustomers.length}
            </span>
            <button
              type="button"
              onClick={() => handleNavigateCustomer('next')}
              className="p-1 hover:bg-surface-hover text-text-muted hover:text-text-primary rounded"
              title="Next Customer"
            >
              <ChevronRight size={13} />
            </button>
          </div>

          {/* Selected Customer Card Details */}
          {selectedCustomer ? (
            <div className="flex items-center gap-2 bg-surface-card/60 border border-border-subtle rounded-lg px-2.5 py-1 flex-1 min-w-[280px]">
              <div className="min-w-0 flex-1 flex items-center gap-2">
                <span className="text-xs font-bold text-text-primary truncate">
                  {selectedCustomer.name}
                </span>
                <span className="text-[10px] font-mono text-text-muted">
                  ({selectedCustomer.phone || selectedCustomer.whatsapp || 'No Phone'})
                </span>

                {/* Outstanding Badge */}
                {(selectedCustomer.outstanding_balance_paise || 0) > 0 ? (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1 shrink-0">
                    <AlertCircle size={10} />
                    <span>Due: ₹{((selectedCustomer.outstanding_balance_paise || 0) / 100).toFixed(2)}</span>
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 shrink-0">
                    <CheckCircle2 size={10} />
                    <span>Paid (₹0.00)</span>
                  </span>
                )}
              </div>

              {/* Action Buttons for Selected Customer */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleSendTestHi(selectedCustomer.phone || selectedCustomer.whatsapp || '')}
                  className="px-2 py-1 bg-teal-600/30 hover:bg-teal-600/50 text-teal-300 border border-teal-500/40 rounded text-[11px] font-bold flex items-center gap-1 transition-all"
                  title="Send a sample test 'Hi' message to this customer"
                >
                  <Sparkles size={11} />
                  <span>Test &apos;Hi&apos;</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendViaWebview(selectedCustomer.phone || selectedCustomer.whatsapp || '')}
                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold flex items-center gap-1 transition-all"
                  title="Open Chat in WhatsApp"
                >
                  <Send size={11} />
                  <span>Chat</span>
                </button>

                {(selectedCustomer.outstanding_balance_paise || 0) > 0 && (
                  <button
                    type="button"
                    onClick={handleSendPaymentReminder}
                    className="px-2 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded text-[11px] font-bold flex items-center gap-1 transition-all"
                    title="Send Payment Reminder"
                  >
                    <DollarSign size={11} />
                    <span>Send Reminder</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs text-text-muted italic px-2">
              Select a customer to view details & open chat
            </div>
          )}
        </div>
      </div>

      {statusNotice && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/30 px-4 py-1.5 text-xs text-emerald-400 font-bold flex items-center gap-2 shrink-0 animate-fadeIn">
          <ShieldCheck size={14} />
          <span>{statusNotice}</span>
        </div>
      )}

      {/* ─── Embedded Webview Container ─── */}
      <div className="flex-1 w-full h-full relative bg-[#111b21]">
        {/* @ts-ignore */}
        <webview
          ref={webviewRef}
          src={initialWebviewUrl}
          partition="persist:whatsapp"
          useragent={userAgentString}
          // @ts-ignore
          allowpopups="true"
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      </div>

      {/* ─── Quick Add Customer Modal ─── */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-panel border border-border-subtle rounded-2xl w-full max-w-md p-5 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
                  <User size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text-primary">Quick Add Customer</h3>
                  <p className="text-[10px] text-text-muted">Register customer directly into POS</p>
                </div>
              </div>
              <button 
                onClick={() => setShowAddCustomerModal(false)}
                className="text-text-muted hover:text-text-primary p-1"
              >
                <X size={16} />
              </button>
            </div>

            {addCustomerError && (
              <div className="mb-3 px-3 py-2 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-400 font-medium flex items-center gap-1.5">
                <AlertCircle size={14} />
                <span>{addCustomerError}</span>
              </div>
            )}

            <form onSubmit={handleQuickAddCustomer} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Customer Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-card border border-border-subtle rounded-lg text-xs text-text-primary outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Mobile / WhatsApp Number *</label>
                <input
                  type="tel"
                  required
                  maxLength={10}
                  placeholder="10-digit number (e.g. 9876543210)"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3 py-2 bg-surface-card border border-border-subtle rounded-lg text-xs font-mono text-text-primary outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1">Category</label>
                  <select
                    value={newCustCategory}
                    onChange={(e) => setNewCustCategory(e.target.value as CustomerCategory)}
                    className="w-full px-3 py-2 bg-surface-card border border-border-subtle rounded-lg text-xs text-text-primary outline-none focus:border-emerald-500"
                  >
                    <option value="Retail">Retail</option>
                    <option value="Wholesale">Wholesale</option>
                    <option value="Hotel">Hotel</option>
                    <option value="Restaurant">Restaurant</option>
                    <option value="Catering">Catering</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1">Credit Limit (₹)</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={newCustCreditLimit}
                    onChange={(e) => setNewCustCreditLimit(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-card border border-border-subtle rounded-lg text-xs font-mono text-text-primary outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border-subtle mt-4">
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="px-4 py-2 bg-surface-card hover:bg-surface-hover text-text-secondary rounded-lg text-xs font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createCustomerMutation.isPending}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs disabled:opacity-50"
                >
                  {createCustomerMutation.isPending ? 'Saving...' : 'Save & Select'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Broadcast Message Modal ─── */}
      {showBroadcastModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-panel border border-border-subtle rounded-2xl w-full max-w-lg p-5 shadow-2xl animate-scaleUp flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-cyan-600/20 text-cyan-400 flex items-center justify-center">
                  <Megaphone size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text-primary">WhatsApp Broadcast Dispatcher</h3>
                  <p className="text-[10px] text-text-muted">Send customized updates or reminders to your customer base</p>
                </div>
              </div>
              <button 
                onClick={() => setShowBroadcastModal(false)}
                className="text-text-muted hover:text-text-primary p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto flex-1 pr-1">
              {/* Audience Target */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5">Target Audience</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBroadcastTarget('ALL')}
                    className={`px-3 py-2 rounded-lg text-xs font-bold text-left border transition-all ${
                      broadcastTarget === 'ALL'
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                        : 'bg-surface-card border-border-subtle text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    <div>All Customers</div>
                    <div className="text-[10px] font-normal text-text-muted mt-0.5">
                      {customers.filter(c => Boolean(c.phone || c.whatsapp)).length} recipients
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBroadcastTarget('OUTSTANDING')}
                    className={`px-3 py-2 rounded-lg text-xs font-bold text-left border transition-all ${
                      broadcastTarget === 'OUTSTANDING'
                        ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                        : 'bg-surface-card border-border-subtle text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    <div>Pending Outstanding</div>
                    <div className="text-[10px] font-normal text-rose-400 mt-0.5">
                      {customers.filter(c => (c.outstanding_balance_paise || 0) > 0 && Boolean(c.phone || c.whatsapp)).length} recipients
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBroadcastTarget('WHOLESALE')}
                    className={`px-3 py-2 rounded-lg text-xs font-bold text-left border transition-all ${
                      broadcastTarget === 'WHOLESALE'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                        : 'bg-surface-card border-border-subtle text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    <div>Wholesale Buyers</div>
                    <div className="text-[10px] font-normal text-text-muted mt-0.5">
                      {customers.filter(c => c.category?.toLowerCase() === 'wholesale' && Boolean(c.phone || c.whatsapp)).length} recipients
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBroadcastTarget('RETAIL')}
                    className={`px-3 py-2 rounded-lg text-xs font-bold text-left border transition-all ${
                      broadcastTarget === 'RETAIL'
                        ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                        : 'bg-surface-card border-border-subtle text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    <div>Retail Walk-in</div>
                    <div className="text-[10px] font-normal text-text-muted mt-0.5">
                      {customers.filter(c => c.category?.toLowerCase() === 'retail' && Boolean(c.phone || c.whatsapp)).length} recipients
                    </div>
                  </button>
                </div>
              </div>

              {/* Quick Template Fillers */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Quick Templates</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setBroadcastMessage('Dear {name},\nWarm greetings! Wishing you and your family a joyful festive season! May this festival bring health, wealth, and prosperity. ✨🙏')}
                    className="px-2 py-1 bg-surface-card hover:bg-surface-hover border border-border-subtle rounded text-[10px] font-semibold text-text-secondary flex items-center gap-1"
                  >
                    <Sparkles size={10} className="text-amber-400" />
                    <span>Festive Wishes</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBroadcastMessage('Dear {name},\nFresh stock of Country Chicken, Tender Mutton, and Farm Eggs arrived today! Visit our store or reply here for fast home delivery. 🍗🥩')}
                    className="px-2 py-1 bg-surface-card hover:bg-surface-hover border border-border-subtle rounded text-[10px] font-semibold text-text-secondary"
                  >
                    <span>Fresh Stock Arrival</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBroadcastMessage('Dear {name},\nThis is a friendly reminder that your outstanding account balance is {outstanding}. Kindly arrange payment at your earliest convenience. Thank you!')}
                    className="px-2 py-1 bg-surface-card hover:bg-surface-hover border border-border-subtle rounded text-[10px] font-semibold text-text-secondary"
                  >
                    <span>Outstanding Reminder</span>
                  </button>
                </div>
              </div>

              {/* Message Composer */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-text-secondary">Message Text</label>
                  <span className="text-[10px] text-text-muted">Placeholders: <code>{'{name}'}</code>, <code>{'{outstanding}'}</code></span>
                </div>
                <textarea
                  rows={4}
                  placeholder="Type your message here..."
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-card border border-border-subtle rounded-lg text-xs text-text-primary outline-none focus:border-cyan-500 font-sans leading-relaxed"
                />
              </div>

              {/* Broadcast Progress Tracker */}
              {isBroadcasting && (
                <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-cyan-300">
                      Sending: {broadcastIndex} of {broadcastRecipients.length}
                    </span>
                    <span className="text-[10px] text-text-muted">
                      {Math.round((broadcastIndex / (broadcastRecipients.length || 1)) * 100)}% Completed
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-surface-card rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-cyan-500 transition-all duration-300"
                      style={{ width: `${(broadcastIndex / (broadcastRecipients.length || 1)) * 100}%` }}
                    />
                  </div>
                  {broadcastIndex < broadcastRecipients.length && (
                    <div className="text-[11px] text-text-secondary">
                      Next Recipient: <strong className="text-text-primary">{broadcastRecipients[broadcastIndex].name}</strong> ({broadcastRecipients[broadcastIndex].phone || broadcastRecipients[broadcastIndex].whatsapp})
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-border-subtle mt-4 shrink-0">
              <span className="text-xs text-text-muted">
                {broadcastRecipients.length} recipients selected
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowBroadcastModal(false)}
                  className="px-3 py-1.5 bg-surface-card hover:bg-surface-hover text-text-secondary rounded-lg text-xs font-semibold"
                >
                  Close
                </button>

                {!isBroadcasting ? (
                  <button
                    type="button"
                    disabled={broadcastRecipients.length === 0 || !broadcastMessage.trim()}
                    onClick={() => {
                      setIsBroadcasting(true);
                      setBroadcastIndex(0);
                    }}
                    className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Send size={13} />
                    <span>Start Broadcast</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setBroadcastIndex(prev => prev + 1)}
                      className="px-2.5 py-1.5 bg-surface-card hover:bg-surface-hover text-text-secondary rounded-lg text-xs font-semibold"
                    >
                      Skip
                    </button>
                    <button
                      type="button"
                      onClick={handleSendNextBroadcast}
                      className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                    >
                      <Send size={13} />
                      <span>
                        {broadcastIndex >= broadcastRecipients.length - 1 ? 'Send Final' : 'Send & Next'}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsAppView;

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, QrCode, RefreshCw, X, ExternalLink } from 'lucide-react';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';

export interface WhatsAppToast {
  id: string;
  type: 'success' | 'failed' | 'login_required';
  title: string;
  message: string;
  queueId?: number;
  invoiceId?: number;
  phone?: string;
  createdAt: number;
  autoDismissMs?: number;
}

export const WhatsAppToastManager: React.FC = () => {
  const [toasts, setToasts] = useState<WhatsAppToast[]>([]);
  const [retryingIds, setRetryingIds] = useState<Set<number>>(new Set());
  const navigate = useNavigate();

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    if (!window.api?.on) return;

    const unsubSuccess = window.api.on(
      IPC_CHANNELS.WHATSAPP.EVENT_SEND_SUCCESS,
      (data: { queueId: number; invoiceId?: number; phone: string; messageType?: string }) => {
        const id = `success_${data.queueId}_${Date.now()}`;
        const cleanPhone = data.phone.replace(/^91/, '');
        const invText = data.invoiceId ? `Bill #${data.invoiceId}` : 'Message';
        const typeText = data.messageType === 'delivery_notice' ? 'Delivery notice' : 'Receipt';

        setToasts((prev) => [
          ...prev.filter((t) => !(t.queueId === data.queueId && t.type === 'failed')),
          {
            id,
            type: 'success',
            title: 'WhatsApp Sent Successfully',
            message: `${typeText} for ${invText} sent to +91 ${cleanPhone}`,
            queueId: data.queueId,
            invoiceId: data.invoiceId,
            phone: data.phone,
            createdAt: Date.now(),
            autoDismissMs: 3500,
          },
        ]);
      }
    );

    const unsubFailed = window.api.on(
      IPC_CHANNELS.WHATSAPP.EVENT_SEND_FAILED,
      (data: { queueId: number; invoiceId?: number; phone: string; reason: string }) => {
        const id = `failed_${data.queueId}_${Date.now()}`;
        const cleanPhone = data.phone.replace(/^91/, '');
        const invText = data.invoiceId ? `Bill #${data.invoiceId}` : 'Bill';

        setToasts((prev) => [
          ...prev.filter((t) => t.queueId !== data.queueId),
          {
            id,
            type: 'failed',
            title: 'WhatsApp Delivery Failed',
            message: `${invText} to +91 ${cleanPhone} could not be delivered. Reason: ${data.reason}`,
            queueId: data.queueId,
            invoiceId: data.invoiceId,
            phone: data.phone,
            createdAt: Date.now(),
          },
        ]);
      }
    );

    const unsubLogin = window.api.on(
      IPC_CHANNELS.WHATSAPP.EVENT_LOGIN_REQUIRED,
      (data: { queueId?: number; invoiceId?: number; phone?: string }) => {
        const id = `login_${Date.now()}`;
        setToasts((prev) => {
          if (prev.some((t) => t.type === 'login_required')) return prev;
          return [
            ...prev,
            {
              id,
              type: 'login_required',
              title: 'WhatsApp Not Linked',
              message: 'Background dispatch is waiting. Please open WhatsApp tab and link via QR code once.',
              queueId: data?.queueId,
              invoiceId: data?.invoiceId,
              createdAt: Date.now(),
            },
          ];
        });
      }
    );

    return () => {
      unsubSuccess();
      unsubFailed();
      unsubLogin();
    };
  }, []);

  const handleRetry = async (toast: WhatsAppToast) => {
    if (!toast.queueId || retryingIds.has(toast.queueId)) return;

    setRetryingIds((prev) => new Set(prev).add(toast.queueId!));

    try {
      const res = await window.api.invoke(IPC_CHANNELS.WHATSAPP.RETRY_QUEUE_ITEM, { id: toast.queueId });
      if (res?.success) {
        removeToast(toast.id);
      }
    } catch {
      // Keep toast if retry invoke fails
    } finally {
      setRetryingIds((prev) => {
        const next = new Set(prev);
        next.delete(toast.queueId!);
        return next;
      });
    }
  };

  const handleOpenWhatsAppTab = (toastId: string) => {
    removeToast(toastId);
    navigate('/settings');
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none select-none">
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isFailed = toast.type === 'failed';
        const isLogin = toast.type === 'login_required';

        return (
          <ToastCard
            key={toast.id}
            toast={toast}
            isSuccess={isSuccess}
            isFailed={isFailed}
            isLogin={isLogin}
            isRetrying={toast.queueId ? retryingIds.has(toast.queueId) : false}
            onClose={() => removeToast(toast.id)}
            onRetry={() => handleRetry(toast)}
            onOpenWhatsApp={() => handleOpenWhatsAppTab(toast.id)}
          />
        );
      })}
    </div>
  );
};

interface ToastCardProps {
  toast: WhatsAppToast;
  isSuccess: boolean;
  isFailed: boolean;
  isLogin: boolean;
  isRetrying: boolean;
  onClose: () => void;
  onRetry: () => void;
  onOpenWhatsApp: () => void;
}

const ToastCard: React.FC<ToastCardProps> = ({
  toast,
  isSuccess,
  isFailed,
  isLogin,
  isRetrying,
  onClose,
  onRetry,
  onOpenWhatsApp,
}) => {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!toast.autoDismissMs) return;

    const interval = 50;
    const step = (interval / toast.autoDismissMs) * 100;
    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev - step;
        if (next <= 0) {
          clearInterval(timer);
          onClose();
          return 0;
        }
        return next;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [toast.autoDismissMs, onClose]);

  let borderStyle = 'border-emerald-500/50 bg-zinc-900/95 shadow-emerald-500/10';
  let icon = <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />;

  if (isFailed) {
    borderStyle = 'border-rose-500/60 bg-zinc-900/95 shadow-rose-500/10';
    icon = <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />;
  } else if (isLogin) {
    borderStyle = 'border-amber-500/60 bg-zinc-900/95 shadow-amber-500/10';
    icon = <QrCode className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />;
  }

  return (
    <div
      className={`pointer-events-auto relative overflow-hidden rounded-xl border p-4 shadow-xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-5 ${borderStyle}`}
    >
      <div className="flex items-start gap-3">
        {icon}
        <div className="flex-1 min-w-0 pr-2">
          <h4 className="text-sm font-semibold text-white tracking-wide">{toast.title}</h4>
          <p className="mt-1 text-xs text-zinc-300 leading-relaxed break-words">{toast.message}</p>

          {isFailed && toast.queueId && (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={onRetry}
                disabled={isRetrying}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 rounded-lg transition-colors shadow-sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                {isRetrying ? 'Retrying...' : 'Retry Sending Now'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-800/60 transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}

          {isLogin && (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenWhatsApp}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-900 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors shadow-sm"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open WhatsApp Tab to Scan QR
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-800/60 transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-200 p-1 rounded-md hover:bg-zinc-800/80 transition-colors shrink-0"
          title="Close notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {toast.autoDismissMs && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800">
          <div
            className="h-full bg-emerald-500 transition-all duration-75 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
};

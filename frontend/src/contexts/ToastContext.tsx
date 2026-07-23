import { AlertCircle, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type ToastKind = 'error' | 'success' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  error: (message: string) => void;
  success: (message: string) => void;
  info: (message: string) => void;
}

const noop = () => {};
const ToastContext = createContext<ToastContextValue>({ error: noop, success: noop, info: noop });

export const useToast = () => useContext(ToastContext);

const KIND_STYLES: Record<ToastKind, { border: string; icon: JSX.Element }> = {
  error: { border: 'border-l-danger', icon: <AlertCircle size={18} className="text-danger shrink-0" /> },
  success: { border: 'border-l-ok', icon: <CheckCircle2 size={18} className="text-ok shrink-0" /> },
  info: { border: 'border-l-warn', icon: <AlertTriangle size={18} className="text-warn shrink-0" /> },
};

const DURATION_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => dismiss(id), DURATION_MS);
  }, [dismiss]);

  const value: ToastContextValue = {
    error: (message) => push('error', message),
    success: (message) => push('success', message),
    info: (message) => push('info', message),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className={`card border-l-4 ${KIND_STYLES[t.kind].border} shadow-lg p-3.5 flex items-start gap-2.5 pointer-events-auto toast-enter`}
          >
            {KIND_STYLES[t.kind].icon}
            <p className="text-sm text-ink flex-1 min-w-0 break-words">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="text-faint hover:text-ink transition-colors shrink-0"
              aria-label="Fechar aviso"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

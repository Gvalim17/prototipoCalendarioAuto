import { AlertTriangle } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ConfirmOptions {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(false));

export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<(value: boolean) => void>();

  const confirm = useCallback<ConfirmFn>((options) => {
    const normalized = typeof options === 'string' ? { message: options } : options;
    setPending(normalized);
    return new Promise<boolean>((resolve) => { resolveRef.current = resolve; });
  }, []);

  const settle = (value: boolean) => {
    resolveRef.current?.(value);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm">
          <div className="card w-full max-w-sm p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${pending.danger ? 'bg-danger/10 text-danger' : 'bg-accent/10 text-accent'}`}>
                <AlertTriangle size={18} />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-ink">{pending.title || 'Confirmar ação'}</h3>
                <p className="text-sm text-muted mt-1 whitespace-pre-line">{pending.message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => settle(false)} className="btn-ghost h-10 px-4">
                {pending.cancelLabel || 'Cancelar'}
              </button>
              <button
                onClick={() => settle(true)}
                className={pending.danger ? 'btn-danger h-10 px-4' : 'btn-primary h-10 px-4'}
              >
                {pending.confirmLabel || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

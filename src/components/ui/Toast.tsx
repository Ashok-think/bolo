import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

type ToastKind = 'success' | 'error';

interface ToastState {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<(kind: ToastKind, message: string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);

  const show = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now();
    setToast({ id, kind, message });
    window.setTimeout(() => {
      setToast((cur) => (cur?.id === id ? null : cur));
    }, 3200);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-50 px-4 w-full max-w-sm pointer-events-none">
          <div
            role="status"
            className={`toast-in flex items-center gap-2.5 px-4 py-3 rounded-full shadow-card text-sm font-medium ${
              toast.kind === 'success'
                ? 'bg-primary text-white'
                : 'bg-danger text-white'
            }`}
          >
            {toast.kind === 'success' ? (
              <CheckCircle2 size={18} className="shrink-0" />
            ) : (
              <AlertCircle size={18} className="shrink-0" />
            )}
            <span className="truncate">{toast.message}</span>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

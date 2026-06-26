import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { Icon, type IconName } from "../components/ui/Icon";

export type ToastVariant = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastVariant, IconName> = {
  success: "check",
  error: "x",
  info: "info",
  warning: "alert-triangle",
};

const COLORS: Record<ToastVariant, string> = {
  success:
    "bg-success/10 border-success/30 text-success dark:bg-success/20",
  error:
    "bg-danger/10 border-danger/30 text-danger dark:bg-danger/20",
  info: "bg-info/10 border-info/30 text-info dark:bg-info/20",
  warning:
    "bg-warning/10 border-warning/30 text-warning dark:bg-warning/20",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, variant: ToastVariant, duration = 3500) => {
      const id = `toast-${++counterRef.current}`;
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss]
  );

  // Identità stabile: evita che effetti con `toast` nelle dipendenze rigirino a ogni render.
  const ctx: ToastContextValue = useMemo(() => ({
    success: (m) => push(m, "success"),
    error: (m) => push(m, "error"),
    info: (m) => push(m, "info"),
    warning: (m) => push(m, "warning"),
  }), [push]);

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {/* Toast container */}
      <div
        aria-live="polite"
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-semibold shadow-2 animate-fadeIn max-w-xs ${COLORS[t.variant]}`}
          >
            <span className="leading-none">
              <Icon name={ICONS[t.variant]} className="w-4 h-4" />
            </span>
            <span className="flex-1 text-ink dark:text-paper font-body">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="ml-2 opacity-50 hover:opacity-100 transition-opacity text-ink dark:text-paper"
              aria-label="Chiudi notifica"
            >
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

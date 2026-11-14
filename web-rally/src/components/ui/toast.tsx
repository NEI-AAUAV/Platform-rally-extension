/* eslint-disable react-refresh/only-export-components -- file exports context hooks with provider */
import React, { createContext, useContext, useState, useCallback } from "react";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  toasts: Toast[];
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback(
    (message: string, type: ToastType = "info", duration: number = 5000) => {
      const id = crypto.randomUUID();
      const newToast: Toast = { id, message, type, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((toast) => toast.id !== id));
        }, duration);
      }
    },
    [],
  );

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast, toasts }}>
      {children}
      {/* Persistent polite region: dynamically inserted role="status" nodes are
          announced unreliably, so the container owns the live region. Errors and
          warnings still interrupt via role="alert". */}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed bottom-0 left-0 right-0 z-50 flex flex-col-reverse items-stretch gap-2 p-4 sm:left-auto sm:items-end"
      >
        {toasts.map((toast) => (
          <ToastComponent key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

const ToastComponent: React.FC<{ toast: Toast; onClose: () => void }> = ({ toast, onClose }) => {
  const { type, message } = toast;

  // Status tokens are tuned so white text clears 4.5:1 (WCAG 1.4.3) in both themes.
  const config = {
    success: { bg: "bg-success", border: "border-success", icon: CheckCircle },
    error: { bg: "bg-destructive", border: "border-destructive", icon: AlertCircle },
    warning: { bg: "bg-warning", border: "border-warning", icon: AlertTriangle },
    info: { bg: "bg-info", border: "border-info", icon: Info },
  };

  const { bg, border, icon: Icon } = config[type];
  const isUrgent = type === "error" || type === "warning";

  return (
    <div
      role={isUrgent ? "alert" : "status"}
      aria-atomic="true"
      className={`w-full sm:w-auto sm:min-w-[300px] sm:max-w-[500px] ${bg} border ${border} pointer-events-auto rounded-lg p-4 shadow-lg animate-in slide-in-from-bottom-2`}
    >
      <div className="flex items-start gap-3">
        <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 flex-shrink-0 text-white" />
        <p className="flex-1 text-sm font-medium text-white">{message}</p>
        <button
          type={"button"}
          onClick={onClose}
          aria-label="Fechar notificação"
          className="-m-2 flex-shrink-0 rounded-md p-2 text-white/80 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

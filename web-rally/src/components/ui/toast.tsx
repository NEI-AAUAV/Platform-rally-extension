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
      <div className="pointer-events-none fixed bottom-0 right-0 z-50 flex flex-col-reverse gap-2 p-4">
        {toasts.map((toast) => (
          <ToastComponent key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

const ToastComponent: React.FC<{ toast: Toast; onClose: () => void }> = ({ toast, onClose }) => {
  const { type, message } = toast;

  const config = {
    success: {
      bg: "bg-success",
      border: "border-success",
      icon: CheckCircle,
      iconColor: "text-success-ink",
    },
    error: {
      bg: "bg-destructive",
      border: "border-destructive",
      icon: AlertCircle,
      iconColor: "text-destructive-ink",
    },
    warning: {
      bg: "bg-warning",
      border: "border-warning",
      icon: AlertTriangle,
      iconColor: "text-warning-ink",
    },
    info: {
      bg: "bg-info",
      border: "border-info",
      icon: Info,
      iconColor: "text-info-ink",
    },
  };

  const { bg, border, icon: Icon, iconColor } = config[type];

  return (
    <div
      className={`min-w-[300px] max-w-[500px] ${bg} border ${border} pointer-events-auto rounded-lg p-4 shadow-lg animate-in slide-in-from-bottom-2`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 ${iconColor} mt-0.5 flex-shrink-0`} />
        <p className="flex-1 text-sm font-medium text-white">{message}</p>
        <button
          type={"button"}
          onClick={onClose}
          className="flex-shrink-0 text-white/70 transition-colors hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

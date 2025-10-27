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

  const showToast = useCallback((message: string, type: ToastType = "info", duration: number = 5000) => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const newToast: Toast = { id, message, type, duration };

    setToasts((prev) => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast, toasts }}>
      {children}
      <div className="fixed bottom-0 right-0 z-50 flex flex-col-reverse gap-2 p-4 pointer-events-none">
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
      bg: "bg-green-600",
      border: "border-green-500",
      icon: CheckCircle,
      iconColor: "text-green-300",
    },
    error: {
      bg: "bg-red-600",
      border: "border-red-500",
      icon: AlertCircle,
      iconColor: "text-red-300",
    },
    warning: {
      bg: "bg-yellow-600",
      border: "border-yellow-500",
      icon: AlertTriangle,
      iconColor: "text-yellow-300",
    },
    info: {
      bg: "bg-blue-600",
      border: "border-blue-500",
      icon: Info,
      iconColor: "text-blue-300",
    },
  };

  const { bg, border, icon: Icon, iconColor } = config[type];

  return (
    <div
      className={`min-w-[300px] max-w-[500px] ${bg} border ${border} rounded-lg shadow-lg p-4 pointer-events-auto animate-in slide-in-from-bottom-2`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 ${iconColor} flex-shrink-0 mt-0.5`} />
        <p className="flex-1 text-white text-sm font-medium">{message}</p>
        <button
          onClick={onClose}
          className="flex-shrink-0 text-white/70 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};



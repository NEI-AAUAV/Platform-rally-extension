import { useToast as useToastContext } from "@/components/ui/toast";

export const useAppToast = () => {
  const { showToast } = useToastContext();

  return {
    success: (message: string, duration?: number) => showToast(message, "success", duration),
    error: (message: string, duration?: number) => showToast(message, "error", duration),
    info: (message: string, duration?: number) => showToast(message, "info", duration),
    warning: (message: string, duration?: number) => showToast(message, "warning", duration),
  };
};



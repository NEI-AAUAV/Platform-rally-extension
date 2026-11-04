import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ErrorStateProps {
  message: string;
  className?: string;
  variant?: "default" | "destructive";
  /** When given, renders a retry button so the user has a way forward. */
  onRetry?: () => void;
  retryLabel?: string;
}

export default function ErrorState({
  message,
  className = "",
  variant = "destructive",
  onRetry,
  retryLabel = "Tentar novamente",
}: Readonly<ErrorStateProps>) {
  return (
    <div className={`mt-8 ${className}`}>
      <Alert variant={variant}>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>{message}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rally-press rounded-lg border border-current px-3 py-1.5 text-sm font-semibold hover:bg-destructive/10"
            >
              {retryLabel}
            </button>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
}

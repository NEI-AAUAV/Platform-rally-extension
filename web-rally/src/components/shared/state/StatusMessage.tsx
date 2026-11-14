import { CheckCircle, XCircle } from "lucide-react";

interface StatusMessageProps {
  type: "success" | "error";
  message: string;
  className?: string;
}

export default function StatusMessage({
  type,
  message,
  className = "",
}: Readonly<StatusMessageProps>) {
  const isSuccess = type === "success";

  return (
    <div className={`mt-4 text-center ${className}`}>
      <div
        className={`flex items-center justify-center gap-2 ${
          isSuccess ? "text-success-ink" : "text-destructive-ink"
        }`}
      >
        {isSuccess ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        <span>{message}</span>
      </div>
    </div>
  );
}

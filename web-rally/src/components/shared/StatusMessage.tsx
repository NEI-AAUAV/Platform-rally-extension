import { CheckCircle, XCircle } from 'lucide-react';

interface StatusMessageProps {
  type: 'success' | 'error';
  message: string;
  className?: string;
}

export default function StatusMessage({ type, message, className = "" }: StatusMessageProps) {
  const isSuccess = type === 'success';
  
  return (
    <div className={`text-center mt-4 ${className}`}>
      <div className={`flex items-center justify-center gap-2 ${
        isSuccess ? 'text-green-500' : 'text-red-500'
      }`}>
        {isSuccess ? (
          <CheckCircle className="w-4 h-4" />
        ) : (
          <XCircle className="w-4 h-4" />
        )}
        <span>{message}</span>
      </div>
    </div>
  );
}

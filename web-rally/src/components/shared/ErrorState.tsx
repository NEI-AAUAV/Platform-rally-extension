import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ErrorStateProps {
  message: string;
  className?: string;
  variant?: 'default' | 'destructive';
}

export default function ErrorState({ 
  message, 
  className = "", 
  variant = 'destructive' 
}: ErrorStateProps) {
  return (
    <div className={`mt-8 ${className}`}>
      <Alert variant={variant}>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    </div>
  );
}












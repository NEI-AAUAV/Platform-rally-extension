import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export default function LoadingState({ message = "Carregando...", className = "" }: LoadingStateProps) {
  return (
    <div className={`flex justify-center items-center py-8 ${className}`}>
      <div className="flex items-center gap-2 text-[rgb(255,255,255,0.7)]">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>{message}</span>
      </div>
    </div>
  );
}






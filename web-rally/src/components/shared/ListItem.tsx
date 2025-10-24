import React from 'react';

interface ListItemProps {
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export default function ListItem({ children, actions, className = "" }: ListItemProps) {
  return (
    <div className={`flex items-center justify-between p-4 bg-[rgb(255,255,255,0.02)] rounded-xl border border-[rgb(255,255,255,0.1)] ${className}`}>
      <div className="flex items-center gap-3">
        {children}
      </div>
      {actions && (
        <div className="flex items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}



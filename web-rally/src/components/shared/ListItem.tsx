import React from 'react';

interface ListItemProps {
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export default function ListItem({ children, actions, className = "" }: ListItemProps) {
  return (
    <div className={`flex items-center justify-between p-4 bg-muted rounded-xl border border-border ${className}`}>
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

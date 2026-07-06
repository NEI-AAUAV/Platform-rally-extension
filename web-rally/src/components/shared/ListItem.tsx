import React from "react";

interface ListItemProps {
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export default function ListItem({ children, actions, className = "" }: ListItemProps) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl border border-border bg-muted p-4 ${className}`}
    >
      <div className="flex items-center gap-3">{children}</div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

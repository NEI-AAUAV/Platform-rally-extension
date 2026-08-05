import React from "react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: Readonly<EmptyStateProps>) {
  return (
    <div className={`py-8 text-center ${className}`}>
      {icon && <div className="mb-4 flex justify-center">{icon}</div>}
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      {description && <p className="mb-4 text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

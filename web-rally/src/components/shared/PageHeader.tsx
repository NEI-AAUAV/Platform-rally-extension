import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  className?: string;
}

export default function PageHeader({ title, description, className = "" }: PageHeaderProps) {
  return (
    <div className={`text-center ${className}`}>
      <h2 className="text-2xl font-bold mb-2">{title}</h2>
      {description && (
        <p className="text-[rgb(255,255,255,0.7)]">{description}</p>
      )}
    </div>
  );
}







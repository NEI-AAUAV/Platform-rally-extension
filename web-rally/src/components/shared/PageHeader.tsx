import type { ComponentType } from "react";

interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  /** Small accent eyebrow above the title. */
  readonly eyebrow?: string;
  /** Optional icon shown beside the eyebrow. */
  readonly icon?: ComponentType<{ className?: string }>;
  readonly className?: string;
}

/**
 * Standard page header: a bold, left-aligned display title with an optional
 * accent eyebrow and supporting copy. Shared across the rally surfaces so every
 * page opens with the same strong hierarchy.
 */
export default function PageHeader({
  title,
  description,
  eyebrow,
  icon: Icon,
  className = "",
}: PageHeaderProps) {
  return (
    <header className={className}>
      {eyebrow && (
        <p className="rally-accent inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.24em]">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {eyebrow}
        </p>
      )}
      <h1 className="rally-display mt-2 text-4xl font-bold text-foreground sm:text-5xl">
        {title}
      </h1>
      {description && (
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
      )}
    </header>
  );
}

import React, { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface RallyCardProps {
  readonly children: ReactNode;
  readonly variant?: "default" | "elevated" | "subtle" | "nested";
  readonly className?: string;
  readonly padding?: "none" | "sm" | "md" | "lg";
  readonly rounded?: "md" | "lg" | "xl" | "2xl";
  readonly onClick?: () => void;
  readonly hover?: boolean;
}

/**
 * Soft-depth themed card on the design tokens. Variants map to elevation rather
 * than the old skin's tinted borders; surfaces adapt to light/dark.
 */
const RallyCard = forwardRef<HTMLDivElement | HTMLButtonElement, RallyCardProps>(
  (
    {
      children,
      variant = "default",
      className,
      padding = "lg",
      rounded = "2xl",
      onClick,
      hover = false,
    },
    ref,
  ) => {
    const variantStyles = {
      default: "bg-card border-border/70 dark:border-transparent",
      elevated: "bg-card border-border/70 shadow-[var(--rally-shadow-md)] dark:border-transparent",
      subtle: "bg-card/60 border-border/60 dark:border-transparent",
      nested: "bg-secondary border-transparent",
    };

    const paddingStyles = {
      none: "",
      sm: "p-3 sm:p-4",
      md: "p-4 sm:p-6",
      lg: "p-6",
    };

    const roundedStyles = {
      md: "rounded-md",
      lg: "rounded-lg",
      xl: "rounded-xl",
      "2xl": "rounded-3xl",
    };

    const hoverStyles = hover ? "transition-colors hover:bg-accent" : "";

    const interactiveStyles = onClick ? "cursor-pointer text-left w-full" : "";
    const sharedClassName = cn(
      "border",
      variantStyles[variant],
      paddingStyles[padding],
      roundedStyles[rounded],
      hoverStyles,
      interactiveStyles,
      className,
    );

    if (onClick) {
      return (
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          type="button"
          onClick={onClick}
          className={sharedClassName}
        >
          {children}
        </button>
      );
    }

    return (
      <div ref={ref as React.Ref<HTMLDivElement>} className={sharedClassName}>
        {children}
      </div>
    );
  },
);

RallyCard.displayName = "RallyCard";

export default RallyCard;

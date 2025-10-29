import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Bloody Theme Card Component
 * 
 * Card styling for the "bloody" theme with darker, more intense styling
 * suitable for Halloween/horror-themed rally events.
 */

interface BloodyCardProps {
  children: ReactNode;
  variant?: "default" | "elevated" | "subtle" | "nested";
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
  rounded?: "md" | "lg" | "xl" | "2xl";
  onClick?: () => void;
  hover?: boolean;
}

const BloodyCard = forwardRef<HTMLDivElement, BloodyCardProps>(
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
    ref
  ) => {
    // Bloody theme uses darker, more intense styling
    const variantStyles = {
      default: "bg-[rgb(255,255,255,0.04)] border-[rgb(255,255,255,0.15)]",
      elevated: "bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)]",
      subtle: "bg-[rgb(255,255,255,0.02)] border-[rgb(255,255,255,0.1)]",
      nested: "bg-[rgb(255,255,255,0.05)] border-[rgb(255,255,255,0.2)]",
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
      "2xl": "rounded-2xl",
    };

    const hoverStyles = hover
      ? "transition-colors hover:bg-[rgb(255,255,255,0.08)]"
      : "";

    const interactiveStyles = onClick ? "cursor-pointer" : "";

    return (
      <div
        ref={ref}
        onClick={onClick}
        className={cn(
          "border",
          variantStyles[variant],
          paddingStyles[padding],
          roundedStyles[rounded],
          hoverStyles,
          interactiveStyles,
          className
        )}
      >
        {children}
      </div>
    );
  }
);

BloodyCard.displayName = "BloodyCard";

export default BloodyCard;


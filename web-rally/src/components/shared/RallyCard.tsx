import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Rally Card Component - Standardized card styling for the Rally extension
 * 
 * Variants:
 * - default: Main content cards (bg: 0.04, border: 0.15)
 * - elevated: Data-heavy interfaces (bg: 0.1, border: 0.2)
 * - subtle: Interactive/hover states (bg: 0.02, border: 0.1)
 * - nested: Secondary content within cards (bg: 0.05, border: 0.2)
 */

interface RallyCardProps {
  children: ReactNode;
  variant?: "default" | "elevated" | "subtle" | "nested";
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
  rounded?: "md" | "lg" | "xl" | "2xl";
  onClick?: () => void;
  hover?: boolean;
}

const RallyCard = forwardRef<HTMLDivElement, RallyCardProps>(
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
    // Variant styles
    const variantStyles = {
      default: "bg-[rgb(255,255,255,0.04)] border-[rgb(255,255,255,0.15)]",
      elevated: "bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)]",
      subtle: "bg-[rgb(255,255,255,0.02)] border-[rgb(255,255,255,0.1)]",
      nested: "bg-[rgb(255,255,255,0.05)] border-[rgb(255,255,255,0.2)]",
    };

    // Padding styles
    const paddingStyles = {
      none: "",
      sm: "p-3 sm:p-4",
      md: "p-4 sm:p-6",
      lg: "p-6",
    };

    // Rounded styles
    const roundedStyles = {
      md: "rounded-md",
      lg: "rounded-lg",
      xl: "rounded-xl",
      "2xl": "rounded-2xl",
    };

    // Hover styles
    const hoverStyles = hover
      ? "transition-colors hover:bg-[rgb(255,255,255,0.08)]"
      : "";

    // Interactive cursor
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

RallyCard.displayName = "RallyCard";

export default RallyCard;


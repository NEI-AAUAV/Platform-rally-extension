import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * NEI Theme Card Component
 * 
 * Card styling using NEI brand color (#008542) for borders
 * Same dark backgrounds as bloody theme with NEI green accents
 */

interface NEICardProps {
  children: ReactNode;
  variant?: "default" | "elevated" | "subtle" | "nested";
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
  rounded?: "md" | "lg" | "xl" | "2xl";
  onClick?: () => void;
  hover?: boolean;
}

const NEICard = forwardRef<HTMLDivElement, NEICardProps>(
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
    // NEI theme uses same backgrounds as bloody but with NEI brand green accents
    const variantStyles = {
      default: "bg-[rgb(255,255,255,0.04)] border-[#008542]/40",
      elevated: "bg-[rgb(255,255,255,0.1)] border-[#008542]/50",
      subtle: "bg-[rgb(255,255,255,0.02)] border-[#008542]/30",
      nested: "bg-[rgb(255,255,255,0.05)] border-[#008542]/45",
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
      ? "transition-colors hover:bg-[rgb(255,255,255,0.08)] hover:border-[#008542]/60"
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

NEICard.displayName = "NEICard";

export default NEICard;


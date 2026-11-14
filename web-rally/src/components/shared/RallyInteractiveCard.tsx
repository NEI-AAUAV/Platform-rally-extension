import { forwardRef, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/utils";

/**
 * Rally Interactive Card Component - For clickable/selectable cards
 *
 * Features:
 * - Hover effects
 * - Active/selected states
 * - Color-coded status variants
 */

interface RallyInteractiveCardProps {
  children: ReactNode;
  onClick?: () => void;
  selected?: boolean;
  status?: "default" | "success" | "warning" | "info" | "neutral" | "nested";
  className?: string;
  padding?: "sm" | "md" | "lg";
  rounded?: "lg" | "xl" | "2xl";
  disabled?: boolean;
  as?: "div" | "button";
}

const RallyInteractiveCard = forwardRef<
  HTMLDivElement | HTMLButtonElement,
  RallyInteractiveCardProps
>(
  (
    {
      children,
      onClick,
      selected = false,
      status = "default",
      className,
      padding = "md",
      rounded = "xl",
      disabled = false,
      as = "div",
    },
    ref,
  ) => {
    // Status-based styles
    const statusStyles = {
      default: {
        base: "bg-muted border-border",
        hover: "hover:bg-muted",
        selected: "bg-muted border-border",
      },
      success: {
        base: "bg-success/10 border-success/30",
        hover: "hover:bg-success/20",
        selected: "bg-success/25 border-success/50",
      },
      warning: {
        base: "bg-warning/10 border-warning/30",
        hover: "hover:bg-warning/20",
        selected: "bg-warning/25 border-warning/50",
      },
      info: {
        base: "bg-info/10 border-info/30",
        hover: "hover:bg-info/20",
        selected: "bg-info/25 border-info/50",
      },
      neutral: {
        base: "bg-muted border-border",
        hover: "hover:bg-muted",
        selected: "bg-muted border-border",
      },
      nested: {
        base: "bg-muted border-border",
        hover: "hover:bg-muted",
        selected: "bg-muted border-border",
      },
    };

    // Padding styles
    const paddingStyles = {
      sm: "p-3",
      md: "p-3 sm:p-4",
      lg: "p-4 sm:p-6",
    };

    // Rounded styles
    const roundedStyles = {
      lg: "rounded-lg",
      xl: "rounded-xl",
      "2xl": "rounded-2xl",
    };

    const currentStatus = statusStyles[status];
    const baseStyles = selected ? currentStatus.selected : currentStatus.base;
    const hoverStyles = !disabled ? currentStatus.hover : "";

    const sharedClassName = cn(
      "border transition-all",
      baseStyles,
      hoverStyles,
      paddingStyles[padding],
      roundedStyles[rounded],
      onClick && !disabled ? "cursor-pointer" : "",
      disabled ? "opacity-50 cursor-not-allowed" : "",
      className,
    );

    if (as === "button") {
      return (
        <button
          ref={ref as Ref<HTMLButtonElement>}
          onClick={!disabled ? onClick : undefined}
          disabled={disabled}
          className={cn(sharedClassName, "w-full text-left")}
          aria-pressed={selected}
          type="button"
        >
          {children}
        </button>
      );
    }

    return (
      <div
        ref={ref as Ref<HTMLDivElement>}
        onClick={!disabled ? onClick : undefined}
        className={cn(sharedClassName, "w-full text-left")}
        aria-pressed={selected}
        aria-disabled={disabled}
        role={onClick ? "button" : undefined}
      >
        {children}
      </div>
    );
  },
);

RallyInteractiveCard.displayName = "RallyInteractiveCard";

export default RallyInteractiveCard;

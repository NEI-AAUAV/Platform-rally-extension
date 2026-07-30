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
        base: "bg-green-500/10 border-green-500/30",
        hover: "hover:bg-green-500/20",
        selected: "bg-green-500/25 border-green-500/50",
      },
      warning: {
        base: "bg-yellow-500/10 border-yellow-500/30",
        hover: "hover:bg-yellow-500/20",
        selected: "bg-yellow-500/25 border-yellow-500/50",
      },
      info: {
        base: "bg-blue-500/10 border-blue-500/30",
        hover: "hover:bg-blue-500/20",
        selected: "bg-blue-500/25 border-blue-500/50",
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

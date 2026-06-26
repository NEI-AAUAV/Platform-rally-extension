import { forwardRef, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/utils";

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

/**
 * Soft-depth interactive card on the design tokens. `default`/`neutral`/`nested`
 * use the accent for the selected state; semantic statuses keep their hues.
 */
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
    const accentSelected =
      "rally-bg-accent-soft rally-border-accent";
    const statusStyles = {
      default: {
        base: "bg-card border-border",
        hover: "hover:bg-accent",
        selected: accentSelected,
      },
      neutral: {
        base: "bg-secondary border-border",
        hover: "hover:bg-accent",
        selected: accentSelected,
      },
      nested: {
        base: "bg-card/60 border-border",
        hover: "hover:bg-accent",
        selected: accentSelected,
      },
      success: {
        base: "bg-emerald-500/10 border-emerald-500/40",
        hover: "hover:bg-emerald-500/20",
        selected: "bg-emerald-500/25 border-emerald-500/60",
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
    };

    const paddingStyles = {
      sm: "p-3",
      md: "p-3 sm:p-4",
      lg: "p-4 sm:p-6",
    };

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

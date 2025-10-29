import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Bloody Theme Interactive Card Component
 * 
 * Interactive card for the "bloody" theme with status-based coloring
 * suitable for Halloween/horror-themed rally events.
 */

interface BloodyInteractiveCardProps {
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

const BloodyInteractiveCard = forwardRef<
  HTMLDivElement | HTMLButtonElement,
  BloodyInteractiveCardProps
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
    ref
  ) => {
    // Bloody theme uses darker, more intense colors
    const statusStyles = {
      default: {
        base: "bg-[rgb(255,255,255,0.02)] border-[rgb(255,255,255,0.1)]",
        hover: "hover:bg-[rgb(255,255,255,0.04)]",
        selected: "bg-[rgb(255,255,255,0.08)] border-[rgb(255,255,255,0.3)]",
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
        base: "bg-[rgb(255,255,255,0.04)] border-[rgb(255,255,255,0.15)]",
        hover: "hover:bg-[rgb(255,255,255,0.06)]",
        selected: "bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.25)]",
      },
      nested: {
        base: "bg-[rgb(255,255,255,0.05)] border-[rgb(255,255,255,0.2)]",
        hover: "hover:bg-[rgb(255,255,255,0.08)]",
        selected: "bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.3)]",
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

    const Component = as;

    return (
      <Component
        ref={ref as any}
        onClick={!disabled ? onClick : undefined}
        disabled={disabled}
        className={cn(
          "border transition-all",
          baseStyles,
          hoverStyles,
          paddingStyles[padding],
          roundedStyles[rounded],
          onClick && !disabled ? "cursor-pointer" : "",
          disabled ? "opacity-50 cursor-not-allowed" : "",
          as === "button" ? "w-full text-left" : "",
          className
        )}
        aria-pressed={selected}
        type={as === "button" ? "button" : undefined}
      >
        {children}
      </Component>
    );
  }
);

BloodyInteractiveCard.displayName = "BloodyInteractiveCard";

export default BloodyInteractiveCard;


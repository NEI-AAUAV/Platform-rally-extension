import { forwardRef, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/utils";

/**
 * NEI Theme Interactive Card Component
 * 
 * Interactive card using NEI brand color (#008542) for borders
 * Same dark backgrounds as bloody theme with NEI green accents
 */

interface NEIInteractiveCardProps {
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

const NEIInteractiveCard = forwardRef<
  HTMLDivElement | HTMLButtonElement,
  NEIInteractiveCardProps
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
    // NEI theme uses same backgrounds as bloody but with NEI brand green accents
    const statusStyles = {
      default: {
        base: "bg-[rgb(255,255,255,0.02)] border-[#008542]/30",
        hover: "hover:bg-[rgb(255,255,255,0.06)] hover:border-[#008542]/40",
        selected: "bg-[#008542]/10 border-[#008542]/50",
      },
      success: {
        base: "bg-[#008542]/10 border-[#008542]/40",
        hover: "hover:bg-[#008542]/20",
        selected: "bg-[#008542]/25 border-[#008542]/60",
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
        base: "bg-[rgb(255,255,255,0.04)] border-[#008542]/35",
        hover: "hover:bg-[rgb(255,255,255,0.08)] hover:border-[#008542]/45",
        selected: "bg-[#008542]/15 border-[#008542]/55",
      },
      nested: {
        base: "bg-[rgb(255,255,255,0.03)] border-[#008542]/35",
        hover: "hover:bg-[rgb(255,255,255,0.06)] hover:border-[#008542]/45",
        selected: "bg-[#008542]/10 border-[#008542]/50",
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
  }
);

NEIInteractiveCard.displayName = "NEIInteractiveCard";

export default NEIInteractiveCard;


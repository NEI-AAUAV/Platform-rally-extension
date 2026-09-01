import { cn } from "@/lib/utils";

const SIZES = {
  sm: { box: "h-4 w-4", stroke: 4 },
  md: { box: "h-8 w-8", stroke: 3.5 },
  lg: { box: "h-10 w-10", stroke: 3 },
} as const;

interface SpinnerProps {
  size?: keyof typeof SIZES;
  className?: string;
  /**
   * Accessible name announced while the spinner is on screen. Pass an empty
   * string when the surrounding block already announces the loading state, so
   * screen readers don't hear it twice.
   */
  label?: string;
}

/**
 * Indeterminate loading spinner: the whole ring rotates while the drawn arc
 * grows and shrinks, so the motion reads as loading even when the arc and the
 * track share a colour.
 *
 * The arc colour is applied inline rather than through a utility class because
 * `.rally-border-accent` / accent utilities live after `@tailwind utilities` in
 * global.css and would otherwise repaint every side of a border-based spinner
 * a single flat colour — which is what made the previous ring look frozen.
 */
export default function Spinner({
  size = "md",
  className = "",
  label = "A carregar",
}: Readonly<SpinnerProps>) {
  const { box, stroke } = SIZES[size];
  const a11y = label ? { role: "status", "aria-label": label } : { "aria-hidden": true };

  return (
    <span {...a11y} className={cn("rally-busy inline-block", box, className)}>
      <svg viewBox="0 0 50 50" className="rally-spinner-rotate h-full w-full" aria-hidden="true">
        <circle
          cx="25"
          cy="25"
          r="20"
          fill="none"
          strokeWidth={stroke}
          className="stroke-border"
          opacity="0.45"
        />
        <circle
          cx="25"
          cy="25"
          r="20"
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="rally-spinner-dash"
          style={{ stroke: "var(--rally-accent, var(--rally-accent-fallback))" }}
        />
      </svg>
    </span>
  );
}

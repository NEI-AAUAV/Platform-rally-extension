import { cva } from "class-variance-authority";

/**
 * The single source of truth for rally button styling. Every action button in
 * the app should render through <RallyButton> (which applies these) rather than
 * hand-rolling `rally-bg-accent inline-flex …` on a <Link>/<a>/<button>.
 *
 * - `variant` sets the look (accent primary, filled default, secondary, outline).
 * - `size` sets padding + text scale.
 * - The button-style axis (blood) layers on top via .rally-blood-button
 *   (data-rally-buttons in CSS), so theming flows through one channel.
 *
 * Variant names `default`/`primary`/`neutral` are kept so existing consumers
 * and the nav config continue to work unchanged.
 */
export const rallyButtonVariants = cva(
  "rally-btn inline-flex items-center justify-center gap-2 rounded-xl font-semibold rally-press transition-[color,background-color,filter,transform] duration-200 disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        default: "rally-bg-accent text-white hover:brightness-110",
        primary: "rally-bg-accent text-white hover:brightness-110",
        neutral: "bg-secondary text-secondary-foreground hover:bg-accent",
        outline: "border border-border bg-card text-foreground hover:bg-muted/50",
      },
      size: {
        sm: "px-3 py-1.5 text-sm",
        md: "px-4 py-2 text-sm",
        lg: "px-6 py-3 text-[15px]",
        xl: "px-7 py-3.5 text-[15px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

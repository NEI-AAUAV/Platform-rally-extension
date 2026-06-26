import { cva } from "class-variance-authority";

/**
 * Rally button variants on the design tokens + per-event accent. Variant names
 * are kept (`default` / `primary` / `neutral`) so existing consumers and the
 * nav config continue to work unchanged.
 */
export const rallyButtonVariants = cva(
  "rounded-xl px-4 py-2 font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        primary: "rally-bg-accent text-white hover:brightness-110",
        neutral: "bg-secondary text-secondary-foreground hover:bg-accent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  // `rally-btn` opts every button into the visual-identity axis (data-rally-buttons):
  // structural styles reshape all buttons, decorative styles echo on non-primary.
  // The filled `default` is the app's primary action — accent-filled + the primary
  // `rally-blood-button` hook — so it matches the branding preview instead of the
  // old near-white `bg-primary`.
  "rally-btn inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "rally-bg-accent text-white rally-blood-button hover:brightness-110",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

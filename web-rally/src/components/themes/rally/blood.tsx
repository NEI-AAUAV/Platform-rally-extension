import { cn } from "@/lib/utils";

interface BloodProps {
  readonly className?: string;
  readonly variant?: "default" | "primary" | "neutral" | null;
  readonly isHover?: boolean;
}

/**
 * Decorative drip retained for backward compatibility with the old nav blood
 * effect (now off by default). Kept accent-neutral so it works in both modes.
 */
export default function Blood({ className, variant, isHover }: BloodProps) {
  const variants = {
    default: isHover ? "currentColor" : "currentColor",
    primary: "var(--rally-accent, var(--rally-accent-fallback))",
    neutral: isHover ? "rgb(120 120 120 / 0.4)" : "rgb(120 120 120 / 0.6)",
  };
  return (
    <svg
      className={cn(className)}
      width="28"
      height="5"
      viewBox="0 0 28 5"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M7 3C10.5 3 10 0 14 0H0C4 0 3.5 3 7 3Z" fill={variants[variant ?? "default"]} />
      <path d="M21 5C24.5 5 24 0 28 0H14C18 0 17.5 5 21 5Z" fill={variants[variant ?? "default"]} />
    </svg>
  );
}

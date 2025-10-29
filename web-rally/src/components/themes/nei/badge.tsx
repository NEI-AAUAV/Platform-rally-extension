import { Badge } from "../../ui/badge";
import { neiButtonVariants } from "./button";
import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * NEI Theme Badge Component
 * 
 * Badge using NEI brand color (#008542 - NEI logo green)
 */

type NEIBadgeProps = VariantProps<typeof neiButtonVariants> &
  Omit<ComponentProps<typeof Badge>, "variant">;

export function NEIBadge({
  className,
  variant,
  ...props
}: NEIBadgeProps) {
  return (
    <Badge
      className={cn(
        neiButtonVariants({ variant }),
        "border-2 border-[#008542]/30 bg-[rgb(255,255,255,0.04)] text-[rgb(255,255,255,0.95)]",
        className,
      )}
      {...props}
    />
  );
}

// Keep default export for backward compatibility
export default function CustomBadge({
  className,
  variant,
  ...props
}: NEIBadgeProps) {
  return (
    <Badge
      {...props}
      className={cn(neiButtonVariants({ variant }), "px-2 py-3", className)}
    />
  );
}


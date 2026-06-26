import { Badge } from "../../ui/badge";
import { rallyButtonVariants } from "./button.variants";
import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type RallyBadgeProps = VariantProps<typeof rallyButtonVariants> &
  Omit<ComponentProps<typeof Badge>, "variant">;

/** Accent-driven themed badge (replaces the bloody/nei skin badges). */
export function RallyBadge({ className, variant, ...props }: RallyBadgeProps) {
  return (
    <Badge
      className={cn(rallyButtonVariants({ variant }), className)}
      {...props}
    />
  );
}

export default RallyBadge;

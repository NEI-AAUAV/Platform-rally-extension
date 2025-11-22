import { Badge } from "../../ui/badge";
import { bloodyButtonVariants } from "./button.variants";
import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type CustomBadgeProps = VariantProps<typeof bloodyButtonVariants> &
  Omit<ComponentProps<typeof Badge>, "variant">;

export function BloodyBadge({
  className,
  variant,
  ...props
}: CustomBadgeProps) {
  return (
    <Badge
      className={cn(
        bloodyButtonVariants({ variant }),
        "border-2 border-[rgb(255,255,255,0.15)] bg-[rgb(255,255,255,0.04)] text-[rgb(255,255,255,0.95)]",
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
}: CustomBadgeProps) {
  return (
    <Badge
      {...props}
      className={cn(bloodyButtonVariants({ variant }), "px-2 py-3", className)}
    />
  );
}

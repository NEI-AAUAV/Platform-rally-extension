import { type ComponentProps } from "react";
import { Button } from "../../ui/button";
import { cn } from "@/lib/utils";
import { type VariantProps } from "class-variance-authority";
import { neiButtonVariants } from "./button.variants";

/**
 * NEI Theme Button Component
 * 
 * Button using NEI brand color (#008542 - NEI logo green)
 * Clean design without liquid/blood effects
 */

type NEIButtonProps = VariantProps<typeof neiButtonVariants> &
  Omit<ComponentProps<typeof Button>, "variant" | "size">;

function NEIButton({ className, variant, ...props }: NEIButtonProps) {
  return (
    <Button
      className={cn(neiButtonVariants({ variant }), className)}
      {...props}
    />
  );
}

export { NEIButton };


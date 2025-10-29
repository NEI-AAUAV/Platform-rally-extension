import { type ComponentProps } from "react";
import { Button } from "../../ui/button";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

/**
 * NEI Theme Button Component
 * 
 * Button using NEI brand color (#008542 - NEI logo green)
 * Clean design without liquid/blood effects
 */

type NEIButtonProps = VariantProps<typeof neiButtonVariants> &
  Omit<ComponentProps<typeof Button>, "variant" | "size">;

const neiButtonVariants = cva("rounded-3xl px-3 py-2 font-bold", {
  variants: {
    variant: {
      default: "bg-white/95 text-black/95 hover:bg-white/80",
      primary: "bg-[#008542] text-white hover:bg-[#006633]",
      neutral: "bg-white/20 text-white/60 hover:bg-white/10",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

function NEIButton({ className, variant, ...props }: NEIButtonProps) {
  return (
    <Button
      className={cn(neiButtonVariants({ variant }), className)}
      {...props}
    />
  );
}

export { NEIButton, neiButtonVariants };


import { type ComponentProps } from "react";
import { Button } from "../../ui/button";
import { cn } from "@/lib/utils";
import { type VariantProps } from "class-variance-authority";
import { rallyButtonVariants } from "./button.variants";

type RallyButtonProps = VariantProps<typeof rallyButtonVariants> &
  Omit<ComponentProps<typeof Button>, "variant" | "size"> & {
    /** Legacy liquid-drip flag from the old bloody skin; now a no-op. */
    readonly blood?: boolean;
  };

/** Accent-driven themed button (replaces the bloody/nei skin buttons). */
function RallyButton({ className, variant, blood, ...props }: RallyButtonProps) {
  void blood; // legacy no-op flag — consumed so it is not forwarded to the DOM
  return (
    <Button
      className={cn(rallyButtonVariants({ variant }), className)}
      {...props}
    />
  );
}

export { RallyButton };
export default RallyButton;

import { type ComponentProps } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";
import { type VariantProps } from "class-variance-authority";
import { rallyButtonVariants } from "./button.variants";

type RallyButtonProps = VariantProps<typeof rallyButtonVariants> &
  ComponentProps<"button"> & {
    /** Render as the single child element (e.g. a router <Link>) instead of a <button>. */
    readonly asChild?: boolean;
    /** Force the primary decoration hook (`.rally-blood-button`) on/off. Defaults
     * on for filled variants; it's what carries the loud per-style effects (e.g.
     * the halloween drip/glow) via [data-rally-buttons] CSS. */
    readonly blood?: boolean;
  };

/**
 * The app's canonical action button. Renders a <button>, or — with `asChild` —
 * any single element (e.g. a router <Link>), so navigation CTAs use the same
 * primitive and pick up variants, sizes, and the theme's button-style axis.
 */
function RallyButton({
  className,
  variant,
  size,
  blood,
  asChild = false,
  children,
  ...props
}: RallyButtonProps) {
  const Comp = asChild ? Slot : "button";
  // The primary decoration hook goes on the filled action variants (default/
  // primary) only; secondary/outline get the restrained echo instead. An
  // explicit `blood` prop overrides.
  const showBlood = blood ?? (variant == null || variant === "default" || variant === "primary");
  return (
    <Comp
      className={cn(
        rallyButtonVariants({ variant, size }),
        showBlood && "rally-blood-button",
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}

export { RallyButton };
export default RallyButton;

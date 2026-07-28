import { type ComponentProps } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";
import { type VariantProps } from "class-variance-authority";
import { rallyButtonVariants } from "./button.variants";

type RallyButtonProps = VariantProps<typeof rallyButtonVariants> &
  ComponentProps<"button"> & {
    /** Render as the single child element (e.g. a router <Link>) instead of a <button>. */
    readonly asChild?: boolean;
    /** Force the blood-drip on/off. Defaults on for filled variants; the drip
     * only shows when the button axis is "blood" (via [data-rally-buttons] CSS). */
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
  // Blood is drawn by CSS on the filled action variants (default/primary) only,
  // and only under [data-rally-buttons="blood"]; secondary/outline stay clean.
  // An explicit `blood` prop overrides.
  const showBlood = blood ?? (variant == null || variant === "default" || variant === "primary");
  return (
    <Comp
      className={cn(rallyButtonVariants({ variant, size }), showBlood && "rally-blood-button", className)}
      {...props}
    >
      {children}
    </Comp>
  );
}

export { RallyButton };
export default RallyButton;

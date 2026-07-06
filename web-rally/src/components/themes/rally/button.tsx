import { type ComponentProps } from "react";
import { Button } from "../../ui/button";
import { cn } from "@/lib/utils";
import { type VariantProps } from "class-variance-authority";
import { rallyButtonVariants } from "./button.variants";
import RallyBlood from "./blood";

type RallyButtonProps = VariantProps<typeof rallyButtonVariants> &
  Omit<ComponentProps<typeof Button>, "variant" | "size"> & {
    /** Renders the blood-drip accent; visible only on the bloody theme (via [data-rally-theme] CSS). */
    readonly blood?: boolean;
  };

const BLOOD_VARIANT_BY_BUTTON_VARIANT: Record<string, "primary" | "neutral" | "default"> = {
  primary: "primary",
  neutral: "neutral",
};

/** Accent-driven themed button; grows a blood drip on the bloody theme. */
function RallyButton({ className, variant, blood, children, ...props }: RallyButtonProps) {
  const bloodVariant = BLOOD_VARIANT_BY_BUTTON_VARIANT[variant ?? ""] ?? "default";
  return (
    <Button
      className={cn(rallyButtonVariants({ variant }), blood && "rally-blood-button", className)}
      {...props}
    >
      {children}
      {blood && <RallyBlood className="rally-blood-drip" variant={bloodVariant} />}
    </Button>
  );
}

export { RallyButton };
export default RallyButton;

import { type ComponentProps, useState } from "react";
import { Button } from "../../ui/button";
import { cn } from "@/lib/utils";
import Blood from "./blood";
import { type VariantProps } from "class-variance-authority";
import { bloodyButtonVariants } from "./button.variants";

type BloodyButtonProps = VariantProps<typeof bloodyButtonVariants> & {
  blood?: boolean;
} & Omit<ComponentProps<typeof Button>, "variant" | "size">;

function BloodyButton({
  className,
  blood,
  variant,
  ...props
}: BloodyButtonProps) {
  const [isHover, setIsHover] = useState(false);

  const toggleIsHover = () => setIsHover((prev) => !prev);
  return (
    <div className="relative">
      {blood && (
        <Blood
          className="absolute right-[25%] top-full origin-top-right text-white/60"
          variant={variant}
          isHover={isHover}
        />
      )}
      <Button
        className={cn(bloodyButtonVariants({ variant }), className)}
        onMouseEnter={toggleIsHover}
        onMouseLeave={toggleIsHover}
        {...props}
      />
    </div>
  );
}

export { BloodyButton };

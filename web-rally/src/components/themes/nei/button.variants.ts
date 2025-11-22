import { cva } from "class-variance-authority";

export const neiButtonVariants = cva("rounded-3xl px-3 py-2 font-bold", {
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


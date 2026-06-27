import { AnimatePresence, motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useColorMode } from "./useColorMode";

interface ColorModeToggleProps {
  className?: string;
}

const EASE = [0.16, 1, 0.3, 1] as const;

/** Animated light/dark switch with spring icon swap. */
export function ColorModeToggle({ className = "" }: ColorModeToggleProps) {
  const { mode, toggle } = useColorMode();
  const next = mode === "dark" ? "claro" : "escuro";

  return (
    <motion.button
      type="button"
      onClick={toggle}
      aria-label={`Mudar para modo ${next}`}
      title={`Modo ${next}`}
      whileTap={{ scale: 0.8, rotate: 20 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      className={`relative inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border bg-card text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground ${className}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={mode}
          initial={{ rotate: -120, opacity: 0, scale: 0.3 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 120, opacity: 0, scale: 0.3 }}
          transition={{ duration: 0.25, ease: EASE }}
          className="absolute flex items-center justify-center"
        >
          {mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

export default ColorModeToggle;

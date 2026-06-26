import { Moon, Sun } from "lucide-react";
import { useColorMode } from "./useColorMode";

interface ColorModeToggleProps {
  className?: string;
}

/** Light/dark switch. Icon shows the mode you'll switch TO. */
export function ColorModeToggle({ className = "" }: ColorModeToggleProps) {
  const { mode, toggle } = useColorMode();
  const next = mode === "dark" ? "claro" : "escuro";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Mudar para modo ${next}`}
      title={`Modo ${next}`}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground ${className}`}
    >
      {mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export default ColorModeToggle;

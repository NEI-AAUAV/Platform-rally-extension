import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ColorModeContext,
  applyColorMode,
  readStoredMode,
  COLOR_MODE_STORAGE_KEY,
  type ColorMode,
} from "./colorModeContext";

interface ColorModeProviderProps {
  readonly children: ReactNode;
}

export function ColorModeProvider({ children }: ColorModeProviderProps) {
  const [mode, setModeState] = useState<ColorMode>(readStoredMode);

  useEffect(() => {
    applyColorMode(mode);
    globalThis.localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode);
  }, [mode]);

  const setMode = useCallback((next: ColorMode) => setModeState(next), []);
  const toggle = useCallback((e?: { clientX: number; clientY: number }) => {
    const flip = () => setModeState((prev) => (prev === "dark" ? "light" : "dark"));

    if (document.startViewTransition && e) {
      document.documentElement.style.setProperty("--reveal-x", `${e.clientX}px`);
      document.documentElement.style.setProperty("--reveal-y", `${e.clientY}px`);
      document.startViewTransition(flip);
    } else {
      flip();
    }
  }, []);

  const value = useMemo(() => ({ mode, setMode, toggle }), [mode, setMode, toggle]);

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}

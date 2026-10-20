import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ColorModeContext,
  DARK_MEDIA_QUERY,
  applyColorMode,
  readStoredPreference,
  resolveColorMode,
  COLOR_MODE_STORAGE_KEY,
  type ColorMode,
  type ColorModePreference,
} from "./colorModeContext";

interface ColorModeProviderProps {
  readonly children: ReactNode;
}

export function ColorModeProvider({ children }: ColorModeProviderProps) {
  const [preference, setPreference] = useState<ColorModePreference>(readStoredPreference);
  const [systemMode, setSystemMode] = useState<ColorMode>(() => resolveColorMode("system"));

  const mode: ColorMode = preference === "system" ? systemMode : preference;

  useEffect(() => {
    applyColorMode(mode);
  }, [mode]);

  useEffect(() => {
    globalThis.localStorage.setItem(COLOR_MODE_STORAGE_KEY, preference);
  }, [preference]);

  useEffect(() => {
    const mql = globalThis.matchMedia?.(DARK_MEDIA_QUERY);
    if (!mql) return;
    const onChange = (e: MediaQueryListEvent) => setSystemMode(e.matches ? "dark" : "light");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const setMode = useCallback((next: ColorModePreference) => setPreference(next), []);

  // The toggle is an explicit light/dark choice, so it always leaves `system`.
  const toggle = useCallback(
    (e?: { clientX: number; clientY: number }) => {
      const next: ColorMode = mode === "dark" ? "light" : "dark";
      const flip = () => setPreference(next);

      if (document.startViewTransition && e) {
        document.documentElement.style.setProperty("--reveal-x", `${e.clientX}px`);
        document.documentElement.style.setProperty("--reveal-y", `${e.clientY}px`);
        document.startViewTransition(flip);
      } else {
        flip();
      }
    },
    [mode],
  );

  const value = useMemo(
    () => ({
      mode,
      preference,
      setMode,
      toggle,
    }),
    [mode, preference, setMode, toggle],
  );

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}

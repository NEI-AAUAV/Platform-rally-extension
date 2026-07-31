import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ColorModeContext,
  DARK_MEDIA_QUERY,
  applyColorMode,
  applyGlass,
  applyReduceTransparency,
  readStoredGlass,
  readStoredPreference,
  readStoredReduceTransparency,
  resolveColorMode,
  resolveGlass,
  COLOR_MODE_STORAGE_KEY,
  GLASS_STORAGE_KEY,
  REDUCE_TRANSPARENCY_STORAGE_KEY,
  type GlassPreference,
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

  const [reduceTransparency, setReduceTransparency] = useState<boolean>(
    readStoredReduceTransparency,
  );

  useEffect(() => {
    applyReduceTransparency(reduceTransparency);
    globalThis.localStorage.setItem(
      REDUCE_TRANSPARENCY_STORAGE_KEY,
      reduceTransparency ? "true" : "false",
    );
  }, [reduceTransparency]);

  const [glass, setGlassPreference] = useState<GlassPreference>(readStoredGlass);
  const glassActive = resolveGlass(glass);

  useEffect(() => {
    applyGlass(glassActive);
    globalThis.localStorage.setItem(GLASS_STORAGE_KEY, glass);
  }, [glass, glassActive]);

  const setMode = useCallback((next: ColorModePreference) => setPreference(next), []);
  const setGlass = useCallback((next: GlassPreference) => setGlassPreference(next), []);

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
      reduceTransparency,
      setReduceTransparency,
      glass,
      glassActive,
      setGlass,
    }),
    [mode, preference, setMode, toggle, reduceTransparency, glass, glassActive, setGlass],
  );

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ColorModeContext,
  applyColorMode,
  readStoredMode,
  COLOR_MODE_STORAGE_KEY,
  type ColorMode,
} from "./colorModeContext";

export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ColorMode>(readStoredMode);

  useEffect(() => {
    applyColorMode(mode);
    window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode);
  }, [mode]);

  const setMode = useCallback((next: ColorMode) => setModeState(next), []);
  const toggle = useCallback(
    () => setModeState((prev) => (prev === "dark" ? "light" : "dark")),
    [],
  );

  const value = useMemo(() => ({ mode, setMode, toggle }), [mode, setMode, toggle]);

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}

import { createContext } from "react";

export type ColorMode = "light" | "dark";

export const COLOR_MODE_STORAGE_KEY = "rally_color_mode";
export const DEFAULT_COLOR_MODE: ColorMode = "dark"; // rally is an evening event

export interface ColorModeContextValue {
  mode: ColorMode;
  setMode: (mode: ColorMode) => void;
  toggle: () => void;
}

export const ColorModeContext = createContext<ColorModeContextValue | null>(null);

/** Read the persisted preference, falling back to the default. */
export function readStoredMode(): ColorMode {
  if (typeof window === "undefined") return DEFAULT_COLOR_MODE;
  const stored = window.localStorage.getItem(COLOR_MODE_STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : DEFAULT_COLOR_MODE;
}

/** Apply the mode as a class on <html> so Tailwind's `dark:` variants switch. */
export function applyColorMode(mode: ColorMode): void {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.classList.toggle("light", mode === "light");
  root.style.colorScheme = mode;
}

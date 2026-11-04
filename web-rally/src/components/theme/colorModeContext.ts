import { createContext } from "react";
import { applyThemeColorMeta } from "@/lib/themeColor";

/** What the user picked. `system` follows the OS appearance. */
export type ColorModePreference = "light" | "dark" | "system";
/** What is actually painted. */
export type ColorMode = "light" | "dark";

export const COLOR_MODE_STORAGE_KEY = "rally_color_mode";
export const DEFAULT_COLOR_MODE_PREFERENCE: ColorModePreference = "system";
/** Used when the OS preference is unknown — rally is an evening event. */
export const DEFAULT_COLOR_MODE: ColorMode = "dark";

export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export interface ColorModeContextValue {
  /** The resolved mode currently painted. */
  mode: ColorMode;
  /** The stored preference, which may be `system`. */
  preference: ColorModePreference;
  setMode: (preference: ColorModePreference) => void;
  toggle: (e?: { clientX: number; clientY: number }) => void;
}

export const ColorModeContext = createContext<ColorModeContextValue | null>(null);

/** Read the persisted preference, falling back to the default. */
export function readStoredPreference(): ColorModePreference {
  if (globalThis.window === undefined) return DEFAULT_COLOR_MODE_PREFERENCE;
  const stored = globalThis.localStorage.getItem(COLOR_MODE_STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : DEFAULT_COLOR_MODE_PREFERENCE;
}

/** The OS appearance, or the default when it cannot be determined. */
export function readSystemMode(): ColorMode {
  if (globalThis.matchMedia === undefined) return DEFAULT_COLOR_MODE;
  return globalThis.matchMedia(DARK_MEDIA_QUERY).matches ? "dark" : "light";
}

export function resolveColorMode(preference: ColorModePreference): ColorMode {
  return preference === "system" ? readSystemMode() : preference;
}

/**
 * Apply the mode as a class on <html> so Tailwind's `dark:` variants switch.
 *
 * This also drives the iOS 26 standalone chrome tint, which Safari samples
 * from the page background rather than from <meta name="theme-color">.
 * Android Chrome does read the meta tag, so it is updated here too.
 */
export function applyColorMode(mode: ColorMode): void {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.classList.toggle("light", mode === "light");
  root.style.colorScheme = mode;
  applyThemeColorMeta(mode);
}

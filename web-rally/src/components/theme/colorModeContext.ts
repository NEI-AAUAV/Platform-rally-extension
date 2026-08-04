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

export const REDUCE_TRANSPARENCY_STORAGE_KEY = "rally_reduce_transparency";
export const GLASS_STORAGE_KEY = "rally_glass";

/** `auto` = only where the material reads as native (Apple, Safari 26+). */
export type GlassPreference = "auto" | "on" | "off";

export function readStoredGlass(): GlassPreference {
  if (globalThis.window === undefined) return "auto";
  const stored = globalThis.localStorage.getItem(GLASS_STORAGE_KEY);
  return stored === "on" || stored === "off" ? stored : "auto";
}

/**
 * Whether `auto` resolves to on. navigator.vendor is WebKit-only and
 * survives a standalone launch, unlike the UA "Safari/Version" tokens;
 * scroll-driven animations shipped in Safari 26.0, so the pair approximates
 * "Apple, 26 or newer".
 */
export function isNativeGlassPlatform(): boolean {
  if (globalThis.window === undefined) return false;
  return (
    navigator.vendor === "Apple Computer, Inc." &&
    globalThis.CSS?.supports("animation-timeline", "scroll()")
  );
}

/** The material needs backdrop-filter; without it there is nothing to show. */
export function supportsGlass(): boolean {
  if (globalThis.CSS?.supports === undefined) return false;
  return (
    CSS.supports("backdrop-filter", "blur(1px)") ||
    CSS.supports("-webkit-backdrop-filter", "blur(1px)")
  );
}

export function resolveGlass(preference: GlassPreference): boolean {
  if (!supportsGlass()) return false;
  if (preference === "on") return true;
  if (preference === "off") return false;
  return isNativeGlassPlatform();
}

export function applyGlass(enabled: boolean): void {
  const root = document.documentElement;
  if (enabled) root.dataset.glass = "on";
  else delete root.dataset.glass;
}

export interface ColorModeContextValue {
  /** The resolved mode currently painted. */
  mode: ColorMode;
  /** The stored preference, which may be `system`. */
  preference: ColorModePreference;
  setMode: (preference: ColorModePreference) => void;
  toggle: (e?: { clientX: number; clientY: number }) => void;
  /**
   * Manual replacement for the OS "Reduce Transparency" setting. WebKit does
   * not implement `prefers-reduced-transparency` (bug 175497), so on Apple
   * platforms — the only ones that get the translucent surfaces — the setting
   * is undetectable and has to be offered in-app.
   */
  reduceTransparency: boolean;
  setReduceTransparency: (value: boolean) => void;
  /** Glass material preference, and whether it currently resolves to on. */
  glass: GlassPreference;
  glassActive: boolean;
  setGlass: (preference: GlassPreference) => void;
}

export function readStoredReduceTransparency(): boolean {
  if (globalThis.window === undefined) return false;
  return globalThis.localStorage.getItem(REDUCE_TRANSPARENCY_STORAGE_KEY) === "true";
}

export function applyReduceTransparency(value: boolean): void {
  document.documentElement.dataset.reduceTransparency = value ? "true" : "false";
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

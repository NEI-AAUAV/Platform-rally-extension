import type { RallySettingsResponse } from "@/client";

// Universal-app branding: every value below is DATA served by the backend
// (RallySettings). These constants are only the bundled fallbacks used before
// settings load, or when an edition has not configured a given field.
export const FALLBACK_EVENT_NAME = "Rally Tascas";
export const FALLBACK_EVENT_SUBTITLE = "Competição de Equipas";
export const FALLBACK_BANNER_SRC = "/rally/banner/Carnaval_2026.jpeg";
export const FALLBACK_FAVICON_HREF = "/rally/favicon.ico";
export const FALLBACK_THEME_COLOR = "#dc2626";

export interface Branding {
  eventName: string;
  eventSubtitle: string;
  /** CSS color, "" when unset so callers can fall back. */
  accentColor: string;
  bannerSrc: string;
  /** Custom logo URL, "" when unset (no bundled logo fallback). */
  logoSrc: string;
  /** Resolved favicon href (custom or bundled fallback). */
  faviconHref: string;
  /** Raw custom favicon URL, "" when unset — gates apple-touch overrides. */
  customFaviconUrl: string;
  /** Browser theme-color (accent or bundled fallback). */
  themeColor: string;
}

const firstNonEmpty = (...vals: Array<string | null | undefined>): string =>
  vals.find((v) => typeof v === "string" && v.trim().length > 0)?.trim() ?? "";

/**
 * Convert a #rgb/#rrggbb color to an `rgba(r, g, b, a)` string. Returns null
 * for anything that is not a parseable hex (e.g. named colors), so callers can
 * skip setting a derived value rather than emit an invalid one.
 */
export function hexToRgba(hex: string, alpha: number): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return null;
  const raw = m[1];
  const h =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const n = Number.parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return null;
  const raw = m[1];
  const h =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const n = Number.parseInt(h, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let hue: number;
  switch (max) {
    case r:
      hue = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      hue = (b - r) / d + 2;
      break;
    default:
      hue = (r - g) / d + 4;
  }
  return [hue * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r: number, g: number, b: number;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const chan = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexToRgbTuple(hexA));
  const lB = relativeLuminance(hexToRgbTuple(hexB));
  const [lighter, darker] = lA > lB ? [lA, lB] : [lB, lA];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Lighten a hex color (in HSL space) until it reaches at least `minContrast`
 * against `backgroundHex`, for use as text/icon color on that background.
 * Used to derive a dark-theme-safe variant of an arbitrary manager-configured
 * accent color, since raw accent text can fail WCAG AA on dark surfaces
 * (e.g. the default NEI green is ~3.9:1 on the dark card background).
 * Returns the original hex unchanged if it cannot be parsed or already meets
 * the target.
 */
export function ensureContrastByLightening(
  hex: string,
  backgroundHex: string,
  minContrast = 4.5,
): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;
  const [h, s, l] = hsl;
  if (contrastRatio(hex, backgroundHex) >= minContrast) return hex;

  let lo = l;
  let hi = 0.95;
  let best = hex;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const candidate = hslToHex(h, s, mid);
    if (contrastRatio(candidate, backgroundHex) >= minContrast) {
      best = candidate;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return best;
}

/**
 * Resolve the effective branding from rally settings, applying bundled
 * fallbacks. Pure — safe to call during render.
 */
export function resolveBranding(settings?: RallySettingsResponse | null): Branding {
  const accentColor = firstNonEmpty(settings?.accent_color);
  const customFaviconUrl = firstNonEmpty(settings?.favicon_url);

  return {
    eventName: firstNonEmpty(settings?.event_name, FALLBACK_EVENT_NAME),
    eventSubtitle: firstNonEmpty(settings?.event_subtitle, FALLBACK_EVENT_SUBTITLE),
    accentColor,
    bannerSrc: firstNonEmpty(settings?.banner_url, FALLBACK_BANNER_SRC),
    logoSrc: firstNonEmpty(settings?.logo_url),
    faviconHref: firstNonEmpty(customFaviconUrl, FALLBACK_FAVICON_HREF),
    customFaviconUrl,
    themeColor: firstNonEmpty(accentColor, FALLBACK_THEME_COLOR),
  };
}

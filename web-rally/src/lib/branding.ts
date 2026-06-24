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
  const h = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const n = Number.parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
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

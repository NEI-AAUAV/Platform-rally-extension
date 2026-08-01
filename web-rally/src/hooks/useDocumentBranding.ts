import { useEffect } from "react";
import {
  hexToRgba,
  ensureContrastByLightening,
  ensureContrastByDarkening,
  flattenOnWhite,
  type Branding,
} from "@/lib/branding";

// Calibration background for deriving a contrast-safe dark-mode accent
// variant. Deliberately darker than the plain card background (hsl(224 26% 9%))
// to also clear darker surfaces such as accent-glow sections, with a small
// margin above the 4.5:1 minimum since real surfaces vary slightly.
const DARK_CARD_BG_HEX = "#09201b";

// Light-mode mirror: accent text most often sits on the soft accent tint
// (the accent at ~15% over the page). Calibrating against a heavier 22% blend
// leaves margin for the grain overlay, which darkens that tint slightly.
const LIGHT_TINT_ALPHA = 0.22;

function setLinkHrefAll(selector: string, href: string): void {
  document.querySelectorAll<HTMLLinkElement>(selector).forEach((el) => {
    el.href = href;
  });
}

/**
 * Apply branding to the live document: title, favicon, apple-touch icons,
 * theme-color, and the `--rally-accent` CSS variable. The static tags in
 * index.html remain the parse-time/crawler fallback; this only swaps them once
 * settings load. Runs effects keyed on each value so it is idempotent.
 */
export default function useDocumentBranding(branding: Branding): void {
  const { eventName, faviconHref, customFaviconUrl, themeColor, accentColor } = branding;

  useEffect(() => {
    document.title = eventName;
  }, [eventName]);

  useEffect(() => {
    setLinkHrefAll('link[rel="icon"]', faviconHref);
  }, [faviconHref]);

  useEffect(() => {
    // Only override the PWA/apple-touch icons when a custom favicon is set; the
    // bundled favicon.ico is a poor apple-touch icon, so keep the defaults otherwise.
    if (!customFaviconUrl) return;
    setLinkHrefAll('link[rel="apple-touch-icon"]', customFaviconUrl);
    const og = document.querySelector<HTMLMetaElement>('meta[property="og:image"]');
    if (og) og.content = customFaviconUrl;
  }, [customFaviconUrl]);

  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = themeColor;
  }, [themeColor]);

  useEffect(() => {
    const root = document.documentElement;
    if (accentColor) {
      root.style.setProperty("--rally-accent", accentColor);
      const soft = hexToRgba(accentColor, 0.15);
      const glow = hexToRgba(accentColor, 0.12);
      if (soft) root.style.setProperty("--rally-accent-soft", soft);
      if (glow) root.style.setProperty("--rally-glow", glow);
      root.style.setProperty(
        "--rally-accent-contrast",
        ensureContrastByLightening(accentColor, DARK_CARD_BG_HEX, 4.6),
      );
      const lightTint = flattenOnWhite(accentColor, LIGHT_TINT_ALPHA);
      if (lightTint) {
        root.style.setProperty(
          "--rally-accent-contrast-light",
          ensureContrastByDarkening(accentColor, lightTint, 4.6),
        );
      }
    } else {
      root.style.removeProperty("--rally-accent");
      root.style.removeProperty("--rally-accent-soft");
      root.style.removeProperty("--rally-glow");
      root.style.removeProperty("--rally-accent-contrast");
      root.style.removeProperty("--rally-accent-contrast-light");
    }
  }, [accentColor]);
}

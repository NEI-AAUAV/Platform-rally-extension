import { useEffect } from "react";
import { hexToRgba, type Branding } from "@/lib/branding";

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
    } else {
      root.style.removeProperty("--rally-accent");
      root.style.removeProperty("--rally-accent-soft");
      root.style.removeProperty("--rally-glow");
    }
  }, [accentColor]);
}

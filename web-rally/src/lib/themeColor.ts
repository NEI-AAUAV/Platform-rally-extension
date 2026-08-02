/**
 * Keeps <meta name="theme-color"> in sync with the painted colour mode.
 *
 * index.html ships two media-scoped theme-color tags so the very first paint is
 * already correct on Android Chrome, which tints the status bar and the
 * task-switcher header from them. Those tags follow the *OS* appearance, so
 * they are wrong whenever the user overrides it in-app ("light" on a dark
 * phone). This module writes a third, unconditional tag that wins in that case.
 *
 * Apple platforms are unaffected either way: Safari 26 derives the standalone
 * chrome tint from the page background, not from this meta tag.
 */
import type { ColorMode } from "@/components/theme/colorModeContext";

/** Must track --background in src/styles/global.css. */
const THEME_COLORS: Record<ColorMode, string> = {
  light: "#fbfaf8",
  dark: "#0b0d14",
};

const MANAGED_ATTRIBUTE = "data-rally-theme-color";

export function applyThemeColorMeta(mode: ColorMode): void {
  if (globalThis.document === undefined) return;

  let meta = document.querySelector<HTMLMetaElement>(`meta[${MANAGED_ATTRIBUTE}]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.setAttribute(MANAGED_ATTRIBUTE, "");
    // Appended last so it beats the media-scoped tags from index.html: when
    // several theme-color tags match, the last one in document order wins.
    document.head.append(meta);
  }
  meta.content = THEME_COLORS[mode];
}

import * as RallyTheme from "./rally";
import type { CSSProperties } from "react";
import type { ThemeConfig } from "./rally";

type ThemeButtonComponent = typeof RallyTheme.RallyButton;
type ThemeBadgeComponent = typeof RallyTheme.RallyBadge;
type ThemeScoreComponent = typeof RallyTheme.RallyScore;
type ThemeBloodComponent = typeof RallyTheme.RallyBlood;
type ThemeCardComponent = typeof RallyTheme.RallyCard;
type ThemeInteractiveCardComponent = typeof RallyTheme.RallyInteractiveCard;

// Theme keys are retained for the runtime accent fallback (data-rally-theme),
// but all map to the single accent-driven rally component set — the former
// bloody/nei dual skins are collapsed.
export type ThemeName = "bloody" | "nei" | "default";

export interface ThemeComponents {
  Button: ThemeButtonComponent;
  Badge: ThemeBadgeComponent;
  Score: ThemeScoreComponent;
  Blood: ThemeBloodComponent;
  Card: ThemeCardComponent;
  InteractiveCard: ThemeInteractiveCardComponent;
  background: CSSProperties;
  config: ThemeConfig;
}

export type { ThemeConfig };

const rallyComponents: ThemeComponents = {
  Button: RallyTheme.RallyButton,
  Badge: RallyTheme.RallyBadge,
  Score: RallyTheme.RallyScore,
  Blood: RallyTheme.RallyBlood,
  Card: RallyTheme.RallyCard,
  InteractiveCard: RallyTheme.RallyInteractiveCard,
  background: RallyTheme.rallyBackground,
  config: RallyTheme.rallyConfig,
};

const themes: Record<ThemeName, ThemeComponents> = {
  bloody: rallyComponents,
  nei: rallyComponents,
  default: rallyComponents,
};

export function getThemeComponents(themeName: ThemeName = "default"): ThemeComponents {
  return themes[themeName] || rallyComponents;
}

export const BloodyThemeComponents = rallyComponents;
export const NEIThemeComponents = rallyComponents;
export const DefaultThemeComponents = rallyComponents;

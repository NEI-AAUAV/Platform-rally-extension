import * as BloodyTheme from './bloody';
import * as NEITheme from './nei';
import type { CSSProperties } from "react";
import type { ThemeConfig } from "./bloody/config";

type ThemeButtonComponent = typeof BloodyTheme.BloodyButton;
type ThemeBadgeComponent = typeof BloodyTheme.BloodyBadge;
type ThemeScoreComponent = typeof BloodyTheme.BloodyScore;
type ThemeBloodComponent = typeof BloodyTheme.BloodyBlood;
type ThemeCardComponent = typeof BloodyTheme.BloodyCard;
type ThemeInteractiveCardComponent = typeof BloodyTheme.BloodyInteractiveCard;

export type ThemeName = 'bloody' | 'nei' | 'default';

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

const themes: Record<ThemeName, ThemeComponents> = {
  bloody: {
    Button: BloodyTheme.BloodyButton,
    Badge: BloodyTheme.BloodyBadge,
    Score: BloodyTheme.BloodyScore,
    Blood: BloodyTheme.BloodyBlood,
    Card: BloodyTheme.BloodyCard,
    InteractiveCard: BloodyTheme.BloodyInteractiveCard,
    background: BloodyTheme.bloodyBackground,
    config: BloodyTheme.bloodyConfig,
  },
  nei: {
    Button: NEITheme.NEIButton,
    Badge: NEITheme.NEIBadge,
    Score: NEITheme.NEIScore,
    Blood: BloodyTheme.BloodyBlood, // Keep bloody blood for backward compatibility (not used in NEI)
    Card: NEITheme.NEICard,
    InteractiveCard: NEITheme.NEIInteractiveCard,
    background: NEITheme.neiBackground,
    config: NEITheme.neiConfig,
  },
  default: {
    Button: NEITheme.NEIButton,
    Badge: NEITheme.NEIBadge,
    Score: NEITheme.NEIScore,
    Blood: BloodyTheme.BloodyBlood,
    Card: NEITheme.NEICard,
    InteractiveCard: NEITheme.NEIInteractiveCard,
    background: NEITheme.neiBackground,
    config: NEITheme.neiConfig,
  },
};

export function getThemeComponents(themeName: ThemeName = 'bloody'): ThemeComponents {
  return themes[themeName] || themes.bloody;
}

export const BloodyThemeComponents = themes.bloody;
export const NEIThemeComponents = themes.nei;
export const DefaultThemeComponents = themes.default;

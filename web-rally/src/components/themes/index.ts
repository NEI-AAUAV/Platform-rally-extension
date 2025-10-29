// Theme system for Rally components
import * as BloodyTheme from './bloody';
import * as NEITheme from './nei';
import type { ComponentType, CSSProperties } from 'react';
import type { ThemeConfig } from './bloody/config';

export type ThemeName = 'bloody' | 'nei' | 'default';

export interface ThemeComponents {
  Button: ComponentType<any>;
  Badge: ComponentType<any>;
  Score: ComponentType<any>;
  Blood: ComponentType<any>;
  Card: ComponentType<any>;
  InteractiveCard: ComponentType<any>;
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
    Button: BloodyTheme.BloodyButton, // Fallback to bloody for now
    Badge: BloodyTheme.BloodyBadge,
    Score: BloodyTheme.BloodyScore,
    Blood: BloodyTheme.BloodyBlood,
    Card: BloodyTheme.BloodyCard, // Fallback to bloody for now
    InteractiveCard: BloodyTheme.BloodyInteractiveCard, // Fallback to bloody for now
    background: BloodyTheme.bloodyBackground, // Fallback to bloody for now
    config: BloodyTheme.bloodyConfig, // Fallback to bloody for now
  },
};

export function getThemeComponents(themeName: ThemeName = 'bloody'): ThemeComponents {
  return themes[themeName] || themes.bloody;
}

// Export individual theme components for direct access
export const BloodyThemeComponents = themes.bloody;
export const NEIThemeComponents = themes.nei;
export const DefaultThemeComponents = themes.default;

// Export theme context
export { ThemeProvider, useTheme, useThemedComponents } from './ThemeContext';

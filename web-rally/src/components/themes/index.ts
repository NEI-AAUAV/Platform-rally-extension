// Theme system for Rally components
import * as BloodyTheme from './bloody';
import type { ComponentType } from 'react';

export type ThemeName = 'bloody' | 'default';

export interface ThemeComponents {
  Button: ComponentType<any>;
  Badge: ComponentType<any>;
  Score: ComponentType<any>;
  Blood: ComponentType<any>;
  Card: ComponentType<any>;
  InteractiveCard: ComponentType<any>;
}

const themes: Record<ThemeName, ThemeComponents> = {
  bloody: {
    Button: BloodyTheme.BloodyButton,
    Badge: BloodyTheme.BloodyBadge,
    Score: BloodyTheme.BloodyScore,
    Blood: BloodyTheme.BloodyBlood,
    Card: BloodyTheme.BloodyCard,
    InteractiveCard: BloodyTheme.BloodyInteractiveCard,
  },
  default: {
    Button: BloodyTheme.BloodyButton, // Fallback to bloody for now
    Badge: BloodyTheme.BloodyBadge,
    Score: BloodyTheme.BloodyScore,
    Blood: BloodyTheme.BloodyBlood,
    Card: BloodyTheme.BloodyCard, // Fallback to bloody for now
    InteractiveCard: BloodyTheme.BloodyInteractiveCard, // Fallback to bloody for now
  },
};

export function getThemeComponents(themeName: ThemeName = 'bloody'): ThemeComponents {
  return themes[themeName] || themes.bloody;
}

// Export individual theme components for direct access
export const BloodyThemeComponents = themes.bloody;
export const DefaultThemeComponents = themes.default;

// Export theme context
export { ThemeProvider, useTheme, useThemedComponents } from './ThemeContext';

// Theme system for Rally components
import * as BloodyTheme from './bloody';
import type { ComponentType } from 'react';

export type ThemeName = 'bloody' | 'default';

export interface ThemeComponents {
  Button: ComponentType<any>;
  Badge: ComponentType<any>;
  Score: ComponentType<any>;
  Blood: ComponentType<any>;
}

const themes: Record<ThemeName, ThemeComponents> = {
  bloody: {
    Button: BloodyTheme.BloodyButton,
    Badge: BloodyTheme.BloodyBadge,
    Score: BloodyTheme.BloodyScore,
    Blood: BloodyTheme.BloodyBlood,
  },
  default: {
    Button: BloodyTheme.BloodyButton, // Fallback to bloody for now
    Badge: BloodyTheme.BloodyBadge,
    Score: BloodyTheme.BloodyScore,
    Blood: BloodyTheme.BloodyBlood,
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

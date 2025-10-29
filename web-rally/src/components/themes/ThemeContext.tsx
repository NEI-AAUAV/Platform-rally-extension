// Theme context and hook for Rally components
import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import { getThemeComponents, type ThemeName, type ThemeComponents } from './index';
import useRallySettings from '@/hooks/useRallySettings';

interface ThemeContextType {
  themeName: ThemeName;
  setTheme: (theme: ThemeName) => void;
  components: ThemeComponents;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  readonly children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const { settings } = useRallySettings();
  const [themeName, setThemeName] = useState<ThemeName>('bloody');
  
  // Update theme based on rally settings
  useEffect(() => {
    if (settings?.rally_theme) {
      // Map rally theme names to theme names
      const themeMapping: Record<string, ThemeName> = {
        'Rally Tascas': 'bloody',
        'bloody': 'bloody',
        'NEI Rally': 'nei',
        'nei': 'nei',
        'default': 'default',
      };
      
      const mappedTheme = themeMapping[settings.rally_theme] || 'bloody';
      setThemeName(mappedTheme);
    }
  }, [settings?.rally_theme]);

  const components = getThemeComponents(themeName);

  const setTheme = (theme: ThemeName) => {
    setThemeName(theme);
  };

  const contextValue = useMemo(() => ({
    themeName,
    setTheme,
    components
  }), [themeName, components]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Convenience hook for getting themed components
export function useThemedComponents(): ThemeComponents {
  const { components } = useTheme();
  return components;
}

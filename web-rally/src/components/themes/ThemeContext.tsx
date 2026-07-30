/* eslint-disable react-refresh/only-export-components -- file exports hooks alongside provider intentionally */
// Theme context and hook for Rally components
import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from "react";
import { getThemeComponents, type ThemeName, type ThemeComponents } from "@/components";
import useRallySettings from "@/hooks/useRallySettings";

type ButtonStyle = "plain" | "glow" | "sharp" | "shine" | "halloween";
const BUTTON_STYLES: ReadonlySet<ButtonStyle> = new Set<ButtonStyle>([
  "plain",
  "glow",
  "sharp",
  "shine",
  "halloween",
]);

type BackgroundStyle = "plain" | "dots" | "grid" | "glow" | "stripes" | "confetti" | "halloween";
const BACKGROUND_STYLES: ReadonlySet<BackgroundStyle> = new Set<BackgroundStyle>([
  "plain",
  "dots",
  "grid",
  "glow",
  "stripes",
  "confetti",
  "halloween",
]);

interface ThemeContextType {
  themeName: ThemeName;
  setTheme: (theme: ThemeName) => void;
  components: ThemeComponents;
  /** Visual-identity button axis, applied via data-rally-buttons on the shell. */
  buttonStyle: ButtonStyle;
  /** Background pattern axis, applied via data-rally-bg on the shell. */
  backgroundStyle: BackgroundStyle;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  readonly children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const { settings } = useRallySettings();
  const [themeName, setThemeName] = useState<ThemeName>("nei");
  const buttonStyle: ButtonStyle = BUTTON_STYLES.has(settings?.button_style as ButtonStyle)
    ? (settings!.button_style as ButtonStyle)
    : "plain";
  const backgroundStyle: BackgroundStyle = BACKGROUND_STYLES.has(
    settings?.background_style as BackgroundStyle,
  )
    ? (settings!.background_style as BackgroundStyle)
    : "plain";

  // Update theme based on rally settings
  useEffect(() => {
    if (settings?.rally_theme) {
      // Handle legacy 'Rally Tascas' value for backward compatibility
      const theme = settings.rally_theme === "Rally Tascas" ? "bloody" : settings.rally_theme;

      // Validate theme is known, fallback to 'bloody'
      const validTheme: ThemeName =
        theme === "bloody" || theme === "nei" || theme === "default" ? theme : "bloody";

      setThemeName(validTheme);
    }
  }, [settings?.rally_theme]);

  const components = getThemeComponents(themeName);

  const setTheme = (theme: ThemeName) => {
    setThemeName(theme);
  };

  const contextValue = useMemo(
    () => ({
      themeName,
      setTheme,
      components,
      buttonStyle,
      backgroundStyle,
    }),
    [themeName, components, buttonStyle, backgroundStyle],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {/* Gooey filter: merges the blurred blob-gradients of the blood button
          drips into smooth, organic liquid (see .rally-blood-button::after). */}
      <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
        <defs>
          <filter id="rally-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

// Convenience hook for getting themed components
export function useThemedComponents(): ThemeComponents {
  const { components } = useTheme();
  return components;
}

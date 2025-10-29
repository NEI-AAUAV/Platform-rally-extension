/**
 * Bloody Theme Configuration
 * 
 * Defines theme-specific behavior and styling preferences
 */

export interface ThemeConfig {
  nav: {
    activeVariant: "default" | "primary" | "neutral";
    useBloodEffect: boolean;
  };
  displayName: string;
  description: string;
}

export const bloodyConfig: ThemeConfig = {
  // Navigation
  nav: {
    activeVariant: "default",  // White button for active tabs
    useBloodEffect: true,       // Enable blood drip on active tabs
  },
  
  // General theme info
  displayName: "Halloween (Bloody)",
  description: "Dark theme with red accents and liquid effects",
};


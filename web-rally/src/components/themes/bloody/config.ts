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
  colors?: {
    text?: string;
    muted?: string;
    background?: string;
    primary?: string;
    [key: string]: string | undefined;
  };
  images?: {
    logo?: string;
    [key: string]: string | undefined;
  };
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
  colors: {
    primary: '#dc2625',  // Red accent color
    text: '#ffffff',
    muted: '#d1d5db',
    background: '#0b0b0b'
  },
  images: {
    logo: undefined,  // No custom logo for bloody theme
  }
};


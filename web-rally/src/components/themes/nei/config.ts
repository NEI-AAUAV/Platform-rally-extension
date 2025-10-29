import type { ThemeConfig } from '../bloody/config';

/**
 * NEI Theme Configuration
 * 
 * Defines theme-specific behavior and styling preferences
 */

export const neiConfig: ThemeConfig = {
  // Navigation
  nav: {
    activeVariant: "primary",  // Green button for active tabs
    useBloodEffect: false,     // No liquid effects in NEI theme
  },
  
  // General theme info
  displayName: "NEI Rally (Verde)",
  description: "Professional green theme with NEI branding",
};


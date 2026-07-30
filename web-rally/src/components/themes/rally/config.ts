/**
 * Rally theme configuration.
 *
 * The single, accent-driven design language for the rally app (replaces the
 * former bloody/nei dual skins). Colour now comes from the per-event accent and
 * the dual light/dark design tokens, so this config only carries the small
 * behavioural switches the shell still reads.
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

export const rallyConfig: ThemeConfig = {
  nav: {
    activeVariant: "primary",
    useBloodEffect: false,
  },
  displayName: "Rally",
  description: "Accent-driven design language on dual light/dark tokens",
};

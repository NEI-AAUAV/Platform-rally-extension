/**
 * Rally Theme Configuration
 * 
 * Centralized theme colors and styles for the Rally extension.
 * This allows for easy theming and consistency across all components.
 */

export const rallyTheme = {
  // Card backgrounds and borders
  cards: {
    default: {
      background: "bg-[rgb(255,255,255,0.04)]",
      border: "border-[rgb(255,255,255,0.15)]",
      hover: "hover:bg-[rgb(255,255,255,0.06)]",
    },
    elevated: {
      background: "bg-[rgb(255,255,255,0.1)]",
      border: "border-[rgb(255,255,255,0.2)]",
      hover: "hover:bg-[rgb(255,255,255,0.15)]",
    },
    subtle: {
      background: "bg-[rgb(255,255,255,0.02)]",
      border: "border-[rgb(255,255,255,0.1)]",
      hover: "hover:bg-[rgb(255,255,255,0.04)]",
    },
    nested: {
      background: "bg-[rgb(255,255,255,0.05)]",
      border: "border-[rgb(255,255,255,0.2)]",
      hover: "hover:bg-[rgb(255,255,255,0.08)]",
    },
    selected: {
      background: "bg-[rgb(255,255,255,0.08)]",
      border: "border-[rgb(255,255,255,0.3)]",
    },
  },

  // Status colors
  status: {
    success: {
      background: "bg-green-500/10",
      border: "border-green-500/30",
      hover: "hover:bg-green-500/20",
      text: "text-green-600",
      badge: "bg-green-500/20 text-green-400",
    },
    warning: {
      background: "bg-yellow-500/10",
      border: "border-yellow-500/30",
      hover: "hover:bg-yellow-500/20",
      text: "text-yellow-600",
      badge: "bg-yellow-500/20 text-yellow-400",
    },
    error: {
      background: "bg-red-500/10",
      border: "border-red-500/30",
      hover: "hover:bg-red-500/20",
      text: "text-red-500",
      badge: "bg-red-500/20 text-red-400",
    },
    info: {
      background: "bg-blue-500/10",
      border: "border-blue-500/30",
      hover: "hover:bg-blue-500/20",
      text: "text-blue-600",
      badge: "bg-blue-500/20 text-blue-400",
    },
    neutral: {
      background: "bg-[rgb(255,255,255,0.04)]",
      border: "border-[rgb(255,255,255,0.15)]",
      hover: "hover:bg-[rgb(255,255,255,0.06)]",
      text: "text-[rgb(255,255,255,0.7)]",
      badge: "bg-[rgb(255,255,255,0.1)] text-[rgb(255,255,255,0.7)]",
    },
  },

  // Form elements
  forms: {
    input: {
      background: "bg-[rgb(255,255,255,0.04)]",
      border: "border-[rgb(255,255,255,0.15)]",
      focus: "focus:border-red-500 focus:ring-1 focus:ring-red-500",
    },
    select: {
      background: "bg-[rgb(255,255,255,0.1)]",
      border: "border-[rgb(255,255,255,0.2)]",
      option: "bg-gray-800",
    },
  },

  // Interactive elements
  buttons: {
    default: {
      background: "bg-[rgb(255,255,255,0.1)]",
      hover: "hover:bg-[rgb(255,255,255,0.2)]",
      border: "border-[rgb(255,255,255,0.2)]",
    },
    primary: {
      background: "bg-red-600",
      hover: "hover:bg-red-700",
      text: "text-white",
    },
  },

  // Text colors
  text: {
    primary: "text-[rgb(255,255,255,0.95)]",
    secondary: "text-[rgb(255,255,255,0.7)]",
    muted: "text-[rgb(255,255,255,0.6)]",
    disabled: "text-[rgb(255,255,255,0.5)]",
  },

  // Backgrounds
  backgrounds: {
    page: "radial-gradient(circle at 90% 20%, rgb(255,0,0,0.12), transparent 25%), radial-gradient(circle at 10% 50%, rgb(255,0,0,0.12), transparent 25%), radial-gradient(circle at 90% 80%, rgb(255,0,0,0.12), transparent 25%)",
    overlay: "bg-black/80",
    code: "bg-[rgb(255,255,255,0.05)]",
  },

  // Spacing (for consistent padding/margins)
  spacing: {
    card: {
      sm: "p-3 sm:p-4",
      md: "p-4 sm:p-6",
      lg: "p-6",
    },
    page: {
      mobile: "p-2 sm:p-4",
      desktop: "p-6",
      responsive: "p-2 sm:p-4 md:p-6",
    },
  },

  // Border radius
  rounded: {
    sm: "rounded-md",
    md: "rounded-lg",
    lg: "rounded-xl",
    xl: "rounded-2xl",
  },
} as const;

export type RallyTheme = typeof rallyTheme;

// Helper function to get theme values
export const getThemeValue = (path: string) => {
  const keys = path.split(".");
  let value: any = rallyTheme;
  for (const key of keys) {
    value = value[key];
    if (value === undefined) return "";
  }
  return value;
};


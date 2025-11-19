import type { RallySettingsResponse } from "@/client";

/**
 * Default Rally configuration values
 * These are fallback values when API settings are not available
 */
export const RALLY_DEFAULTS = {
  // Penalty values (fallback when API not available)
  PENALTY_VALUES: {
    vomit: 5, // Fallback from RallySettings.penalty_per_puke
    not_drinking: 2, // Fallback from RallySettings.penalty_per_not_drinking
  },
  
  // Extra shots configuration
  EXTRA_SHOTS: {
    perMember: 5, // Default extra shots per team member (increased from 1)
  },
  
  // Form defaults
  FORM_DEFAULTS: {
    generalPoints: 50, // Default points for General activities
    maxExtraShotsPerMember: 5, // Increased to match EXTRA_SHOTS.perMember
  },
} as const;

export type RallyDefaults = typeof RALLY_DEFAULTS;

/**
 * Get penalty values from Rally Settings API or fallback to defaults
 */
export function getPenaltyValues(settings?: RallySettingsResponse | null) {
  return {
    vomit: settings?.penalty_per_puke ?? RALLY_DEFAULTS.PENALTY_VALUES.vomit,
    not_drinking: settings?.penalty_per_not_drinking ?? RALLY_DEFAULTS.PENALTY_VALUES.not_drinking,
  };
}

/**
 * Get extra shots configuration from Rally Settings API or fallback to defaults
 */
export function getExtraShotsConfig(settings?: RallySettingsResponse | null) {
  return {
    perMember: settings?.max_extra_shots_per_member ?? RALLY_DEFAULTS.EXTRA_SHOTS.perMember,
  };
}

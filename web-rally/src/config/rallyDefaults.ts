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
    perMember: 1, // Default extra shots per team member
  },
  
  // Form defaults
  FORM_DEFAULTS: {
    generalPoints: 50, // Default points for General activities
    maxExtraShotsPerMember: 1,
  },
} as const;

export type RallyDefaults = typeof RALLY_DEFAULTS;

/**
 * Get penalty values from Rally Settings API or fallback to defaults
 */
export function getPenaltyValues(settings?: any) {
  return {
    vomit: settings?.penalty_per_puke || RALLY_DEFAULTS.PENALTY_VALUES.vomit,
    not_drinking: settings?.penalty_per_not_drinking || RALLY_DEFAULTS.PENALTY_VALUES.not_drinking,
  };
}

/**
 * Get extra shots configuration from Rally Settings API or fallback to defaults
 */
export function getExtraShotsConfig(_settings?: any) {
  return {
    perMember: RALLY_DEFAULTS.EXTRA_SHOTS.perMember, // This is typically not configurable
  };
}

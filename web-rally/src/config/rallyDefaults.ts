import type { RallySettingsResponse } from "@/client";

/**
 * Fallbacks for the moment before the API's settings arrive.
 *
 * They mirror the column defaults in `api-rally/app/models/rally_settings.py`,
 * which are the system's one default table. Keep them in step: the two sets
 * had drifted (vomit was -5 against the backend's -10), so a screen rendered
 * before the settings loaded quoted a penalty the event does not charge.
 */
export const RALLY_DEFAULTS = {
  // Penalty values (fallback when API not available). Negative by convention,
  // matching the RallySettings columns — the backend applies `abs()` when
  // scoring, and the UI renders the signed value as "N pts each".
  PENALTY_VALUES: {
    vomit: -10, // RallySettings.penalty_per_puke
    not_drinking: -2, // RallySettings.penalty_per_not_drinking
  },

  // Extra shots configuration
  EXTRA_SHOTS: {
    perMember: 5, // RallySettings.max_extra_shots_per_member
  },

  // Form defaults
  FORM_DEFAULTS: {
    generalPoints: 50, // Default points for General activities
    maxExtraShotsPerMember: 5, // matches EXTRA_SHOTS.perMember
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

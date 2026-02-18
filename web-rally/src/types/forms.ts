import type { ActivityResultResponse, ListingTeam, DetailedTeam } from "@/client";

/**
 * Result data structure for form submissions
 */
export interface ActivityResultData {
  result_data: {
    assigned_points?: number;
    completion_time_seconds?: number;
    achieved_points?: number;
    success?: boolean;
    attempts?: number;
    result?: string;
    completed?: boolean;
    opponent_team_id?: number;
    notes?: string;
  };
  extra_shots: number;
  penalties: Record<string, number>;
}

/**
 * Team type that can be either ListingTeam or DetailedTeam
 */
export type Team = ListingTeam | DetailedTeam;

/**
 * Form submission handler type
 */
export type FormSubmitHandler = (data: ActivityResultData) => void;

/**
 * Base props for all activity form components
 */
export interface BaseActivityFormProps {
  existingResult?: ActivityResultResponse;
  team?: Team;
  onSubmit: FormSubmitHandler;
  isSubmitting: boolean;
}

/**
 * Props for General Activity Form
 */
export interface GeneralFormProps extends BaseActivityFormProps {
  config: {
    default_points?: number;
    min_points?: number;
    max_points?: number;
    [key: string]: unknown;
  };
}

/**
 * Props for TeamVs Activity Form
 */
export interface TeamVsFormProps extends BaseActivityFormProps {
  config: {
    base_points?: number;
    completion_points?: number;
    win_points?: number;
    draw_points?: number;
    lose_points?: number;
    [key: string]: unknown;
  };
}

/**
 * Helper function to get team size from either ListingTeam or DetailedTeam
 */
export function getTeamSize(team?: Team): number {
  if (!team) return 1;
  if ('num_members' in team) {
    return team.num_members;
  }
  if ('members' in team) {
    return team.members.length;
  }
  return 1;
}


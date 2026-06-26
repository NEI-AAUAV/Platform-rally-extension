/**
 * Per-person rally profile shapes. Hand-written to mirror api-rally
 * `app/schemas/profile.py` until the generated client covers these endpoints.
 */

export interface ParticipationEntry {
  event_id: number;
  event_name: string;
  event_type: string;
  team_id?: number | null;
  team_name?: string | null;
  team_total?: number | null;
  team_classification?: number | null;
  is_captain: boolean;
  joined_at: string;
}

export interface ProfileResponse {
  authentik_sub: string;
  name?: string | null;
  email?: string | null;
  scopes: string[];
  current_team_id?: number | null;
  participations: ParticipationEntry[];
}

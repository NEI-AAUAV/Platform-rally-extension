/** Team badge types — mirror of api-rally app/models/badge.py BadgeType. */
export type BadgeType =
  | "head_to_head_win"
  | "first_to_complete_activity"
  | "first_to_complete_checkpoint";

/** A single badge a team holds — mirror of TeamBadgeRead. */
export interface TeamBadge {
  id: number;
  team_id: number;
  badge_type: BadgeType | string;
  activity_id: number | null;
  checkpoint_id: number | null;
  meta: Record<string, unknown>;
  awarded_at: string;
}

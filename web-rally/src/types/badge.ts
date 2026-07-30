/** A single badge a team holds — mirror of TeamBadgeRead. */
export interface TeamBadge {
  id: number;
  team_id: number;
  badge_type: string;
  activity_id: number | null;
  checkpoint_id: number | null;
  meta: Record<string, unknown>;
  awarded_at: string;
}

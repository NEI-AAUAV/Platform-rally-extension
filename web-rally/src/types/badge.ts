/** A badge code — dynamic now (admin-defined), mirror of BadgeDefinition.code. */
export type BadgeCode = string;

/** A single badge a team holds — mirror of TeamBadgeRead. */
export interface TeamBadge {
  id: number;
  team_id: number;
  badge_type: BadgeCode;
  activity_id: number | null;
  checkpoint_id: number | null;
  meta: Record<string, unknown>;
  awarded_at: string;
}

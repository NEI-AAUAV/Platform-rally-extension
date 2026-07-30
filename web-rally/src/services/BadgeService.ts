import { client } from "@/client/client.gen";
import type { TeamBadge } from "@/types/badge";

/**
 * Public read access to team badges. Hand-written (the badge endpoints are not
 * part of the generated client yet) but follows the generated service shape so
 * it can be swapped for a regenerated BadgeService later.
 */
export class BadgeService {
  /** All badges awarded across every team. */
  public static async listAllBadges(): Promise<Array<TeamBadge>> {
    const { data } = await client.get<Array<TeamBadge>>({
      url: "/api/rally/v1/badges",
    });
    return data as Array<TeamBadge>;
  }

  /** Badges held by a single team. */
  public static async listTeamBadges(teamId: number): Promise<Array<TeamBadge>> {
    const { data } = await client.get<Array<TeamBadge>>({
      url: "/api/rally/v1/teams/{team_id}/badges",
      path: { team_id: teamId },
    });
    return data as Array<TeamBadge>;
  }
}

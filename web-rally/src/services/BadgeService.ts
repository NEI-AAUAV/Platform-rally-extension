import type { CancelablePromise } from "@/client";
import { OpenAPI } from "@/client/core/OpenAPI";
import { request as __request } from "@/client/core/request";
import type { TeamBadge } from "@/types/badge";

/**
 * Public read access to team badges. Hand-written (the badge endpoints are not
 * part of the generated client yet) but follows the generated service shape so
 * it can be swapped for a regenerated BadgeService later.
 */
export class BadgeService {
  /** All badges awarded across every team. */
  public static listAllBadges(): CancelablePromise<Array<TeamBadge>> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/api/rally/v1/badges",
    });
  }

  /** Badges held by a single team. */
  public static listTeamBadges(teamId: number): CancelablePromise<Array<TeamBadge>> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/api/rally/v1/teams/{team_id}/badges",
      path: { team_id: teamId },
      errors: { 422: "Validation Error" },
    });
  }
}

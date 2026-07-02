import { useQuery } from "@tanstack/react-query";
import { BadgesService } from "@/client";
import { BadgeService } from "@/services/BadgeService";

/** All badges awarded across every team (public read). */
export function useAllBadges() {
  return useQuery({
    queryKey: ["badges"],
    queryFn: () => BadgeService.listAllBadges(),
  });
}

/** Badges held by a single team (public read). */
export function useTeamBadges(teamId: number | undefined) {
  return useQuery({
    queryKey: ["badges", "team", teamId],
    queryFn: () => BadgeService.listTeamBadges(teamId as number),
    enabled: typeof teamId === "number" && !Number.isNaN(teamId),
  });
}

/**
 * Full badge board for a team: active catalogue + earned badges in one request.
 * Drives the locked/earned showcase from DB definitions (not a hardcoded list).
 */
export function useBadgeShowcase(teamId: number | undefined) {
  return useQuery({
    queryKey: ["badges", "showcase", teamId],
    queryFn: () =>
      BadgesService.teamBadgeShowcaseApiRallyV1TeamsTeamIdBadgeShowcaseGet(
        teamId as number,
      ),
    enabled: typeof teamId === "number" && !Number.isNaN(teamId),
  });
}

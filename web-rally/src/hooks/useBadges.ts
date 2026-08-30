import { useQuery } from "@tanstack/react-query";
import { teamBadgeShowcase } from "@/client";
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
    queryFn: async () => (await teamBadgeShowcase({ path: { team_id: teamId as number } })).data,
    enabled: typeof teamId === "number" && !Number.isNaN(teamId),
  });
}

/**
 * True only once the active badge catalogue is known to be non-empty. Used to
 * hide the "Conquistas" nav tab for events that define no badges — the tab
 * stays hidden while loading and reveals only when there is something to show.
 */
export function useHasBadgeCatalogue(teamId: number | undefined): boolean {
  const { data } = useBadgeShowcase(teamId);
  return (data?.definitions.length ?? 0) > 0;
}

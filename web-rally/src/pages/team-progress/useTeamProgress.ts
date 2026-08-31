import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import useTeamAuth from "@/hooks/useTeamAuth";
import useRallySettings from "@/hooks/useRallySettings";
import useRallyEventStream from "@/hooks/useRallyEventStream";
import {
  getCheckpoints,
  getCheckpointsCount,
  getTeamById,
  getTeams,
  type DetailedTeam,
  type DetailedCheckPoint,
  type ListingTeam,
} from "@/client";
import { displayRank, sortTeamsByRank } from "@/lib/teamRanking";
import type { ExtendedRallySettingsResponse } from "./teamProgress.types";

// SSE push (useRallyEventStream) handles near-instant updates when the
// realtime subsystem is enabled; this interval is just the fallback for when
// it's off or the connection drops.
const REFRESH_INTERVAL_MS = 30000;

export function useTeamProgress() {
  const navigate = useNavigate();
  const { isAuthenticated, teamData, isLoading: authLoading } = useTeamAuth();
  const { settings: rawSettings, isLoading: settingsLoading } = useRallySettings();
  const settings = rawSettings as ExtendedRallySettingsResponse | undefined;
  const [expandedCheckpoints, setExpandedCheckpoints] = useState<Set<number>>(new Set());

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      void navigate({ to: "/team-login" });
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Check if participant view is enabled
  useEffect(() => {
    if (!settingsLoading && settings && !settings.participant_view_enabled) {
      void navigate({ to: "/scoreboard" });
    }
  }, [settingsLoading, settings, navigate]);

  // Fetch team data with auto-refresh every 30 seconds
  const {
    data: team,
    isLoading: teamLoading,
    error: teamError,
  } = useQuery<DetailedTeam>({
    queryKey: ["team", teamData?.team_id],
    queryFn: async () => {
      const { data } = await getTeamById({ path: { id: teamData!.team_id } });
      return data;
    },
    enabled: !!teamData?.team_id,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });

  // Fetch checkpoints — the client sends the current team token so the
  // backend returns the correct slice for this team (completed + next), not
  // just checkpoint 1.
  const { data: checkpoints } = useQuery<DetailedCheckPoint[]>({
    queryKey: ["checkpoints", teamData?.team_id],
    queryFn: async () => {
      const { data } = await getCheckpoints();
      return data;
    },
    enabled: !!teamData?.team_id,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  // Fetch total checkpoints count (tolerate failure: the count is non-critical).
  const { data: totalCheckpoints } = useQuery({
    queryKey: ["checkpoints-count"],
    queryFn: async () => {
      try {
        const { data } = await getCheckpointsCount();
        return data;
      } catch {
        return null;
      }
    },
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const toggleCheckpoint = (checkpointIndex: number) => {
    setExpandedCheckpoints((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(checkpointIndex)) {
        newSet.delete(checkpointIndex);
      } else {
        newSet.add(checkpointIndex);
      }
      return newSet;
    });
  };

  // Use activity-based completion count (more accurate than times.length,
  // since times is appended when staff registers a pass but not all
  // activities may be done yet).
  const completedCheckpointsCount = team?.last_checkpoint_number ?? team?.times?.length ?? 0;
  // The authoritative "which posts are done" and "is the route over", straight
  // from the server's progress engine. Neither can be derived from a count
  // once the route is free-order or staged.
  const resolvedOrders = useMemo(
    () => new Set(team?.resolved_checkpoint_orders ?? []),
    [team?.resolved_checkpoint_orders],
  );
  const isRouteFinished = team?.is_route_finished ?? false;
  // A loaded team's `current_checkpoint_number` is authoritative *including*
  // when it is null, which the server sends to mean "no post left to go to" —
  // the route is finished. That is why this cannot be a `??` fallback: null
  // would fall through to `completed + 1` and resurrect a next post, which is
  // exactly the bug that left a finished team staring at the post it had just
  // completed as its "próximo posto" and never seeing RouteFinishedCard. The
  // fallback is only for the moment before the team has loaded at all.
  const nextCheckpointOrder = team ? team.current_checkpoint_number : completedCheckpointsCount + 1;
  const nextCheckpoint =
    nextCheckpointOrder == null
      ? undefined
      : checkpoints?.find((cp) => cp.order === nextCheckpointOrder);

  // Show score mode: 'hidden', 'individual', or 'competitive'
  const showScore = settings?.show_score_mode !== "hidden";
  const showRanking = settings?.show_score_mode === "competitive";

  // Only fetched when a rank is actually shown — this is the standings, and
  // the page has no other use for them.
  const { data: allTeams } = useQuery<ListingTeam[]>({
    queryKey: ["allTeams"],
    queryFn: async () => {
      try {
        const { data } = await getTeams();
        return data ?? [];
      } catch {
        return [];
      }
    },
    enabled: showRanking && !!teamData?.team_id,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  // The one client-side ranking policy, shared with /teams/:id and
  // /scoreboard, instead of the raw `classification` column.
  const rank = useMemo(() => {
    if (!team || !allTeams?.length) return null;
    const position = sortTeamsByRank(allTeams).findIndex((t) => t.id === team.id);
    return position < 0 ? null : displayRank(position);
  }, [team, allTeams]);

  const totalCount = totalCheckpoints ?? checkpoints?.length ?? 0;

  useRallyEventStream([
    ["team", teamData?.team_id],
    ["checkpoints", teamData?.team_id],
  ]);

  return {
    settings,
    team,
    checkpoints,
    isLoading: authLoading || teamLoading || settingsLoading,
    teamError,
    expandedCheckpoints,
    toggleCheckpoint,
    completedCheckpointsCount,
    resolvedOrders,
    isRouteFinished,
    nextCheckpoint,
    showScore,
    showRanking,
    rank,
    totalCount,
  };
}

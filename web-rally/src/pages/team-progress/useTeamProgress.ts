import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import useTeamAuth from "@/hooks/useTeamAuth";
import useRallySettings from "@/hooks/useRallySettings";
import useRallyEventStream from "@/hooks/useRallyEventStream";
import {
  CheckPointService,
  TeamService,
  type DetailedTeam,
  type DetailedCheckPoint,
} from "@/client";
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
      navigate({ to: "/team-login" });
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Check if participant view is enabled
  useEffect(() => {
    if (!settingsLoading && settings && !settings.participant_view_enabled) {
      navigate({ to: "/scoreboard" });
    }
  }, [settingsLoading, settings, navigate]);

  // Fetch team data with auto-refresh every 30 seconds
  const {
    data: team,
    isLoading: teamLoading,
    error: teamError,
  } = useQuery<DetailedTeam>({
    queryKey: ["team", teamData?.team_id],
    queryFn: async () => TeamService.getTeamByIdApiRallyV1TeamIdGet(teamData!.team_id),
    enabled: !!teamData?.team_id,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });

  // Fetch checkpoints — the generated client sends the current team token
  // (OpenAPI.HEADERS) so the backend returns the correct slice for this team
  // (completed + next), not just checkpoint 1.
  const { data: checkpoints } = useQuery<DetailedCheckPoint[]>({
    queryKey: ["checkpoints", teamData?.team_id],
    queryFn: async () => CheckPointService.getCheckpointsApiRallyV1CheckpointGet(),
    enabled: !!teamData?.team_id,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  // Fetch total checkpoints count (tolerate failure: the count is non-critical).
  const { data: totalCheckpoints } = useQuery({
    queryKey: ["checkpoints-count"],
    queryFn: async () => {
      try {
        return await CheckPointService.getCheckpointsCountApiRallyV1CheckpointCountGet();
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
  const nextCheckpointOrder = team?.current_checkpoint_number ?? (completedCheckpointsCount + 1);
  const nextCheckpoint = checkpoints?.find((cp) => cp.order === nextCheckpointOrder);

  // Show score mode: 'hidden', 'individual', or 'competitive'
  const showScore = settings?.show_score_mode !== "hidden";
  const showRanking = settings?.show_score_mode === "competitive";

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
    nextCheckpoint,
    showScore,
    showRanking,
    totalCount,
  };
}

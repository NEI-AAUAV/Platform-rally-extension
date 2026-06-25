import { useQuery } from "@tanstack/react-query";
import useRallySettings from "@/hooks/useRallySettings";
import { useThemedComponents } from "@/components/themes";
import { Navigate } from "@tanstack/react-router";
import { useUserStore } from "@/stores/useUserStore";
import useTeamAuth from "@/hooks/useTeamAuth";
import { CheckPointService, TeamService, type ListingTeam } from "@/client";
import useScoreboardStream from "@/hooks/useScoreboardStream";
import LeaderboardHeader from "./components/LeaderboardHeader";

export default function Scoreboard() {
  const { Card, Score } = useThemedComponents();
  const { settings } = useRallySettings();
  // Push-update the leaderboard from the live SSE stream (no-op when the
  // realtime subsystem is disabled).
  useScoreboardStream([["teams"]]);
  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: TeamService.getTeamsApiRallyV1TeamGet,
  });
  // Checkpoint count is best-effort: the endpoint may be unavailable to public
  // viewers, so a failure simply hides the checkpoint-derived stats.
  const { data: checkpoints } = useQuery({
    queryKey: ["checkpoints"],
    queryFn: CheckPointService.getCheckpointsApiRallyV1CheckpointGet,
    retry: false,
  });
  const checkpointsCount = Array.isArray(checkpoints) ? checkpoints.length : undefined;
  const sortedTeams = teams
    ? [...teams].sort((a: ListingTeam, b: ListingTeam) => a.classification - b.classification)
    : undefined;

  // Check permissions
  const { scopes } = useUserStore((state) => state);
  const isAdminOrManager = scopes !== undefined &&
    (scopes.includes("admin") || scopes.includes("manager-rally") || scopes.includes("rally:admin"));
  const isStaff = scopes !== undefined && scopes.includes("rally-staff");
  const isPrivileged = isAdminOrManager || isStaff;

  // Team auth for individual mode
  const { isAuthenticated, teamData } = useTeamAuth();

  // Se pontuação está totalmente oculta e não é admin/staff
  if (settings?.show_score_mode === "hidden" && !isPrivileged) {
    return <Navigate to="/postos" replace />;
  }

  // Restricted access check for individual mode
  if (settings?.show_score_mode === "individual" && !isPrivileged) {
    if (!isAuthenticated || !teamData) {
      return (
        <Card variant="default" padding="lg" rounded="2xl" className="mt-16 text-center">
          <div className="text-lg font-semibold">Pontuação Restrita</div>
          <div className="text-white/70 mt-2 text-sm">
            A pontuação está visível apenas para membros das equipas.
            <br />
            <a href="/rally/team-login" className="text-primary hover:underline mt-2 inline-block">Fazer Login</a>
          </div>
        </Card>
      );
    }
  }

  // Filter teams for individual mode
  let displayTeams = sortedTeams;
  if (settings?.show_score_mode === "individual" && !isPrivileged && isAuthenticated && teamData) {
    displayTeams = sortedTeams?.filter(t => t.id === teamData.team_id);
  }

  if (settings?.show_live_leaderboard === false && !isPrivileged && settings?.show_score_mode !== "individual") {
    return (
      <Card variant="default" padding="lg" rounded="2xl" className="mt-16 text-center">
        <div className="text-lg font-semibold">Leaderboard indisponível</div>
        <div className="text-white/70 mt-2 text-sm">
          O organizador desativou a visualização do leaderboard em tempo real.
        </div>
      </Card>
    );
  }

  return (
    <div className="mt-8 grid gap-4">
      {displayTeams && displayTeams.length > 1 && displayTeams[0] && (
        <LeaderboardHeader
          leader={displayTeams[0]}
          teamsCount={displayTeams.length}
          checkpointsCount={checkpointsCount}
        />
      )}
      {displayTeams?.map((team: ListingTeam) => <Score key={team.id} team={team} />)}
    </div>
  );
}

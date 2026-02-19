import { useQuery } from "@tanstack/react-query";
import useRallySettings from "@/hooks/useRallySettings";
import { useThemedComponents } from "@/components/themes";
import { Navigate } from "react-router-dom";
import { useUserStore } from "@/stores/useUserStore";
import useTeamAuth from "@/hooks/useTeamAuth";
import { TeamService, type ListingTeam } from "@/client";

export default function Scoreboard() {
  const { Card, Score } = useThemedComponents();
  const { settings } = useRallySettings();
  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: TeamService.getTeamsApiRallyV1TeamGet,
  });
  const sortedTeams = teams?.sort(
    (a: ListingTeam, b: ListingTeam) => a.classification - b.classification,
  );

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
    <div className="mt-16 grid gap-4">
      {displayTeams?.map((team: ListingTeam) => <Score key={team.id} team={team} />)}
    </div>
  );
}

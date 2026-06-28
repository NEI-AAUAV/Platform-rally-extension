import { Navigate } from "@tanstack/react-router";
import useTeamAuth from "@/hooks/useTeamAuth";
import { BadgeShowcase } from "@/components/badges/BadgeShowcase";
import { LoadingState } from "@/components/shared";

/**
 * Team-facing "Conquistas" tab: the full badge board (earned + locked) for the
 * logged-in team. Non-team visitors are redirected to the public scoreboard.
 */
export default function Conquistas() {
  const { isAuthenticated, teamData, isLoading } = useTeamAuth();

  if (isLoading) {
    return <LoadingState message="A carregar conquistas..." />;
  }

  if (!isAuthenticated || !teamData) {
    return <Navigate to="/team-login" replace />;
  }

  return (
    <div className="animate-in fade-in duration-500">
      <BadgeShowcase teamId={teamData.team_id} />
    </div>
  );
}

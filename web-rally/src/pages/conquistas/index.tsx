import { Navigate } from "@tanstack/react-router";
import useTeamAuth from "@/hooks/useTeamAuth";
import useRallySettings from "@/hooks/useRallySettings";
import { BadgeShowcase } from "@/components/badges/BadgeShowcase";
import { LoadingState } from "@/components/shared";

/**
 * Team-facing "Conquistas" tab: the full badge board (earned + locked) for the
 * logged-in team. Non-team visitors are redirected to the public scoreboard.
 * When the badges feature is switched off it redirects home so the page can
 * never be reached directly.
 */
export default function Conquistas() {
  const { isAuthenticated, teamData, isLoading } = useTeamAuth();
  const { settings, isLoading: settingsLoading } = useRallySettings();

  if (isLoading || settingsLoading) {
    return <LoadingState message="A carregar conquistas..." />;
  }

  if (settings?.badges_enabled === false) {
    return <Navigate to="/" replace />;
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

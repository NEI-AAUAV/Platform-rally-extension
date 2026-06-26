import { Navigate } from "@tanstack/react-router";
import useRallySettings from "@/hooks/useRallySettings";
import useTeamAuth from "@/hooks/useTeamAuth";
import { resolveBranding } from "@/lib/branding";
import HomeHero from "./HomeHero";
import HowItWorks from "./HowItWorks";
import LiveTop5 from "./LiveTop5";
import PostosPreview from "./PostosPreview";

/**
 * Public landing page (route "/"). Authenticated team users are sent straight
 * to their progress view; everyone else (public viewers, staff/admins) gets the
 * marketing-style overview: hero + countdown, how-it-works, a live top-5 and a
 * checkpoint preview. Each data section is feature/settings gated and self-hides
 * when it has nothing to show.
 */
export default function Home() {
  const { isAuthenticated: isTeamAuthenticated } = useTeamAuth();
  const { settings } = useRallySettings();

  if (isTeamAuthenticated) {
    return <Navigate to="/team-progress" replace />;
  }

  const branding = resolveBranding(settings);
  const scoreVisible = settings?.show_score_mode !== "hidden";
  const checkpointsPublic = settings?.show_checkpoint_map === true;

  return (
    <div className="grid gap-12">
      <HomeHero branding={branding} settings={settings} />
      {scoreVisible && <LiveTop5 />}
      <HowItWorks />
      <PostosPreview enabled={checkpointsPublic} />
    </div>
  );
}

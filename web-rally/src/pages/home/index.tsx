import { Navigate } from "@tanstack/react-router";
import useRallySettings from "@/hooks/useRallySettings";
import useTeamAuth from "@/hooks/useTeamAuth";
import { resolveBranding } from "@/lib/branding";
import { Reveal } from "@/components/home/Reveal";
import HomeHero from "./HomeHero";
import RallyMarquee from "./RallyMarquee";
import EventStatsRibbon from "./EventStatsRibbon";
import HowItWorks from "./HowItWorks";
import LiveTop5 from "./LiveTop5";
import PostosPreview from "./PostosPreview";
import HomeBottomBanner from "./HomeBottomBanner";

/**
 * Public landing page (route "/"). Authenticated team users are sent straight
 * to their progress view; everyone else (public viewers, staff/admins) gets the
 * full marketing overview, mirroring the gamification home's section rhythm:
 * hero → full-bleed marquee → event stats → live top-5 → how-it-works → postos
 * preview → closing CTA. Each data section is feature/settings gated and
 * self-hides when it has nothing to show; sections reveal on scroll.
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
    <div className="flex flex-col gap-[22px]">
      <HomeHero branding={branding} settings={settings} />

      <RallyMarquee />

      <Reveal>
        <EventStatsRibbon settings={settings} checkpointsPublic={checkpointsPublic} />
      </Reveal>

      <Reveal>
        <div className={scoreVisible ? "grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start" : ""}>
          {scoreVisible && <LiveTop5 />}
          <HowItWorks />
        </div>
      </Reveal>

      <Reveal>
        <PostosPreview enabled={checkpointsPublic} />
      </Reveal>

      <Reveal>
        <HomeBottomBanner />
      </Reveal>
    </div>
  );
}

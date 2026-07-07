import { Navigate } from "@tanstack/react-router";
import useRallySettings from "@/hooks/useRallySettings";
import useTeamAuth from "@/hooks/useTeamAuth";
import { resolveBranding } from "@/lib/branding";
import { DEFAULT_HOME_LAYOUT, type HomeSectionKey } from "@/lib/homeLayout";
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
 * full marketing overview. Section order and visibility are admin-configurable
 * via settings.home_layout; each section is additionally feature/settings gated
 * and self-hides when it has nothing to show. Sections reveal on scroll.
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

  const layout = settings?.home_layout?.length ? settings.home_layout : DEFAULT_HOME_LAYOUT;

  return (
    <div className="flex flex-col gap-[22px]">
      {layout
        .filter((section) => section.visible)
        .map((section) => {
          let content = null;
          switch (section.key) {
            case "home_hero":
              content = <HomeHero branding={branding} settings={settings} />;
              break;
            case "rally_marquee":
              content = <RallyMarquee items={settings?.ticker_items} />;
              break;
            case "event_stats":
              content = <EventStatsRibbon settings={settings} checkpointsPublic={checkpointsPublic} />;
              break;
            case "live_top5":
              content = scoreVisible ? <LiveTop5 /> : null;
              break;
            case "how_it_works":
              content = <HowItWorks />;
              break;
            case "postos_preview":
              content = <PostosPreview enabled={checkpointsPublic} />;
              break;
            case "home_bottom_banner":
              content = <HomeBottomBanner />;
              break;
          }
          if (!content) return null;
          return <Reveal key={section.key}>{content}</Reveal>;
        })}
    </div>
  );
}

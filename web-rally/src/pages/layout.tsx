import { RallyNavbar } from "@/components/shared/navigation/RallyNavbar";
import { SiteFooter } from "@/components/shared/layout/SiteFooter";
import { MobileBottomNav } from "@/components/shared/navigation/MobileBottomNav";
import PWAInstallPrompt from "@/components/pwa/PWAInstallPrompt";
import ErrorBoundary from "@/components/ErrorBoundary";
import LandingGate from "@/components/landing/LandingGate";
import useStaffLogin from "@/hooks/useLoginLink";
import useRallySettings from "@/hooks/useRallySettings";
import useDocumentBranding from "@/hooks/useDocumentBranding";
import { resolveBranding } from "@/lib/branding";
import { useUserStore } from "@/stores/useUserStore";
import { useTeamStore } from "@/stores/useTeamStore";
import { Outlet, useLocation } from "@tanstack/react-router";
import { ThemeProvider, useTheme } from "@/components/themes";

function MainLayoutContent() {
  // The skin's themeName still drives the accent fallback (data-rally-theme)
  // until every page is migrated off the dual-skin system; the surface itself
  // now uses the dual light/dark design tokens, not the skin background.
  const { themeName, buttonStyle, backgroundStyle } = useTheme();

  const { sub, sessionLoading } = useUserStore((state) => state);
  const isTeamAuthenticated = useTeamStore((state) => state.isAuthenticated);
  const onStaffLogin = useStaffLogin();
  const { settings, isLoading: settingsLoading } = useRallySettings();

  // Branding is DATA: derive it from settings (bundled fallbacks until loaded)
  // and apply it to the live document (title, favicon, theme-color, accent).
  const branding = resolveBranding(settings);
  useDocumentBranding(branding);

  // A signed-in team is a first-class identity here too, not just OIDC staff.
  const isAuthenticated = sub !== undefined || isTeamAuthenticated;
  // settings undefined means the request hasn't resolved (still loading, or
  // failed) — never read that as "public access is off", or a transient
  // settings-fetch error locks every visitor out.
  const isPublicAccessEnabled = settings === undefined || settings.public_access_enabled === true;

  // Paths that are accessible for teams or public even if main public access is disabled
  const publicPaths = [
    "/",
    "/team-login",
    "/team-progress",
    "/versus",
    "/scoreboard",
    "/checkpoints",
    "/rules",
    "/preferences",
  ];
  const currentPath = useLocation({ select: (state) => state.pathname });
  const isPublicPath = publicPaths.some(
    (path) => currentPath === path || currentPath.startsWith(`${path}/`),
  );

  // Redirect to main platform login if not authenticated and public access is disabled
  // AND we are not on a specifically allowed public/team path
  if (
    !isAuthenticated &&
    !isPublicAccessEnabled &&
    !isPublicPath &&
    !sessionLoading &&
    !settingsLoading
  ) {
    return (
      <div
        className="rally-grain min-h-screen bg-background font-inter text-foreground antialiased"
        data-rally-theme={themeName}
        data-rally-buttons={buttonStyle}
        data-rally-bg={backgroundStyle}
      >
        <div className="relative z-10">
          <LandingGate branding={branding} onStaffLogin={onStaffLogin} />
        </div>
      </div>
    );
  }

  // Show loading while settings are being fetched
  if (settingsLoading) {
    return (
      <div
        className="rally-grain min-h-screen bg-background font-inter text-foreground antialiased"
        data-rally-theme={themeName}
        data-rally-buttons={buttonStyle}
        data-rally-bg={backgroundStyle}
      >
        <div className="relative z-10 mx-4 flex min-h-screen flex-col items-center justify-center gap-4">
          <span className="rally-border-accent h-10 w-10 animate-spin rounded-full border-2 border-border border-t-current" />
          <p className="rally-display text-sm uppercase tracking-[0.18em] text-muted-foreground">
            A carregar
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rally-grain flex min-h-screen flex-col bg-background font-inter text-foreground antialiased"
      data-rally-theme={themeName}
      data-rally-buttons={buttonStyle}
      data-rally-bg={backgroundStyle}
    >
      {/* Ambient accent atmosphere — fixed, behind all content. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="rally-ambient-blob absolute -left-32 top-[-10%] h-80 w-80 rounded-full blur-3xl" />
        <div className="rally-ambient-blob absolute right-[-8%] top-[35%] h-96 w-96 rounded-full blur-3xl" />
        <div className="rally-ambient-blob absolute bottom-[-10%] left-[25%] h-72 w-72 rounded-full blur-3xl" />
      </div>
      <div
        className="relative z-10 flex min-h-screen flex-1 flex-col"
        style={{ paddingLeft: "var(--safe-left)", paddingRight: "var(--safe-right)" }}
      >
        <RallyNavbar branding={branding} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-3 pb-[calc(6rem+var(--safe-bottom))] pt-6 sm:px-4 sm:pb-[calc(2.5rem+var(--safe-bottom))]">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
          <PWAInstallPrompt />
        </main>
        <SiteFooter branding={branding} />
        <MobileBottomNav />
      </div>
    </div>
  );
}

// Main layout wrapper with ThemeProvider
export default function MainLayout() {
  return (
    <ThemeProvider>
      <MainLayoutContent />
    </ThemeProvider>
  );
}

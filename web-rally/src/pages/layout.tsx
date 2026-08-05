import { RallyNavbar } from "@/components/shared/navigation/RallyNavbar";
import { SiteFooter } from "@/components/shared/layout/SiteFooter";
import { MobileBottomNav } from "@/components/shared/navigation/MobileBottomNav";
import PWAInstallPrompt from "@/components/pwa/PWAInstallPrompt";
import ErrorBoundary from "@/components/ErrorBoundary";
import LandingGate from "@/components/landing/LandingGate";
import useStaffLogin from "@/hooks/useLoginLink";
import useRallySettings from "@/hooks/useRallySettings";
import useDocumentBranding from "@/hooks/useDocumentBranding";
import useTeamAuth from "@/hooks/useTeamAuth";
import { resolveBranding } from "@/lib/branding";
import { useUserStore } from "@/stores/useUserStore";
import { Outlet, useLocation } from "@tanstack/react-router";
import { ThemeProvider, useTheme } from "@/components/themes";

function MainLayoutContent() {
  // The skin's themeName still drives the accent fallback (data-rally-theme)
  // until every page is migrated off the dual-skin system; the surface itself
  // now uses the dual light/dark design tokens, not the skin background.
  const { themeName, buttonStyle, backgroundStyle } = useTheme();

  const { sub, sessionLoading } = useUserStore((state) => state);
  const onStaffLogin = useStaffLogin();
  const { settings, isLoading: settingsLoading, error: settingsError } = useRallySettings();
  // A team's own token is a first-class session: any page a logged-in team
  // is allowed to be on (checkpoints, scoreboard, achievements, team-info,
  // team-settings — not just the 3 paths in the old allow-list) must not
  // bounce it to the landing gate.
  const { isAuthenticated: isTeamAuthenticated, isLoading: isTeamAuthLoading } = useTeamAuth();

  // Branding is DATA: derive it from settings (bundled fallbacks until loaded)
  // and apply it to the live document (title, favicon, theme-color, accent).
  const branding = resolveBranding(settings);
  useDocumentBranding(branding);

  // Check if user is authenticated OR if public access is enabled
  const isAuthenticated = sub !== undefined || isTeamAuthenticated;
  const isPublicAccessEnabled = settings?.public_access_enabled === true;

  // Paths reachable pre-auth (login/join flows) even when public access is
  // disabled — team-authenticated pages are covered by isAuthenticated above,
  // not by this list.
  const publicPaths = ["/team-login", "/versus"];
  // Router-based path, not `globalThis.location`: the latter only reflects
  // a hard navigation/reload, so a client-side route change left this stuck
  // on whatever path first loaded the app.
  const currentPath = useLocation({ select: (loc) => loc.pathname }).replace(/^\/rally/, "");
  const isPublicPath = publicPaths.some((path) => currentPath.startsWith(path));

  // Redirect to main platform login if not authenticated and public access is disabled
  // AND we are not on a specifically allowed public/team path
  if (
    !isAuthenticated &&
    !isPublicAccessEnabled &&
    !isPublicPath &&
    !sessionLoading &&
    !settingsLoading &&
    !isTeamAuthLoading
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

  // Show loading while settings are being fetched. A failed fetch is not a
  // loading state: fall through to the bundled branding defaults instead of
  // holding the whole app on the spinner.
  if (settingsLoading && !settingsError) {
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

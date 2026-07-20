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
import { Outlet } from "@tanstack/react-router";
import { ThemeProvider, useTheme } from "@/components/themes";

function MainLayoutContent() {
  // The skin's themeName still drives the accent fallback (data-rally-theme)
  // until every page is migrated off the dual-skin system; the surface itself
  // now uses the dual light/dark design tokens, not the skin background.
  const { themeName } = useTheme();

  const { sub, sessionLoading } = useUserStore((state) => state);
  const onStaffLogin = useStaffLogin();
  const { settings, isLoading: settingsLoading } = useRallySettings();

  // Branding is DATA: derive it from settings (bundled fallbacks until loaded)
  // and apply it to the live document (title, favicon, theme-color, accent).
  const branding = resolveBranding(settings);
  useDocumentBranding(branding);

  // Check if user is authenticated OR if public access is enabled
  const isAuthenticated = sub !== undefined;
  const isPublicAccessEnabled = settings?.public_access_enabled === true;

  // Paths that are accessible for teams or public even if main public access is disabled
  const publicPaths = ["/team-login", "/team-progress", "/versus"];
  // Extract the path after /rally/ since the router basename is already /rally
  const currentPath = globalThis.location.pathname.replace(/^\/rally/, "");
  const isPublicPath = publicPaths.some((path) => currentPath.startsWith(path));

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
    >
      {/* Ambient accent atmosphere — fixed, behind all content. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="rally-bg-accent-soft absolute -left-32 top-[-10%] h-80 w-80 rounded-full blur-3xl" />
        <div className="rally-bg-accent-soft absolute right-[-8%] top-[35%] h-96 w-96 rounded-full blur-3xl" />
        <div className="rally-bg-accent-soft absolute bottom-[-10%] left-[25%] h-72 w-72 rounded-full blur-3xl" />
      </div>
      <div className="relative z-10 flex min-h-screen flex-1 flex-col">
        <RallyNavbar branding={branding} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-3 pb-24 pt-6 sm:px-4 sm:pb-10">
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

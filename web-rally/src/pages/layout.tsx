import { RallyTimeBanner } from "@/components/shared";
import { RallyNavbar } from "@/components/shared/RallyNavbar";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import ErrorBoundary from "@/components/ErrorBoundary";
import LandingGate from "@/components/landing/LandingGate";
import BrandHeader from "@/components/branding/BrandHeader";
import useStaffLogin from "@/hooks/useLoginLink";
import useRallySettings from "@/hooks/useRallySettings";
import useDocumentBranding from "@/hooks/useDocumentBranding";
import { resolveBranding } from "@/lib/branding";
import { useUserStore } from "@/stores/useUserStore";
import type { CSSProperties } from "react";
import { Outlet } from "@tanstack/react-router";
import { ThemeProvider, useTheme } from "@/components/themes";

function MainLayoutContent() {
  // Get current theme components including background
  const { components, themeName } = useTheme();

  // Use theme-defined background
  const bgStyle: CSSProperties = components.background;

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
  const publicPaths = ['/team-login', '/team-progress', '/versus'];
  // Extract the path after /rally/ since the router basename is already /rally
  const currentPath = globalThis.location.pathname.replace(/^\/rally/, '');
  const isPublicPath = publicPaths.some(path => currentPath.startsWith(path));

  // Redirect to main platform login if not authenticated and public access is disabled
  // AND we are not on a specifically allowed public/team path
  if (!isAuthenticated && !isPublicAccessEnabled && !isPublicPath && !sessionLoading && !settingsLoading) {
    return (
      <div className="font-inter rally-grain text-[rgb(255,255,255,0.95)] antialiased" data-rally-theme={themeName} style={bgStyle}>
        <div className="relative z-10">
          <LandingGate branding={branding} onStaffLogin={onStaffLogin} />
        </div>
      </div>
    );
  }

  // Show loading while settings are being fetched
  if (settingsLoading) {
    return (
      <div className="font-inter rally-grain" data-rally-theme={themeName} style={bgStyle}>
        <div className="relative z-10 mx-4 flex min-h-screen flex-col items-center justify-center gap-4 text-[rgb(255,255,255,0.95)] antialiased">
          <span className="rally-border-accent h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-current" />
          <p className="font-display text-sm uppercase tracking-[0.18em] text-[rgb(255,255,255,0.6)]">A carregar</p>
        </div>
      </div>
    );
  }

  return (
    <div className="font-inter rally-grain min-h-screen text-[rgb(255,255,255,0.95)] antialiased" data-rally-theme={themeName} style={bgStyle}>
      <div className="relative z-10">
        <RallyNavbar branding={branding} />
        <main className="mx-2 pb-10 pt-6 sm:mx-4">
          <BrandHeader branding={branding} className="mx-auto max-w-6xl" />
          <RallyTimeBanner />
          <div className="mt-6">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
          <PWAInstallPrompt />
        </main>
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

import { NavTabs, RallyTimeBanner } from "@/components/shared";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import ErrorBoundary from "@/components/ErrorBoundary";
import LandingGate from "@/components/landing/LandingGate";
import BrandHeader from "@/components/branding/BrandHeader";
import useLoginLink from "@/hooks/useLoginLink";
import useRallySettings from "@/hooks/useRallySettings";
import useDocumentBranding from "@/hooks/useDocumentBranding";
import { resolveBranding } from "@/lib/branding";
import { useUserStore } from "@/stores/useUserStore";
import type { CSSProperties } from "react";
import { Outlet } from "react-router-dom";
import { ThemeProvider, useTheme } from "@/components/themes";

function MainLayoutContent() {
  // Get current theme components including background
  const { components, themeName } = useTheme();

  // Use theme-defined background
  const bgStyle: CSSProperties = components.background;

  const { sub, sessionLoading } = useUserStore((state) => state);
  const loginLink = useLoginLink();
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
          <LandingGate branding={branding} loginLink={loginLink} />
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
    <div className="font-inter rally-grain" data-rally-theme={themeName} style={bgStyle}>
      <div className="relative z-10 mx-2 min-h-screen pb-10 pt-8 text-[rgb(255,255,255,0.95)] antialiased sm:mx-4 sm:pt-12">
        <BrandHeader branding={branding} />
        <NavTabs className="mt-5 justify-center" />
        <RallyTimeBanner />
        <div className="mt-6">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
        <PWAInstallPrompt />
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

import { NavTabs, RallyTimeBanner } from "@/components/shared";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import ErrorBoundary from "@/components/ErrorBoundary";
import useLoginLink from "@/hooks/useLoginLink";
import useRallySettings from "@/hooks/useRallySettings";
import { useUserStore } from "@/stores/useUserStore";
import type { CSSProperties } from "react";
import { Outlet } from "react-router-dom";
import { useEffect } from "react";
import { ThemeProvider, useTheme } from "@/components/themes";

function MainLayoutContent() {
  // Get current theme components including background
  const { components } = useTheme();

  // Use theme-defined background
  const bgStyle: CSSProperties = components.background;

  const { sub, sessionLoading } = useUserStore((state) => state);
  const loginLink = useLoginLink();
  const { settings, isLoading: settingsLoading } = useRallySettings();

  useEffect(() => {
    if (settings?.rally_theme) {
      document.title = settings.rally_theme;
    } else {
      document.title = "Rally Tascas";
    }
  }, [settings?.rally_theme]);

  // Check if user is authenticated OR if public access is enabled
  const isAuthenticated = sub !== undefined;
  const isPublicAccessEnabled = settings?.public_access_enabled === true;

  // Paths that are accessible for teams or public even if main public access is disabled
  const publicPaths = ['/team-login', '/team-progress', '/show-team-code', '/versus'];
  // Extract the path after /rally/ since the router basename is already /rally
  const currentPath = window.location.pathname.replace(/^\/rally/, '');
  const isPublicPath = publicPaths.some(path => currentPath.startsWith(path));

  // Redirect to main platform login if not authenticated and public access is disabled
  // AND we are not on a specifically allowed public/team path
  if (!isAuthenticated && !isPublicAccessEnabled && !isPublicPath && !sessionLoading && !settingsLoading) {
    return (
      <div className="font-inter" style={bgStyle}>
        <div className="mx-4 min-h-screen flex flex-col items-center justify-center text-[rgb(255,255,255,0.95)] antialiased">
          <div className="text-center mb-10">
            <img
              src="/rally/banner/Halloween_2025.jpeg"
              alt="Rally Tascas Banner"
              className="mx-auto mb-6 max-h-40 w-auto object-contain"
            />
            <h1 className="text-3xl font-bold mb-2">Rally Tascas</h1>
            <p className="text-[rgb(255,255,255,0.8)]">Selecione como pretende entrar</p>
          </div>

          <div className="flex flex-col gap-4 w-full max-w-sm px-4">
            <a
              href={loginLink}
              className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-red-700"
            >
              Login Staff (NEI)
            </a>

            <a
              href="/rally/team-login"
              className="flex items-center justify-center gap-2 rounded-lg border-2 border-[rgb(255,255,255,0.2)] bg-[rgba(0,0,0,0.3)] px-6 py-3 font-semibold text-white transition-colors hover:bg-[rgba(0,0,0,0.5)] hover:border-[rgb(255,255,255,0.4)]"
            >
              Login Equipa
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Show loading while settings are being fetched
  if (settingsLoading) {
    return (
      <div className="font-inter" style={bgStyle}>
        <div className="mx-4 min-h-screen pb-10 pt-20 text-[rgb(255,255,255,0.95)] antialiased">
          <div className="text-center">
            <img
              src="/rally/banner/Halloween_2025.jpeg"
              alt="Rally Tascas Banner"
              className="mx-auto mb-4 max-h-32 w-auto object-contain"
            />
            <p className="text-[rgb(255,255,255,0.7)]">Carregando...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="font-inter" style={bgStyle}>
      <div className="mx-2 sm:mx-4 min-h-screen pb-10 pt-16 sm:pt-20 text-[rgb(255,255,255,0.95)] antialiased">
        <div className="text-center mb-4">
          <img
            src="/rally/banner/Halloween_2025.jpeg"
            alt="Rally Tascas Banner"
            className="mx-auto max-h-24 sm:max-h-32 w-auto object-contain"
          />
        </div>
        <NavTabs className="mt-4" />
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

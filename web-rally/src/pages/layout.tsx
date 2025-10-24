import { NavTabs, RallyTimeBanner } from "@/components/shared";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import useLoginLink from "@/hooks/useLoginLink";
import useRallySettings from "@/hooks/useRallySettings";
import { useUserStore } from "@/stores/useUserStore";
import type { CSSProperties } from "react";
import { Outlet } from "react-router-dom";
import { useEffect } from "react";

export default function MainLayout() {
  const bgStyle: CSSProperties = {
    background:
      "radial-gradient(circle at 90% 20%, rgb(255,0,0,0.12) , transparent 25%), radial-gradient(circle at 10% 50%, rgb(255,0,0,0.12) , transparent 25%) , radial-gradient(circle at 90% 80%, rgb(255,0,0,0.12), transparent 25%)",
  };

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
  
  // Redirect to main platform login if not authenticated and public access is disabled
  if (!isAuthenticated && !isPublicAccessEnabled && !sessionLoading && !settingsLoading) {
    window.location.href = loginLink;
    return null;
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
          <Outlet />
        </div>
        <PWAInstallPrompt />
      </div>
    </div>
  );
}

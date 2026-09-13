import { useUserStore } from "@/stores/useUserStore";
import useRallySettings from "@/hooks/useRallySettings";

interface GuideAccess {
  /** User holds a role that may see the guide surface (guide, staff, admin, manager). */
  hasGuideRole: boolean;
  /** Guide mode is enabled for the current event (explicitly, or implicitly for peddy paper). */
  showGuideFeature: boolean;
  /** Both role and feature conditions are met — the guide page/nav should be shown. */
  isAllowed: boolean;
  /** True while user session or settings are still loading. */
  isLoading: boolean;
}

const GUIDE_ROLE_SCOPES = ["rally-guide", "rally-staff", "admin", "manager-rally"] as const;

/**
 * Single source of truth for guide-mode access, replacing the gate expression
 * that was duplicated across the guide page and the desktop/mobile navs.
 *
 * The backend computes the event/profile policy and returns the participant-safe
 * effective gate. React must not infer guide access from event_type.
 */
export function useGuideAccess(): GuideAccess {
  const scopes = useUserStore((s) => s.scopes);
  const sessionLoading = useUserStore((s) => s.sessionLoading);
  const { settings, isLoading: settingsLoading } = useRallySettings();

  const hasGuideRole =
    scopes !== undefined && GUIDE_ROLE_SCOPES.some((scope) => scopes.includes(scope));

  const showGuideFeature = settings?.effective_capabilities?.guide_mode === true;

  return {
    hasGuideRole,
    showGuideFeature,
    isAllowed: hasGuideRole && showGuideFeature,
    isLoading: sessionLoading || settingsLoading,
  };
}

export default useGuideAccess;

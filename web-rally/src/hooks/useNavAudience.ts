import { useUserStore } from "@/stores/useUserStore";
import { useViewModeStore } from "@/stores/useViewModeStore";
import useTeamAuth from "@/hooks/useTeamAuth";

export interface RoleFlags {
  readonly isAdminOrManager: boolean;
  readonly isStaff: boolean;
  readonly isGuide: boolean;
  readonly isPrivileged: boolean;
}

export function deriveRoleFlags(scopes: readonly string[] | undefined): RoleFlags {
  const isAdminOrManager = !!(
    scopes?.includes("admin") ||
    scopes?.includes("manager-rally")
  );
  const isStaff = !!scopes?.includes("rally-staff");
  const isGuide = !!scopes?.includes("rally-guide");
  return {
    isAdminOrManager,
    isStaff,
    isGuide,
    isPrivileged: isAdminOrManager || isStaff || isGuide,
  };
}

/**
 * Single source of truth for "who is looking at the nav" — role flags, team
 * auth, and dual-role view mode. `nav-tabs.tsx` (desktop) and
 * `MobileBottomNav.tsx` used to derive this independently and disagreed:
 * desktop counted guides as privileged and respected `viewMode`; mobile
 * didn't count guides and ignored `viewMode` entirely, so a staff+team
 * dual-role user saw different nav items depending on screen size. Both
 * consume this hook now.
 */
export default function useNavAudience() {
  const { scopes } = useUserStore((state) => state);
  const { isAuthenticated: isTeamAuthenticated, team } = useTeamAuth();
  const { viewMode, toggle: toggleViewMode } = useViewModeStore();

  const roleFlags = deriveRoleFlags(scopes);
  const isDualRole = roleFlags.isPrivileged && isTeamAuthenticated;
  // A dual-role user sees the team nav only while explicitly switched to
  // "team" view; anyone team-authenticated but not privileged always does.
  const showTeamView =
    isTeamAuthenticated && (!roleFlags.isPrivileged || (isDualRole && viewMode === "team"));

  return {
    ...roleFlags,
    scopes,
    isTeamAuthenticated,
    isDualRole,
    viewMode,
    toggleViewMode,
    showTeamView,
    team,
  };
}

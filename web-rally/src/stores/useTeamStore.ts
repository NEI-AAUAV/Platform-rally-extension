import { create } from "zustand";
import {
  getTeamToken,
  getTeamData,
  hasTeamData,
  clearTeamAuth,
  type TeamTokenData,
} from "@/lib/auth/tokenStore";

/**
 * Shared team-session identity, mirroring useUserStore's role for the OIDC
 * side. Initialized synchronously from localStorage so the very first render
 * (bottom nav, layout gate, etc.) already knows whether a team is signed in —
 * no mount-effect frame where every consumer independently starts at
 * `false`. Any writer (login mutation, boot-time refreshTeamToken, logout)
 * updates this store directly so every consumer re-renders together.
 */

interface TeamState {
  isAuthenticated: boolean;
  teamData: TeamTokenData | null;
  /** Populate the team session (login or a successful token refresh). */
  setSession: (data: TeamTokenData) => void;
  /** Token rotated by a refresh; team identity (id/name) is unchanged. */
  setToken: () => void;
  /** Clear the team session (logout, or a confirmed-dead token). */
  clear: () => void;
  /**
   * Re-derive state from localStorage. The store is a module singleton
   * seeded once at import, so anything that mutates localStorage directly
   * (mainly tests) must call this to keep the store in sync — normal app
   * code goes through setSession/clear instead.
   */
  hydrate: () => void;
}

function readInitialState(): Pick<TeamState, "isAuthenticated" | "teamData"> {
  const token = getTeamToken();
  const data = getTeamData();

  if (token && data) {
    return { isAuthenticated: true, teamData: data };
  }
  if (token && hasTeamData()) {
    // Token present but the data entry is corrupt — treat as logged out and
    // clear the stale storage so future reads don't repeat this check.
    clearTeamAuth();
  }
  return { isAuthenticated: false, teamData: null };
}

export const useTeamStore = create<TeamState>((set) => ({
  ...readInitialState(),

  setSession: (data) => set({ isAuthenticated: true, teamData: data }),

  // The refreshed token itself lives in localStorage (tokenStore); this store
  // only tracks identity/auth-state, so a rotation is a no-op here beyond
  // confirming the session is still alive.
  setToken: () => set((state) => ({ ...state, isAuthenticated: true })),

  clear: () => set({ isAuthenticated: false, teamData: null }),

  hydrate: () => set(readInitialState()),
}));

// Keep other tabs/windows in sync: a login/logout in one tab should be
// reflected here without a manual refresh.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== "rally_team_token" && event.key !== "rally_team_data") return;
    const { isAuthenticated, teamData } = readInitialState();
    useTeamStore.setState({ isAuthenticated, teamData });
  });
}

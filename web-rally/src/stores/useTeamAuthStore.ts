import { create } from "zustand";
import {
  getTeamToken,
  setTeamToken as persistTeamToken,
  getTeamData,
  setTeamData as persistTeamData,
  hasTeamData,
  clearTeamAuth as removeTeamAuth,
  type TeamTokenData,
} from "@/lib/auth/tokenStore";
import { setSentryUser, clearSentryUser } from "@/lib/sentry";
import { clearApiCache } from "@/lib/auth/clearApiCache";

interface TeamAuthState {
  isAuthenticated: boolean;
  teamData: TeamTokenData | null;
  isLoadingAuth: boolean;
  setAuth: (data: TeamTokenData, token: string) => void;
  clearAuth: () => void;
}

/**
 * Team login/logout as shared state instead of per-component `useState`.
 *
 * The old `useTeamAuth` hook re-derived `isAuthenticated`/`teamData` from
 * localStorage independently in every component that called it — logging in
 * on one page left every other mounted consumer (nav bars, gates) stale
 * until a reload. A Zustand store makes it one piece of state every
 * consumer reads and writes through.
 */
const useTeamAuthStore = create<TeamAuthState>((set) => ({
  isAuthenticated: false,
  teamData: null,
  isLoadingAuth: true,

  setAuth: (data, token) => {
    persistTeamToken(token);
    persistTeamData(data);
    setSentryUser(data.team_id);
    set({ teamData: data, isAuthenticated: true, isLoadingAuth: false });
  },

  clearAuth: () => {
    removeTeamAuth();
    clearSentryUser();
    // Fire-and-forget: the store update must stay synchronous (consumers
    // re-render off it immediately), and the purge is best-effort anyway.
    void clearApiCache();
    set({ teamData: null, isAuthenticated: false, isLoadingAuth: false });
  },
}));

/**
 * Re-derive auth state from localStorage into the store.
 *
 * Exported (not a module-load IIFE) so tests can re-run it after seeding
 * `localStorage`, since the store is a module-level singleton hydrated once
 * per process — a private IIFE would only ever see whatever localStorage
 * held at import time.
 */
export function hydrateTeamAuthStore(): void {
  const token = getTeamToken();
  const data = getTeamData();
  if (token && data) {
    setSentryUser(data.team_id);
    useTeamAuthStore.setState({ teamData: data, isAuthenticated: true, isLoadingAuth: false });
    return;
  }
  if (token && hasTeamData()) {
    // Token present and a data entry exists but is corrupt — clear stale storage.
    removeTeamAuth();
  }
  useTeamAuthStore.setState({ teamData: null, isAuthenticated: false, isLoadingAuth: false });
}

// Hydrate once from localStorage at module load — every consumer shares this
// one store instance, so a single hydration on import is correct in the app
// (no per-component re-derivation, no race between mounts).
hydrateTeamAuthStore();

export { useTeamAuthStore };

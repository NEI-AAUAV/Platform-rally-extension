import { create } from "zustand";
import { shallow } from "zustand/shallow";
import { clearAllAuth } from "@/lib/auth/tokenStore";

type TokenPayload = {
  image?: string;
  sub?: string;
  email?: string;
  name?: string;
  scopes?: string[];
};

type UserState = TokenPayload & {
  sessionLoading: boolean;
  token?: string;
  /** Populate the staff session from a validated authentik login. */
  setSession: (args: { token: string; user: TokenPayload }) => void;
  /** Mark the staff session resolved-but-absent (unauthenticated). */
  clearSession: () => void;
  /** Full logout: clears staff + team auth and resets identity. */
  logout: () => void;
  isAuthenticated: boolean;
};

const emptyIdentity = {
  image: undefined,
  sub: undefined,
  name: undefined,
  email: undefined,
  scopes: undefined,
  token: undefined,
} as const;

const useUserStore = create<UserState>((set) => ({
  // Identity is driven by react-oidc-context via useAuthSync; we start in a
  // loading state until the OIDC layer reports whether a session exists.
  sessionLoading: true,
  isAuthenticated: false,
  ...emptyIdentity,

  setSession: ({ token, user }) => {
    set((state) => ({
      ...state,
      ...user,
      token,
      sessionLoading: false,
      isAuthenticated: !!user.sub,
    }));
  },

  clearSession: () => {
    set(() => ({
      ...emptyIdentity,
      sessionLoading: false,
      isAuthenticated: false,
    }));
  },

  logout: () => {
    // Clear the team token too (a staff user may also hold a team session).
    clearAllAuth();
    set(() => ({
      ...emptyIdentity,
      sessionLoading: false,
      isAuthenticated: false,
    }));
  },
}));

export { useUserStore, shallow };

// Export types for use in components
export type { UserState, TokenPayload };

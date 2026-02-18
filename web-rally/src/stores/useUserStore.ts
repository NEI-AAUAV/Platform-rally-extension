import { create } from "zustand";
import { shallow } from "zustand/shallow";

function parseJWT(token: string) {
  const base64Url = token.split(".")[1];
  const base64 = base64Url?.replace(/-/g, "+").replace(/_/g, "/");
  const jsonPayload = decodeURIComponent(
    window
      .atob(base64 ?? "")
      .split("")
      .map((c) => {
        const hex = c.charCodeAt(0).toString(16).padStart(2, '0');
        return '%' + hex;
      })
      .join(""),
  );
  return JSON.parse(jsonPayload) as TokenPayload;
}

type TokenPayload = {
  image?: string;
  sub?: string;
  email?: string;
  name?: string;
  surname?: string;
  scopes?: string[];
};

type UserState = TokenPayload & {
  sessionLoading: boolean;
  token?: string;
  login: ({ token }: { token: string }) => void;
  logout: () => void;
  setUser: (userData: Partial<TokenPayload>) => void;
  clearUser: () => void;
  isAuthenticated: boolean;
};

// Initialize from localStorage on app startup
const initializeFromStorage = (): Omit<UserState, 'login' | 'logout' | 'setUser' | 'clearUser'> => {
  // Start with loading state - we're about to check localStorage
  const baseState = {
    sessionLoading: true as boolean,
    isAuthenticated: false as boolean,
    token: undefined as string | undefined,
  };

  try {
    const storedToken = localStorage.getItem('rally_token');
    if (storedToken) {
      const payload: TokenPayload = parseJWT(storedToken);
      // Token injection is now handled dynamically in main.tsx via OpenAPI.HEADERS resolver
      return {
        ...baseState,
        token: storedToken,
        sessionLoading: false,
        isAuthenticated: !!payload.sub,
        ...payload,
      };
    } else {
      // No stored token found
      return {
        ...baseState,
        sessionLoading: false,
      };
    }
  } catch (error) {
    console.error('Failed to initialize from localStorage:', error);
    // Clear invalid token
    localStorage.removeItem('rally_token');
    return {
      ...baseState,
      sessionLoading: false,
    };
  }
};

const useUserStore = create<UserState>((set) => ({
  ...initializeFromStorage(),

  login: ({ token }) => {
    const payload: TokenPayload = token ? parseJWT(token) : {};

    // Store token in localStorage
    localStorage.setItem('rally_token', token);

    // Note: team token is intentionally NOT cleared here.
    // Staff/admin users may also have a team token (dual-role),
    // and the nav toggle handles switching between views.

    set((state) => ({
      ...state,
      token,
      sessionLoading: false,
      isAuthenticated: !!payload.sub,
      ...payload,
    }));
  },

  logout: () => {
    // Clear both staff and team tokens
    localStorage.removeItem('rally_token');
    localStorage.removeItem('rally_team_token');
    localStorage.removeItem('rally_team_data');

    set(() => ({
      sessionLoading: false,
      isAuthenticated: false,
      image: undefined,
      sub: undefined,
      name: undefined,
      surname: undefined,
      email: undefined,
      scopes: undefined,
      token: undefined,
    }));
  },

  setUser: (userData: Partial<TokenPayload>) => {
    set((state) => ({
      ...state,
      ...userData,
      isAuthenticated: !!userData.sub || !!state.sub,
    }));
  },

  clearUser: () => {
    // Clear both staff and team tokens
    localStorage.removeItem('rally_token');
    localStorage.removeItem('rally_team_token');
    localStorage.removeItem('rally_team_data');

    set(() => ({
      sessionLoading: false,
      isAuthenticated: false,
      image: undefined,
      sub: undefined,
      name: undefined,
      surname: undefined,
      email: undefined,
      scopes: undefined,
      token: undefined,
    }));
  },
}));

export { useUserStore, shallow };

// Export types for use in components
export type { UserState, TokenPayload };

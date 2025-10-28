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
const initializeFromStorage = (): Partial<UserState> => {
  // Start with loading state - we're about to check localStorage
  let result = {
    sessionLoading: true,
    isAuthenticated: false,
  };
  
  try {
    const storedToken = localStorage.getItem('rally_token');
    if (storedToken) {
      const payload: TokenPayload = parseJWT(storedToken);
      // Token injection is now handled dynamically in main.tsx via OpenAPI.HEADERS resolver
      result = {
        ...result,
        token: storedToken,
        sessionLoading: false, // Session loaded from storage
        isAuthenticated: !!payload.sub,
        ...payload,
      };
    } else {
      // No stored token found
      result = {
        ...result,
        sessionLoading: false,
      };
    }
  } catch (error) {
    console.error('Failed to initialize from localStorage:', error);
    // Clear invalid token
    localStorage.removeItem('rally_token');
    result = {
      ...result,
      sessionLoading: false,
    };
  }
  
  return result;
};

const useUserStore = create<UserState>((set) => ({
  ...initializeFromStorage(),
  
  login: ({ token }) => {
    const payload: TokenPayload = token ? parseJWT(token) : {};
    
    // Store token in localStorage
    localStorage.setItem('rally_token', token);
    
    set((state) => ({
      ...state,
      token,
      sessionLoading: false,
      isAuthenticated: !!payload.sub,
      ...payload,
    }));
  },

  logout: () => {
    // Clear token from localStorage
    localStorage.removeItem('rally_token');
    
    set(() => ({
      sessionLoading: false,
      isAuthenticated: false,
      image: undefined,
      sub: undefined,
      name: undefined,
      surname: undefined,
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
    // Clear token from localStorage
    localStorage.removeItem('rally_token');
    
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

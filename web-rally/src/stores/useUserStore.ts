import { OpenAPI } from "@/client";
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
        return `%${hex}`;
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

const useUserStore = create<UserState>((set, get) => ({
  sessionLoading: true,
  isAuthenticated: false,

  login: ({ token }) => {
    const payload: TokenPayload = token ? parseJWT(token) : {};
    OpenAPI.HEADERS = {
      Authorization: `Bearer ${token}`,
    };
    set((state) => ({
      ...state,
      token,
      sessionLoading: false,
      isAuthenticated: !!payload.sub,
      ...payload,
    }));
  },

  logout: () => {
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

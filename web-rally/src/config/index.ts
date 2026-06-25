let HOST;
let PRODUCTION;
let BASE_URL;

const scheme = {
  HTTP: "http://",
  HTTPS: "https://",
};

if (process.env.NODE_ENV === "production") {
  PRODUCTION = true;
  HOST = "nei.web.ua.pt";
  BASE_URL = `${scheme.HTTPS}${HOST}`;
} else {
  PRODUCTION = false;
  HOST = "localhost";
  BASE_URL = `${scheme.HTTP}${HOST}`;
}

const origin = typeof window !== "undefined" ? window.location.origin : BASE_URL;

const config = {
  PRODUCTION,
  HOST,
  BASE_URL,

  // OIDC authentication (authentik). Rally logs users in directly against the
  // identity provider via PKCE; the backend validates the resulting tokens.
  OIDC_AUTHORITY: import.meta.env.VITE_OIDC_AUTHORITY ?? "",
  OIDC_CLIENT_ID: import.meta.env.VITE_OIDC_CLIENT_ID ?? "",
  OIDC_REDIRECT_URI:
    import.meta.env.VITE_OIDC_REDIRECT_URI ?? `${origin}/rally/auth/callback`,
  OIDC_POST_LOGOUT_REDIRECT_URI:
    import.meta.env.VITE_OIDC_POST_LOGOUT_REDIRECT_URI ?? `${origin}/rally/`,
  // authentik group names → rally scopes (mirror of the backend mapping).
  OIDC_ADMIN_GROUP: import.meta.env.VITE_OIDC_ADMIN_GROUP ?? "admin",
  OIDC_MANAGER_GROUP: import.meta.env.VITE_OIDC_MANAGER_GROUP ?? "manager-rally",
  OIDC_STAFF_GROUP: import.meta.env.VITE_OIDC_STAFF_GROUP ?? "rally-staff",

  // Realtime scoreboard: when enabled, the SPA opens an SSE connection and
  // refreshes the leaderboard on push instead of relying on polling. Must
  // mirror the backend EVENTS_ENABLED flag. Off by default.
  EVENTS_ENABLED: import.meta.env.VITE_EVENTS_ENABLED === "true",
};

export default config;

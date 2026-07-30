import { WebStorageStateStore } from "oidc-client-ts";
import type { AuthProviderProps } from "react-oidc-context";

import config from "@/config";

/**
 * react-oidc-context configuration. Rally authenticates users directly against
 * authentik using the Authorization Code + PKCE flow; the access token is sent
 * as a Bearer token to api-rally, which validates it as a pure resource server.
 */
export const oidcConfig: AuthProviderProps = {
  authority: config.OIDC_AUTHORITY,
  client_id: config.OIDC_CLIENT_ID,
  redirect_uri: config.OIDC_REDIRECT_URI,
  post_logout_redirect_uri: config.OIDC_POST_LOGOUT_REDIRECT_URI,
  scope: "openid profile email offline_access groups",
  automaticSilentRenew: true,
  // Persist the session across reloads so a refresh does not bounce the user
  // back through the identity provider.
  userStore: new WebStorageStateStore({ store: globalThis.localStorage }),
  onSigninCallback: () => {
    // Strip the OIDC response params from the URL after a successful sign-in.
    globalThis.history.replaceState({}, document.title, globalThis.location.pathname);
  },
} as unknown as AuthProviderProps;

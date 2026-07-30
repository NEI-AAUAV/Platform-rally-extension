import type { BrowserContext } from '@playwright/test';

/**
 * Seed a signed-in OIDC session for e2e tests.
 *
 * The app authenticates via react-oidc-context (Authorization Code + PKCE);
 * oidc-client-ts persists the session under `oidc.user:<authority>:<client_id>`
 * — both empty strings in the test build (no VITE_OIDC_* env), hence the
 * `oidc.user::` key. Rally scopes derive from the authentik `groups` claim.
 */
export async function seedOidcSession(
  context: BrowserContext,
  groups: string[],
  accessToken = 'e2e-access-token',
) {
  await context.addInitScript(
    ([token, gs]) => {
      const now = Math.floor(Date.now() / 1000);
      const user = {
        access_token: token,
        token_type: 'Bearer',
        profile: {
          sub: 'e2e-user-1',
          name: 'E2E User',
          email: 'e2e@ua.pt',
          groups: gs,
          iss: '',
          aud: '',
          exp: now + 3600,
          iat: now,
        },
        expires_at: now + 3600,
        scope: 'openid profile email',
      };
      localStorage.setItem('oidc.user::', JSON.stringify(user));
    },
    [accessToken, groups] as [string, string[]],
  );
}

/** Groups matching the default VITE_OIDC_*_GROUP names. */
export const STAFF_GROUPS = ['rally-staff'];
export const MANAGER_GROUPS = ['manager-rally'];
export const ADMIN_GROUPS = ['admin'];
export const GUIDE_GROUPS = ['rally-guide'];

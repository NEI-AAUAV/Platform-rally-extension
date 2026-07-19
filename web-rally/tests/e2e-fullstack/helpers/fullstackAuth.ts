import type { BrowserContext } from '@playwright/test';

/**
 * Full-stack e2e auth helpers. Unlike tests/e2e's `seedOidcSession` (which
 * fakes localStorage state against mocked routes), these hit the real fake
 * OIDC provider from api-rally's docker-compose.smoke.yml stack
 * (scripts/smoke/fake_oidc_provider.py) to mint genuinely signed tokens the
 * real backend will accept.
 */

const OIDC_PROVIDER_URL = process.env.FULLSTACK_OIDC_URL ?? 'http://localhost:9009';
const API_BASE_URL = process.env.FULLSTACK_API_BASE_URL ?? 'http://localhost:8103';
const API_V1 = `${API_BASE_URL}/api/rally/v1`;

export interface MintedUser {
  readonly sub: string;
  readonly name: string;
  readonly groups: readonly string[];
  readonly accessToken: string;
}

/** Mint a real signed access token via the fake OIDC provider's /mint endpoint. */
export async function mintToken(options: {
  sub: string;
  name: string;
  groups: readonly string[];
}): Promise<MintedUser> {
  const response = await fetch(`${OIDC_PROVIDER_URL}/mint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sub: options.sub, name: options.name, groups: options.groups }),
  });
  if (!response.ok) {
    throw new Error(`mintToken failed: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { access_token: string };
  return { sub: options.sub, name: options.name, groups: options.groups, accessToken: body.access_token };
}

/**
 * Seed a signed-in OIDC session in the browser using a genuinely minted
 * token, so react-oidc-context / useAuthSync treat the user as authenticated
 * against the real backend (which will validate the token's signature).
 */
export async function seedRealOidcSession(context: BrowserContext, user: MintedUser): Promise<void> {
  await context.addInitScript(
    ([token, sub, name, groups]) => {
      const now = Math.floor(Date.now() / 1000);
      const oidcUser = {
        access_token: token,
        token_type: 'Bearer',
        profile: {
          sub,
          name,
          email: `${sub}@ua.pt`,
          groups: JSON.parse(groups as string),
          iss: '',
          aud: '',
          exp: now + 3600,
          iat: now,
        },
        expires_at: now + 3600,
        scope: 'openid profile email',
      };
      localStorage.setItem('oidc.user::', JSON.stringify(oidcUser));
    },
    [user.accessToken, user.sub, user.name, JSON.stringify(user.groups)] as [string, string, string, string],
  );
}

/** Direct API call helper for seeding fixtures (checkpoints, activities, teams, …). */
export async function apiCall<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${API_V1}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`apiCall ${method} ${path} failed: ${response.status} ${await response.text()}`);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export { API_BASE_URL, API_V1, OIDC_PROVIDER_URL };

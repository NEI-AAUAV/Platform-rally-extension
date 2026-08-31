import type { User } from "oidc-client-ts";

import config from "@/config";
import type { TokenPayload } from "@/stores/useUserStore";

/**
 * Map authentik group names to rally scopes. Mirrors the backend mapping in
 * api-rally `app/api/auth.py` so the UI can gate features without an extra
 * round-trip.
 */
export function mapGroupsToScopes(groups: readonly string[] | undefined): string[] {
  if (!groups) return [];
  const scopes: string[] = [];
  if (groups.includes(config.OIDC_ADMIN_GROUP)) scopes.push("admin");
  if (groups.includes(config.OIDC_MANAGER_GROUP)) scopes.push("manager-rally");
  if (groups.includes(config.OIDC_STAFF_GROUP)) scopes.push("rally-staff");
  if (groups.includes(config.OIDC_GUIDE_GROUP)) scopes.push("rally-guide");
  return scopes;
}

/**
 * Decode a JWT's payload without verifying its signature — the token is only
 * being read for a UI-gating hint, and the sole holder (the browser this
 * session belongs to) already trusts it because oidc-client-ts fetched it
 * from the provider over TLS. Every actual authorization decision is made
 * server-side against the real, verified token (see api-rally `api/auth.py`).
 */
function decodeJwtPayload(token: string | undefined): Record<string, unknown> | null {
  const part = token?.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.split("-").join("+").split("_").join("/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * H2: groups must come from the same source the backend derives scopes from
 * — the *access* token's `groups` claim, decoded fresh — not `user.profile`
 * (the ID token). `oidc-client-ts`'s automatic silent renew can refresh the
 * access token without the provider returning a new ID token, in which case
 * `user.profile` keeps redisplaying the pre-renew groups (and
 * `WebStorageStateStore` persists that stale profile across reloads), so a
 * promotion/demotion in Authentik only reached the UI after a full
 * re-login while the API had already applied it on the very next request.
 *
 * Falls back to `user.profile.groups` when the access token isn't a decodable
 * JWT (opaque token, or a test double) or carries no `groups` claim, so this
 * degrades no worse than the previous behavior rather than losing all scopes.
 */
function accessTokenGroups(user: User): string[] | undefined {
  const payload = decodeJwtPayload(user.access_token);
  const claim = payload?.groups;
  return Array.isArray(claim) ? (claim as string[]) : undefined;
}

/** Build the rally user payload from an authentik OIDC user. */
export function profileToUser(user: User): TokenPayload {
  const profile = user.profile;
  const groups = accessTokenGroups(user) ?? (profile.groups as string[] | undefined);
  return {
    sub: profile.sub,
    email: profile.email,
    name:
      (profile.name as string | undefined) ?? (profile.preferred_username as string | undefined),
    image: profile.picture,
    scopes: mapGroupsToScopes(groups),
  };
}

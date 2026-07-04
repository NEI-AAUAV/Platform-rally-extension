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

/** Build the rally user payload from an authentik OIDC user. */
export function profileToUser(user: User): TokenPayload {
  const profile = user.profile;
  const groups = profile.groups as string[] | undefined;
  return {
    sub: profile.sub,
    email: profile.email,
    name: (profile.name as string | undefined) ?? (profile.preferred_username as string | undefined),
    image: profile.picture,
    scopes: mapGroupsToScopes(groups),
  };
}

import type { CancelablePromise } from "@/client";
import { OpenAPI } from "@/client/core/OpenAPI";
import { request as __request } from "@/client/core/request";

/** A NEI (OIDC) account that can be linked to a placeholder member. */
export interface OidcUserSearchResult {
  /** Local mirror id when the account has already logged in, else null. */
  id?: number | null;
  name: string;
  email?: string | null;
  authentik_sub: string;
}

export interface LinkedMemberResponse {
  id: number;
  name: string;
  email?: string | null;
  is_captain: boolean;
}

/**
 * Admin helpers for linking a name-only placeholder member to a real NEI
 * account. Hand-written (not in the generated client yet) following the
 * generated service shape so it can be swapped for a regenerated service later.
 */
export class TeamMemberLinkService {
  /** Search NEI accounts by name or email (team managers only). */
  public static searchOidcUsers(q: string): CancelablePromise<Array<OidcUserSearchResult>> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/api/rally/v1/user/search",
      query: { q },
      errors: { 422: "Validation Error" },
    });
  }

  /** Link a placeholder member to a chosen NEI account (by Authentik subject). */
  public static linkMember(
    teamId: number,
    placeholderUserId: number,
    account: Pick<OidcUserSearchResult, "authentik_sub" | "name" | "email">,
  ): CancelablePromise<LinkedMemberResponse> {
    return __request(OpenAPI, {
      method: "POST",
      url: "/api/rally/v1/team/{team_id}/members/{user_id}/link",
      path: { team_id: teamId, user_id: placeholderUserId },
      body: {
        authentik_sub: account.authentik_sub,
        name: account.name,
        email: account.email ?? null,
      },
      mediaType: "application/json",
      errors: { 404: "Not found", 422: "Validation Error" },
    });
  }

  /**
   * Self-serve link: whoever is holding the team access-code session claims
   * a placeholder slot in that team using the NEI account they just logged
   * in with. Authenticated by the OIDC bearer alone (the team token is no
   * longer sent once the OIDC login completes), so `teamId` must be passed
   * explicitly — captured by the caller before the OIDC redirect.
   */
  public static linkSelf(
    teamId: number,
    placeholderUserId: number,
  ): CancelablePromise<LinkedMemberResponse> {
    return __request(OpenAPI, {
      method: "POST",
      url: "/api/rally/v1/team/{team_id}/members/{user_id}/link-self",
      path: { team_id: teamId, user_id: placeholderUserId },
      errors: { 401: "Unauthorized", 404: "Not found", 422: "Validation Error" },
    });
  }
}

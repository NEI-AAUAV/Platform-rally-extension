import type { CancelablePromise } from "@/client";
import { OpenAPI } from "@/client/core/OpenAPI";
import { request as __request } from "@/client/core/request";
import type { ClaimableTeam, ParticipationEntry, ProfileResponse } from "@/types/profile";

/**
 * The caller's rally profile + participation history. Hand-written (these
 * endpoints are not in the generated client yet) following the generated
 * service shape so it can be swapped for a regenerated service later.
 */
export class ProfileService {
  /** Identity + participation history for the authenticated NEI user. */
  public static getMyProfile(): CancelablePromise<ProfileResponse> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/api/rally/v1/profile/me",
    });
  }

  /** Past participations (newest first). */
  public static getMyHistory(): CancelablePromise<Array<ParticipationEntry>> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/api/rally/v1/profile/history",
    });
  }

  /** Name-only members of a team (by access code) the caller can claim. */
  public static getClaimable(accessCode: string): CancelablePromise<ClaimableTeam> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/api/rally/v1/profile/claimable",
      query: { access_code: accessCode },
      errors: { 404: "Team not found", 422: "Validation Error" },
    });
  }

  /** Claim a name-only team member as the caller's own participation. */
  public static claimMembership(memberUserId: number): CancelablePromise<ParticipationEntry> {
    return __request(OpenAPI, {
      method: "POST",
      url: "/api/rally/v1/profile/claim/{member_user_id}",
      path: { member_user_id: memberUserId },
      errors: { 422: "Validation Error" },
    });
  }
}

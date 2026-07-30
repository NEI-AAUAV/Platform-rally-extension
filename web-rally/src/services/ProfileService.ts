import { client } from "@/client/client.gen";
import type { ClaimableTeam, ParticipationEntry, ProfileResponse } from "@/types/profile";

/**
 * The caller's rally profile + participation history. Hand-written (these
 * endpoints are not in the generated client yet) following the generated
 * service shape so it can be swapped for a regenerated service later.
 */
export class ProfileService {
  /** Identity + participation history for the authenticated NEI user. */
  public static async getMyProfile(): Promise<ProfileResponse> {
    const { data } = await client.get<ProfileResponse>({
      url: "/api/rally/v1/profile/me",
    });
    return data as ProfileResponse;
  }

  /** Past participations (newest first). */
  public static async getMyHistory(): Promise<Array<ParticipationEntry>> {
    const { data } = await client.get<Array<ParticipationEntry>>({
      url: "/api/rally/v1/profile/history",
    });
    return data as Array<ParticipationEntry>;
  }

  /** Name-only members of a team (by access code) the caller can claim. */
  public static async getClaimable(accessCode: string): Promise<ClaimableTeam> {
    const { data } = await client.get<ClaimableTeam>({
      url: "/api/rally/v1/profile/claimable",
      query: { access_code: accessCode },
    });
    return data as ClaimableTeam;
  }

  /**
   * Claim a name-only team member as the caller's own participation. The team's
   * access code is re-sent because it is what ties the caller to that roster.
   */
  public static async claimMembership(
    memberUserId: number,
    accessCode: string,
  ): Promise<ParticipationEntry> {
    const { data } = await client.post<ParticipationEntry>({
      url: "/api/rally/v1/profile/claim/{member_user_id}",
      path: { member_user_id: memberUserId },
      body: { access_code: accessCode },
    });
    return data as ParticipationEntry;
  }
}

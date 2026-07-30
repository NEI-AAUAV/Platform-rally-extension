import { client } from "@/client/client.gen";

export interface CheckinResponse {
  team_id: number;
  checkpoint_id: number;
  checkpoint_order: number;
}

export type StaffCheckinStatus = "checked_in" | "already_present" | "ahead";

export interface StaffCheckinResponse {
  team_id: number;
  team_name: string;
  checkpoint_id: number;
  checkpoint_order: number;
  status: StaffCheckinStatus;
}

/**
 * Team QR self-check-in. Hand-written to the generated client shape (these
 * endpoints are not in the generated client yet).
 */
export class CheckinService {
  /** Staff: mint a rotating check-in token for the caller's checkpoint.
   *  Admins/managers may pass a checkpointId to mint it for any checkpoint. */
  public static async getCheckinToken(checkpointId?: number): Promise<{ token: string }> {
    const { data } = await client.get<unknown>({
      url: "/api/rally/v1/checkpoint/checkin-token",
      query: checkpointId != null ? { checkpoint_id: checkpointId } : undefined,
    });
    return data as { token: string };
  }

  /** Staff: check an arriving team in by its scanned access code. */
  public static async staffCheckIn(
    teamCode: string,
    checkpointId?: number,
  ): Promise<StaffCheckinResponse> {
    const { data } = await client.post<StaffCheckinResponse>({
      url: "/api/rally/v1/checkpoint/staff-check-in",
      body: { team_code: teamCode, checkpoint_id: checkpointId ?? null },
    });
    return data as StaffCheckinResponse;
  }

  /** Team: check into the checkpoint encoded in a scanned token. */
  public static async checkIn(token: string): Promise<CheckinResponse> {
    const { data } = await client.post<CheckinResponse>({
      url: "/api/rally/v1/checkpoint/check-in",
      body: { token },
    });
    return data as CheckinResponse;
  }
}

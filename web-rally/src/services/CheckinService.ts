import type { CancelablePromise } from "@/client";
import { OpenAPI } from "@/client/core/OpenAPI";
import { request as __request } from "@/client/core/request";

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
  public static getCheckinToken(checkpointId?: number): CancelablePromise<{ token: string }> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/api/rally/v1/checkpoint/checkin-token",
      query: checkpointId != null ? { checkpoint_id: checkpointId } : undefined,
    });
  }

  /** Staff: check an arriving team in by its scanned access code. */
  public static staffCheckIn(
    teamCode: string,
    checkpointId?: number,
  ): CancelablePromise<StaffCheckinResponse> {
    return __request(OpenAPI, {
      method: "POST",
      url: "/api/rally/v1/checkpoint/staff-check-in",
      body: { team_code: teamCode, checkpoint_id: checkpointId ?? null },
      mediaType: "application/json",
      errors: { 422: "Validation Error" },
    });
  }

  /** Team: check into the checkpoint encoded in a scanned token. */
  public static checkIn(token: string): CancelablePromise<CheckinResponse> {
    return __request(OpenAPI, {
      method: "POST",
      url: "/api/rally/v1/checkpoint/check-in",
      body: { token },
      mediaType: "application/json",
      errors: { 422: "Validation Error" },
    });
  }
}

import type { CancelablePromise } from "@/client";
import { OpenAPI } from "@/client/core/OpenAPI";
import { request as __request } from "@/client/core/request";

export interface CheckinResponse {
  team_id: number;
  checkpoint_id: number;
  checkpoint_order: number;
}

/**
 * Team QR self-check-in. Hand-written to the generated client shape (these
 * endpoints are not in the generated client yet).
 */
export class CheckinService {
  /** Staff: mint a rotating check-in token for the caller's checkpoint. */
  public static getCheckinToken(): CancelablePromise<{ token: string }> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/api/rally/v1/checkpoint/checkin-token",
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

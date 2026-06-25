import { useQuery } from "@tanstack/react-query";
import { CheckinService } from "@/services/CheckinService";

/** Refresh the QR before the 90s backend TTL lapses. */
export const CHECKIN_TOKEN_REFRESH_MS = 45_000;

/**
 * Staff: poll a rotating check-in token for the caller's checkpoint. Errors
 * (404 when self check-in is disabled, 403 with no checkpoint) are not retried
 * so callers can hide the panel cleanly.
 */
export function useCheckinToken(enabled = true) {
  return useQuery({
    queryKey: ["checkin-token"],
    queryFn: () => CheckinService.getCheckinToken(),
    enabled,
    refetchInterval: CHECKIN_TOKEN_REFRESH_MS,
    refetchIntervalInBackground: true,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
}

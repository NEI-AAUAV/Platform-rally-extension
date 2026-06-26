import { useQuery } from "@tanstack/react-query";
import { ProfileService } from "@/services/ProfileService";
import { useUserStore } from "@/stores/useUserStore";

/**
 * The authenticated NEI user's rally profile (identity + participation
 * history). Disabled until an OIDC session exists; `retry: false` so an
 * unauthorised response surfaces cleanly instead of looping.
 */
export function useProfile() {
  const sub = useUserStore((s) => s.sub);
  return useQuery({
    queryKey: ["profile", "me"],
    queryFn: ProfileService.getMyProfile,
    enabled: sub !== undefined,
    retry: false,
  });
}

import { useQuery } from "@tanstack/react-query";
import { RallySettingsService, type RallySettingsResponse } from "@/client";
import { useUserStore } from "@/stores/useUserStore";

export default function useRallySettings() {
  const { sub } = useUserStore((state) => state);
  const isAuthenticated = sub !== undefined;
  
  const { data, isLoading, error, refetch } = useQuery<RallySettingsResponse>({
    queryKey: ["rallySettings-public"],
    queryFn: async () => {
      // Always try public endpoint first
      const response = await fetch("/api/rally/v1/rally/settings/public");
      if (!response.ok) {
        throw new Error(`Public endpoint failed: ${response.status}`);
      }
      return response.json();
    },
    retry: false,
  });

  return {
    settings: data,
    isLoading,
    error,
    refetch,
  };
}


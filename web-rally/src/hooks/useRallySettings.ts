import { useQuery } from "@tanstack/react-query";
import { type RallySettingsResponse, SettingsService } from "@/client";

export default function useRallySettings(options?: { retry?: boolean | number }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["rallySettings-public"],
    queryFn: async (): Promise<RallySettingsResponse> => {
      // Use the generated service method
      return SettingsService.viewRallySettingsPublicApiRallyV1RallySettingsPublicGet();
    },
    retry: options?.retry ?? 2, // Retry up to 2 times by default
    retryDelay: 1000, // Wait 1 second between retries
    staleTime: 0, // Always consider data stale to force refetch
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: true, // Refetch when window gains focus
    refetchOnMount: true, // Always refetch on mount
  });

  return {
    settings: data,
    isLoading,
    error,
    refetch,
  };
}


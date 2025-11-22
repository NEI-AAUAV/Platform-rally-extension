import { useQuery } from "@tanstack/react-query";
import { type RallySettingsResponse, SettingsService } from "@/client/index";

/**
 * Hook to fetch Rally settings from the public settings endpoint
 * 
 * Fetches settings that are publicly accessible (no authentication required).
 * Supports custom retry configuration.
 * 
 * @param options - Optional configuration
 * @param options.retry - Retry configuration (boolean or number of retries)
 * @returns React Query result with Rally settings
 * 
 * @example
 * ```tsx
 * const { settings, isLoading } = useRallySettings();
 * if (settings?.show_live_leaderboard) {
 *   // Show leaderboard
 * }
 * ```
 */
export default function useRallySettings(options?: { retry?: boolean | number }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["rallySettings-public"],
    queryFn: async (): Promise<RallySettingsResponse> => {
      // Use the generated service method
      return SettingsService.viewRallySettingsPublicApiRallyV1RallySettingsPublicGet();
    },
    retry: options?.retry ?? 2, // Retry up to 2 times by default
    retryDelay: 1000, // Wait 1 second between retries
    staleTime: 30000, // Consider data fresh for 30 seconds to reduce unnecessary refetches
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


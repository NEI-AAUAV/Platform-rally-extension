import { useQuery } from "@tanstack/react-query";
import { type RallySettingsResponse, viewRallySettingsPublic } from "@/client";

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
      const { data } = await viewRallySettingsPublic();
      return data;
    },
    retry: options?.retry ?? 2, // Retry up to 2 times by default
    retryDelay: 1000, // Wait 1 second between retries
    staleTime: 30000, // Consider data fresh for 30 seconds to reduce unnecessary refetches
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: true, // Refetch when window gains focus
    refetchOnMount: true, // Always refetch on mount
    // A failed settings fetch must not re-fetch just because new observers
    // mount. The layout swaps its whole subtree between the loading screen and
    // the app shell depending on this query, so mount-triggered retries feed
    // themselves: fetch -> pending -> loading screen unmounts the shell ->
    // error -> shell remounts -> refetch. That loop never settles and pins the
    // UI on "A carregar" whenever the endpoint answers 401/5xx.
    retryOnMount: false,
  });

  return {
    settings: data,
    isLoading,
    error,
    refetch,
  };
}

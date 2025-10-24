import { useQuery } from "@tanstack/react-query";
import { type RallySettingsResponse } from "@/client";

export default function useRallySettings() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["rallySettings-public"],
    queryFn: async (): Promise<RallySettingsResponse> => {
      // Use the generated service method
      const response = await fetch("/api/rally/v1/rally/settings/public");
      if (!response.ok) {
        throw new Error(`Public endpoint failed: ${response.status}`);
      }
      return response.json() as Promise<RallySettingsResponse>;
    },
    retry: (failureCount, error) => {
      // Disable retries in test environments
      // Check multiple indicators for test environment
      const isTestEnv = process.env.NODE_ENV === 'test' || 
                       process.env.NODE_ENV === 'development' ||
                       process.env.VITEST === 'true' ||
                       process.env.CI === 'true' ||
                       typeof window !== 'undefined' && 
                       (window.location.href.includes('test') || 
                        window.location.href.includes('localhost'));
      
      return !isTestEnv && failureCount < 2;
    },
    retryDelay: 1000, // Wait 1 second between retries
    staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });

  return {
    settings: data,
    isLoading,
    error,
    refetch,
  };
}


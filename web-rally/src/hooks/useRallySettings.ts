import { useQuery } from "@tanstack/react-query";
import { type RallySettingsResponse } from "@/client";

export default function useRallySettings() {
  const { data, isLoading, error, refetch } = useQuery<RallySettingsResponse>({
    queryKey: ["rallySettings-public"],
    queryFn: async () => {
      // Use the generated service method
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


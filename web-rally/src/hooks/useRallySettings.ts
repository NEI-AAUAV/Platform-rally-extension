import { useQuery } from "@tanstack/react-query";
import { RallySettingsService, type RallySettingsResponse } from "@/client";

export default function useRallySettings() {
  const { data, isLoading, error, refetch } = useQuery<RallySettingsResponse>({
    queryKey: ["rallySettings-public"],
    queryFn: RallySettingsService.getRallySettings,
  });

  return {
    settings: data,
    isLoading,
    error,
    refetch,
  };
}



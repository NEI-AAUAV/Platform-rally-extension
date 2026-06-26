import { useQuery } from "@tanstack/react-query";
import { Swords } from "lucide-react";
import useUser from "@/hooks/useUser";
import useRallySettings from "@/hooks/useRallySettings";
import useFallbackNavigation from "@/hooks/useFallbackNavigation";
import { Navigate } from "@tanstack/react-router";
import { LoadingState, FeatureDisabledAlert, PageHeader } from "@/components/shared";
import { VersusPairForm, VersusGroupList } from "./components";
import { TeamService, VersusService, type ListingTeam, type VersusGroupListResponse } from "@/client";

export default function Versus() {
  const { isLoading, isRallyAdmin } = useUser();
  const { settings } = useRallySettings();
  const fallbackPath = useFallbackNavigation();

  // Fetch teams
  const { data: teams, refetch: refetchTeams } = useQuery<ListingTeam[]>({
    queryKey: ["teams"],
    queryFn: () => TeamService.getTeamsApiRallyV1TeamGet(),
  });

  // Fetch versus groups
  const { data: versusGroups, refetch: refetchVersusGroups } = useQuery<VersusGroupListResponse>({
    queryKey: ["versusGroups"],
    queryFn: () => VersusService.listVersusGroupsApiRallyV1VersusGroupsGet(),
    enabled: isRallyAdmin,
  });

  const handleSuccess = () => {
    refetchVersusGroups();
    refetchTeams();
  };

  if (isLoading) {
    return <LoadingState message="Carregando..." />;
  }

  if (!isRallyAdmin) {
    return <Navigate to={fallbackPath} />;
  }

  if (!settings?.enable_versus) {
    return (
      <FeatureDisabledAlert
        featureName="modo versus"
        settingsPath="/settings"
      />
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Confrontos diretos"
        icon={Swords}
        title="Modo Versus"
        description="Gerir pares de equipas para competições diretas."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start">
        <div className="lg:sticky lg:top-24">
          <VersusPairForm teams={teams} onSuccess={handleSuccess} />
        </div>
        <VersusGroupList versusGroups={versusGroups} teams={teams} onSuccess={handleSuccess} />
      </div>
    </div>
  );
}



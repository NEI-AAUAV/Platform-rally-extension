import { useQuery } from "@tanstack/react-query";
import { Swords } from "lucide-react";
import useUser from "@/hooks/useUser";
import useRallySettings from "@/hooks/useRallySettings";
import { Navigate } from "react-router-dom";
import { LoadingState, FeatureDisabledAlert } from "@/components/shared";
import { VersusPairForm, VersusGroupList } from "./components";
import { TeamService, VersusService, type ListingTeam, type VersusGroupListResponse } from "@/client";

export default function Versus() {
  const { isLoading, isRallyAdmin } = useUser();
  const { settings } = useRallySettings();

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
    return <Navigate to="/scoreboard" />;
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
    <div className="mt-16 space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2 flex items-center justify-center gap-2">
          <Swords className="w-6 h-6" />
          Modo Versus
        </h2>
        <p className="text-[rgb(255,255,255,0.7)]">
          Gerir pares de equipas para competições diretas
        </p>
      </div>

      <VersusPairForm teams={teams} onSuccess={handleSuccess} />

      <VersusGroupList versusGroups={versusGroups} teams={teams} onSuccess={handleSuccess} />
    </div>
  );
}



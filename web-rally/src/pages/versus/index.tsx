import { useQuery } from "@tanstack/react-query";
import { Swords } from "lucide-react";
import useUser from "@/hooks/useUser";
import useRallySettings from "@/hooks/useRallySettings";
import { Navigate } from "react-router-dom";
import { LoadingState, FeatureDisabledAlert } from "@/components/shared";
import { VersusPairForm, VersusGroupList } from "./components";
import { TeamService, VersusService, type VersusGroupListResponse } from "@/client";

interface VersusPair {
  group_id: number;
  team_a_id: number;
  team_b_id: number;
}


interface VersusGroupListResponse {
  groups: VersusPair[];
}

export default function Versus() {
  const { isLoading, userStore } = useUser();
  const { settings } = useRallySettings();
  
  // Check if user is manager-rally or admin
  const isManager = userStore.scopes?.includes("manager-rally") || 
                   userStore.scopes?.includes("admin");

  // Fetch teams
  const { data: teams, refetch: refetchTeams } = useQuery({
    queryKey: ["teams"],
    queryFn: () => TeamService.getTeamsApiRallyV1TeamGet(),
  });

  // Fetch versus groups
  const { data: versusGroups, refetch: refetchVersusGroups } = useQuery({
    queryKey: ["versusGroups"],
    queryFn: () => VersusService.listVersusGroupsApiRallyV1VersusGroupsGet(),
    enabled: isManager,
  });

  const handleSuccess = () => {
    refetchVersusGroups();
    refetchTeams();
  };

  if (isLoading) {
    return <LoadingState message="Carregando..." />;
  }

  if (!isManager) {
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

      <VersusPairForm
        teams={teams}
        userToken={userStore.token}
        onSuccess={handleSuccess}
      />

      <VersusGroupList
        versusGroups={versusGroups}
        teams={teams}
        userToken={userStore.token}
        onSuccess={handleSuccess}
      />
    </div>
  );
}



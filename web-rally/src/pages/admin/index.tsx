import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useThemedComponents } from "@/components/themes";
import { Users, MapPin, Activity as ActivityIcon } from "lucide-react";
import useUser from "@/hooks/useUser";
import { PageHeader } from "@/components/shared";
import { TeamManagement, CheckpointManagement, ActivityManagement } from "./components";
import { CheckPointService } from "@/client";

interface Checkpoint {
  id: number;
  name: string;
  description: string;
  order: number;
}


export default function Admin() {
  const { Button } = useThemedComponents();
  const { isLoading, userStore } = useUser();
  
  // Check if user is manager-rally or admin
  const isManager = userStore.scopes?.includes("manager-rally") || 
                   userStore.scopes?.includes("admin");

  const [activeTab, setActiveTab] = useState<"teams" | "checkpoints" | "activities">("teams");

  // Fetch checkpoints for activities
  const { data: checkpoints } = useQuery<Checkpoint[]>({
    queryKey: ["checkpoints"],
    queryFn: async (): Promise<Checkpoint[]> => {
      const data = await CheckPointService.getCheckpointsApiRallyV1CheckpointGet();
      return Array.isArray(data) ? data : [];
    },
    enabled: isManager && !!userStore.token,
  });

  if (isLoading) {
    return <div className="mt-16 text-center">Carregando...</div>;
  }

  if (!isManager) {
    return <Navigate to="/scoreboard" />;
  }

  return (
    <div className="mt-16 space-y-8">
      <PageHeader 
        title="Gestão Administrativa"
        description="Criar e editar equipas, postos (checkpoints) e atividades do Rally Tascas"
      />

      {/* Tab Navigation */}
      <div className="flex justify-center gap-4">
        <Button
          variant={activeTab === "teams" ? "default" : "neutral"}
          onClick={() => setActiveTab("teams")}
        >
          <Users className="w-4 h-4 mr-2" />
          Equipas
        </Button>
        <Button
          variant={activeTab === "checkpoints" ? "default" : "neutral"}
          onClick={() => setActiveTab("checkpoints")}
        >
          <MapPin className="w-4 h-4 mr-2" />
          Checkpoints
        </Button>
        <Button
          variant={activeTab === "activities" ? "default" : "neutral"}
          onClick={() => setActiveTab("activities")}
        >
          <ActivityIcon className="w-4 h-4 mr-2" />
          Atividades
        </Button>
      </div>

      {/* Tab Content */}
      {activeTab === "teams" && (
        <TeamManagement userStore={userStore} />
      )}

      {activeTab === "checkpoints" && (
        <CheckpointManagement userStore={userStore} />
      )}

      {activeTab === "activities" && (
        <ActivityManagement checkpoints={checkpoints || []} />
      )}
    </div>
  );
}
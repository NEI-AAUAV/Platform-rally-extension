import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BloodyButton } from "@/components/themes/bloody";
import { Users, MapPin, Activity as ActivityIcon } from "lucide-react";
import useUser from "@/hooks/useUser";
import { PageHeader } from "@/components/shared";
import { TeamManagement, CheckpointManagement, ActivityManagement } from "./components";

interface Checkpoint {
  id: number;
  name: string;
  description: string;
  order: number;
}


export default function Admin() {
  const { isLoading, userStoreStuff } = useUser();
  
  // Check if user is manager-rally or admin
  const isManager = userStoreStuff.scopes?.includes("manager-rally") || 
                   userStoreStuff.scopes?.includes("admin");

  const [activeTab, setActiveTab] = useState<"teams" | "checkpoints" | "activities">("teams");

  // Fetch checkpoints for activities
  const { data: checkpoints } = useQuery({
    queryKey: ["checkpoints"],
    queryFn: async () => {
      const response = await fetch("/api/rally/v1/checkpoint/", {
        headers: {
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch checkpoints");
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: isManager && !!userStoreStuff.token,
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
        description="Criar e editar equipas e checkpoints do Rally"
      />

      {/* Tab Navigation */}
      <div className="flex justify-center gap-4">
        <BloodyButton
          blood={activeTab === "teams"}
          variant={activeTab === "teams" ? "default" : "neutral"}
          onClick={() => setActiveTab("teams")}
        >
          <Users className="w-4 h-4 mr-2" />
          Equipas
        </BloodyButton>
        <BloodyButton
          blood={activeTab === "checkpoints"}
          variant={activeTab === "checkpoints" ? "default" : "neutral"}
          onClick={() => setActiveTab("checkpoints")}
        >
          <MapPin className="w-4 h-4 mr-2" />
          Checkpoints
        </BloodyButton>
        <BloodyButton
          blood={activeTab === "activities"}
          variant={activeTab === "activities" ? "default" : "neutral"}
          onClick={() => setActiveTab("activities")}
        >
          <ActivityIcon className="w-4 h-4 mr-2" />
          Atividades
        </BloodyButton>
      </div>

      {/* Tab Content */}
      {activeTab === "teams" && (
        <TeamManagement userStoreStuff={userStoreStuff} />
      )}

      {activeTab === "checkpoints" && (
        <CheckpointManagement userStoreStuff={userStoreStuff} />
      )}

      {activeTab === "activities" && (
        <ActivityManagement checkpoints={checkpoints || []} />
      )}
    </div>
  );
}
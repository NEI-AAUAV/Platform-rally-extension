import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import useUser from "@/hooks/useUser";
import { Navigate } from "react-router-dom";
import { LoadingState } from "@/components/shared";
import { TeamSelector, MemberForm, MemberList } from "./components";


interface TeamMember {
  id: number;
  name: string;
  email?: string;
  is_captain: boolean;
}

export default function TeamMembers() {
  const { isLoading, userStoreStuff } = useUser();
  
  // Check if user is manager-rally or admin
  const isManager = userStoreStuff.scopes?.includes("manager-rally") || 
                   userStoreStuff.scopes?.includes("admin");

  const [selectedTeam, setSelectedTeam] = useState<string>("");

  // Fetch teams
  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const response = await fetch("/api/rally/v1/team/");
      if (!response.ok) throw new Error("Failed to fetch teams");
      return response.json();
    },
  });

  // Fetch team members
  const { data: teamMembers, refetch: refetchTeamMembers } = useQuery({
    queryKey: ["teamMembers", selectedTeam],
    queryFn: async () => {
      if (!selectedTeam) return [];
      const response = await fetch(`/api/rally/v1/team/${selectedTeam}/members`, {
        headers: {
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch team members");
      return response.json() as Promise<TeamMember[]>;
    },
    enabled: !!selectedTeam && isManager,
  });

  const handleSuccess = () => {
    refetchTeamMembers();
  };

  if (isLoading) {
    return <LoadingState message="Carregando..." />;
  }

  if (!isManager) {
    return <Navigate to="/scoreboard" />;
  }

  return (
    <div className="mt-16 space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2 flex items-center justify-center gap-2">
          <Users className="w-6 h-6" />
          Gestão de Membros das Equipas
        </h2>
        <p className="text-[rgb(255,255,255,0.7)]">
          Adicionar e remover membros das equipas do Rally
        </p>
      </div>

      <TeamSelector
        teams={teams}
        selectedTeam={selectedTeam}
        onTeamChange={setSelectedTeam}
      />

      {selectedTeam && (
        <>
          <MemberForm
            selectedTeam={selectedTeam}
            userToken={userStoreStuff.token}
            onSuccess={handleSuccess}
          />

          <MemberList
            teamMembers={teamMembers}
            selectedTeam={selectedTeam}
            userToken={userStoreStuff.token}
            onSuccess={handleSuccess}
          />
        </>
      )}
    </div>
  );
}

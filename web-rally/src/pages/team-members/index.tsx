import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import useUser from "@/hooks/useUser";
import { Navigate } from "react-router-dom";
import { LoadingState } from "@/components/shared";
import { TeamSelector, MemberForm, MemberList } from "./components";
import { TeamService, TeamMembersService } from "@/client";

export default function TeamMembers() {
  const { isLoading, userStore } = useUser();
  
  // Check if user is manager-rally or admin
  const isManager = userStore.scopes?.includes("manager-rally") || 
                   userStore.scopes?.includes("admin");

  const [selectedTeam, setSelectedTeam] = useState<string>("");

  // Fetch teams with better error handling
  const { data: teams, error: teamsError, isLoading: teamsLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: () => TeamService.getTeamsApiRallyV1TeamGet(),
    refetchOnWindowFocus: true, // Refetch when window gains focus
    refetchOnMount: true, // Always refetch on mount
    staleTime: 0, // Always consider data stale
  });

  // Fetch team members with better error handling
  const { data: teamMembers, refetch: refetchTeamMembers, error: membersError, isLoading: membersLoading } = useQuery({
    queryKey: ["teamMembers", selectedTeam],
    queryFn: async () => {
      if (!selectedTeam) return [];
      return TeamMembersService.getTeamMembersApiRallyV1TeamTeamIdMembersGet(parseInt(selectedTeam));
    },
    enabled: !!selectedTeam && isManager,
    refetchOnWindowFocus: true, // Refetch when window gains focus
    refetchOnMount: true, // Always refetch on mount
    staleTime: 0, // Always consider data stale
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

      {/* Error displays */}
      {teamsError && (
        <div className="bg-red-600/20 border border-red-500 rounded-lg p-4">
          <h3 className="text-red-300 font-semibold mb-2">Erro ao carregar equipas:</h3>
          <p className="text-red-200 text-sm">{teamsError.message}</p>
        </div>
      )}

      {membersError && (
        <div className="bg-red-600/20 border border-red-500 rounded-lg p-4">
          <h3 className="text-red-300 font-semibold mb-2">Erro ao carregar membros:</h3>
          <p className="text-red-200 text-sm">{membersError.message}</p>
        </div>
      )}

      {/* Loading states */}
      {teamsLoading && (
        <div className="bg-blue-600/20 border border-blue-500 rounded-lg p-4">
          <p className="text-blue-200">A carregar equipas...</p>
        </div>
      )}

      <TeamSelector
        teams={teams}
        selectedTeam={selectedTeam}
        onTeamChange={setSelectedTeam}
      />

      {selectedTeam && (
        <>
          {membersLoading && (
            <div className="bg-blue-600/20 border border-blue-500 rounded-lg p-4">
              <p className="text-blue-200">A carregar membros da equipa...</p>
            </div>
          )}

          <MemberForm
            selectedTeam={selectedTeam}
            userToken={userStore.token || ""}
            onSuccess={handleSuccess}
          />

          <MemberList
            teamMembers={teamMembers as any}
            selectedTeam={selectedTeam}
            userToken={userStore.token || ""}
            onSuccess={handleSuccess}
          />
        </>
      )}


      {/* Helpful messages */}
      {!teamsLoading && !teamsError && (!teams || teams.length === 0) && (
        <div className="bg-yellow-600/20 border border-yellow-500 rounded-lg p-4">
          <h3 className="text-yellow-300 font-semibold mb-2">Nenhuma equipa encontrada</h3>
          <p className="text-yellow-200 text-sm mb-2">
            Não existem equipas criadas ainda. Para gerir membros das equipas, primeiro precisa de criar equipas.
          </p>
          <p className="text-yellow-200 text-sm">
            Vá à página <strong>Admin</strong> para criar equipas primeiro.
          </p>
        </div>
      )}
    </div>
  );
}

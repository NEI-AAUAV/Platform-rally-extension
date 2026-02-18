import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import useUser from "@/hooks/useUser";
import useFallbackNavigation from "@/hooks/useFallbackNavigation";
import { useUserStore } from "@/stores/useUserStore";
import { Navigate } from "react-router-dom";
import { LoadingState } from "@/components/shared";
import { TeamSelector, MemberForm, MemberList } from "./components";
import { TeamService, TeamMembersService, type ListingTeam, type TeamMemberResponse } from "@/client";
import { refreshToken } from "@/services/client";
import { useThemedComponents } from "@/components/themes";
import QRCodeDisplay from "@/components/QRCodeDisplay";
import { QrCode } from "lucide-react";
import type { DetailedTeam } from "@/client";

interface ExtendedDetailedTeam extends DetailedTeam {
  access_code?: string;
}

export default function TeamMembers() {
  const { Card } = useThemedComponents();
  const { isLoading, isRallyAdmin, userStore } = useUser();
  const token = useUserStore((state) => state.token);
  const fallbackPath = useFallbackNavigation();
  
  const isStaff = userStore?.scopes?.includes("rally-staff");

  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const queryClient = useQueryClient();

  // Fetch teams with better error handling
  const { data: teams, error: teamsError, isLoading: teamsLoading } = useQuery<ListingTeam[]>({
    queryKey: ["teams"],
    queryFn: () => TeamService.getTeamsApiRallyV1TeamGet(),
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 0,
  });

  // Fetch team members with better error handling
  const {
    data: teamMembers,
    refetch: refetchTeamMembers,
    error: membersError,
    isLoading: membersLoading,
  } = useQuery<TeamMemberResponse[]>({
    queryKey: ["teamMembers", selectedTeam],
    queryFn: async () => {
      if (!selectedTeam) return [];
      return TeamMembersService.getTeamMembersApiRallyV1TeamTeamIdMembersGet(Number(selectedTeam));
    },
    enabled: !!selectedTeam && (isRallyAdmin || isStaff),
    onError: async (error) => {
      const status = (error as any)?.status ?? (error as any)?.response?.status;
      if (status === 403) {
        try {
          await refreshToken();
          // Invalidate to trigger refetch with possibly refreshed credentials
          queryClient.invalidateQueries(["teamMembers", selectedTeam]);
        } catch (e) {
          // ignore refresh failures here; the UI will show error
        }
      }
    },
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 0,
  });

  // Fetch team data for QR code (staff only)
  const { data: teamData } = useQuery({
    queryKey: ["team", selectedTeam],
    queryFn: () => TeamService.getTeamByIdApiRallyV1TeamIdGet(Number(selectedTeam)),
    enabled: !!selectedTeam && isStaff,
  });

  const handleSuccess = () => {
    refetchTeamMembers();
  };

  if (isLoading) {
    return <LoadingState message="Carregando..." />;
  }

  if (!isRallyAdmin && !isStaff) {
    return <Navigate to={fallbackPath} />;
  }

  const selectedTeamData = teams?.find(t => t.id === Number(selectedTeam));

  return (
    <div className="mt-16 space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2 flex items-center justify-center gap-2">
          <Users className="w-6 h-6" />
          {isRallyAdmin ? "Gestão de Membros das Equipas" : "Consultar Equipas"}
        </h2>
        <p className="text-[rgb(255,255,255,0.7)]">
          {isRallyAdmin
            ? "Adicionar e remover membros das equipas do Rally"
            : "Visualizar membros e código QR das equipas do Rally"}
        </p>
      </div>

      {/* Error displays */}
      {teamsError && (
        <Card variant="default" padding="md" rounded="lg" className="border-red-500/50 bg-red-600/10">
          <h3 className="text-red-300 font-semibold mb-2">Erro ao carregar equipas:</h3>
          <p className="text-red-200 text-sm">
            {teamsError instanceof Error ? teamsError.message : "Erro desconhecido"}
          </p>
        </Card>
      )}

      {membersError && (
        <Card variant="default" padding="md" rounded="lg" className="border-red-500/50 bg-red-600/10">
          <h3 className="text-red-300 font-semibold mb-2">Erro ao carregar membros:</h3>
          <p className="text-red-200 text-sm">
            {membersError instanceof Error ? membersError.message : "Erro desconhecido"}
          </p>
        </Card>
      )}

      {/* Loading states */}
      {teamsLoading && (
        <Card variant="default" padding="md" rounded="lg" className="border-blue-500/50 bg-blue-600/10">
          <p className="text-blue-200">A carregar equipas...</p>
        </Card>
      )}

      <TeamSelector
        teams={teams}
        selectedTeam={selectedTeam}
        onTeamChange={setSelectedTeam}
      />

      {selectedTeam && (
        <>
          {membersLoading && (
            <Card variant="default" padding="md" rounded="lg" className="border-blue-500/50 bg-blue-600/10">
              <p className="text-blue-200">A carregar membros da equipa...</p>
            </Card>
          )}

          {/* Admin View */}
          {isRallyAdmin && (
            <>
              <MemberForm
                selectedTeam={selectedTeam}
                userToken={token || ""}
                onSuccess={handleSuccess}
              />

              <MemberList
                teamMembers={(teamMembers || []).map(member => ({
                  id: member.id,
                  name: member.name,
                  email: member.email ?? undefined,
                  is_captain: member.is_captain ?? false,
                }))}
                selectedTeam={selectedTeam}
                userToken={token || ""}
                onSuccess={handleSuccess}
              />
            </>
          )}

          {/* Staff View */}
          {isStaff && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Team Members */}
              <Card variant="default" padding="lg" rounded="2xl">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Membros da Equipa
                </h3>
                <p className="text-sm text-[rgb(255,255,255,0.6)] mb-4">
                  {selectedTeamData?.name} • {teamMembers?.length || 0} membros
                </p>
                <div className="space-y-2">
                  {teamMembers?.length === 0 ? (
                    <p className="text-center opacity-50">Nenhum membro registado</p>
                  ) : (
                    teamMembers?.map((member) => (
                      <div
                        key={member.id}
                        className="p-3 rounded-lg bg-black/20 border border-white/10"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm font-bold">
                            {member.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{member.name}</p>
                            {member.email && (
                              <p className="text-xs text-[rgb(255,255,255,0.5)]">{member.email}</p>
                            )}
                          </div>
                          {member.is_captain && (
                            <span className="text-xs bg-yellow-600/30 text-yellow-300 px-2 py-1 rounded">
                              Capitão
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>


              {teamData && (
                <Card variant="default" padding="lg" rounded="2xl" className="flex flex-col items-center justify-center">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <QrCode className="w-5 h-5" />
                    Código QR
                  </h3>
                  <p className="text-sm text-[rgb(255,255,255,0.6)] mb-4 text-center">
                    Código de acesso: <strong>{(teamData as ExtendedDetailedTeam).access_code}</strong>
                  </p>
                  <div className="flex justify-center p-4 bg-white rounded-lg">
                    <QRCodeDisplay accessCode={(teamData as ExtendedDetailedTeam).access_code || ''} size={200} />
                  </div>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      {/* Helpful messages */}
      {!teamsLoading && !teamsError && (!teams || teams.length === 0) && (
        <Card variant="default" padding="md" rounded="lg" className="border-yellow-500/50 bg-yellow-600/10">
          <h3 className="text-yellow-300 font-semibold mb-2">Nenhuma equipa encontrada</h3>
          <p className="text-yellow-200 text-sm">
            {isRallyAdmin
              ? "Não existem equipas criadas ainda. Para gerir membros das equipas, primeiro precisa de criar equipas."
              : "Não existem equipas criadas ainda. Contacte um administrador."}
          </p>
        </Card>
      )}
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import useUser from "@/hooks/useUser";
import { useUserStore } from "@/stores/useUserStore";
import { Navigate } from "@tanstack/react-router";
import { LoadingState, PageHeader } from "@/components/shared";
import { TeamSelector, MemberForm, MemberList } from "./components";
import { TeamService, TeamMembersService, type ListingTeam, type TeamMemberResponse } from "@/client";
import QRCodeDisplay from "@/components/QRCodeDisplay";
import { QrCode } from "lucide-react";
import type { DetailedTeam } from "@/client";

type ExtendedDetailedTeam = Omit<DetailedTeam, 'access_code'> & { access_code?: string };

interface TeamMembersProps {
  readonly embedded?: boolean;
}

export default function TeamMembers({ embedded = false }: TeamMembersProps) {
  const { isLoading, isRallyAdmin, userStore } = useUser();
  const token = useUserStore((state) => state.token);
  const isStaff = userStore?.scopes?.includes("rally-staff");

  const [selectedTeam, setSelectedTeam] = useState<string>("");

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
  } = useQuery({
    queryKey: ["teamMembers", selectedTeam],
    queryFn: async (): Promise<TeamMemberResponse[]> => {
      if (!selectedTeam) return [];
      return TeamMembersService.getTeamMembersApiRallyV1TeamTeamIdMembersGet(Number(selectedTeam));
    },
    enabled: !!selectedTeam && (isRallyAdmin || isStaff),
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

  if (!embedded && !isRallyAdmin && !isStaff) {
    return <Navigate to="/scoreboard" />;
  }

  const selectedTeamData = teams?.find(t => t.id === Number(selectedTeam));

  return (
    <div className="space-y-8">
      {!embedded && (
        <PageHeader
          eyebrow="Equipas"
          icon={Users}
          title={isRallyAdmin ? "Gestão de membros" : "Consultar equipas"}
          description={
            isRallyAdmin
              ? "Adicionar e remover membros das equipas do rally."
              : "Visualizar membros e código QR das equipas do rally."
          }
        />
      )}

      {/* Error displays */}
      {teamsError && (
        <div className="border border-red-500/30 bg-red-50 dark:bg-red-950/30 rounded-lg p-4 sm:p-6">
          <h3 className="font-semibold text-red-700 dark:text-red-400 mb-2">Erro ao carregar equipas:</h3>
          <p className="text-sm text-red-700 dark:text-red-300">
            {teamsError instanceof Error ? teamsError.message : "Erro desconhecido"}
          </p>
        </div>
      )}

      {membersError && (
        <div className="border border-red-500/30 bg-red-50 dark:bg-red-950/30 rounded-lg p-4 sm:p-6">
          <h3 className="font-semibold text-red-700 dark:text-red-400 mb-2">Erro ao carregar membros:</h3>
          <p className="text-sm text-red-700 dark:text-red-300">
            {membersError instanceof Error ? membersError.message : "Erro desconhecido"}
          </p>
        </div>
      )}

      {/* Loading states */}
      {teamsLoading && (
        <div className="border border-border bg-muted rounded-lg p-4 sm:p-6">
          <p className="text-muted-foreground">A carregar equipas...</p>
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
            <div className="border border-border bg-muted rounded-lg p-4 sm:p-6">
              <p className="text-muted-foreground">A carregar membros da equipa...</p>
            </div>
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
              <div className="rally-surface rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Membros da Equipa
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {selectedTeamData?.name} • {teamMembers?.length || 0} membros
                </p>
                <div className="space-y-2">
                  {teamMembers?.length === 0 ? (
                    <p className="text-center opacity-50">Nenhum membro registado</p>
                  ) : (
                    teamMembers?.map((member) => (
                      <div
                        key={member.id}
                        className="p-3 rounded-lg bg-muted border border-border"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-bold">
                            {member.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{member.name}</p>
                            {member.email && (
                              <p className="text-xs text-muted-foreground">{member.email}</p>
                            )}
                          </div>
                          {member.is_captain && (
                            <span className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 px-2 py-1 rounded">
                              Capitão
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>


              {teamData && (
                <div className="rally-surface rounded-2xl p-6 flex flex-col items-center justify-center">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <QrCode className="w-5 h-5" />
                    Código QR
                  </h3>
                  <div className="flex justify-center">
                    <QRCodeDisplay accessCode={(teamData as ExtendedDetailedTeam).access_code || ''} size={200} />
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Helpful messages */}
      {!teamsLoading && !teamsError && (!teams || teams.length === 0) && (
        <div className="border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg p-4 sm:p-6">
          <h3 className="font-semibold text-yellow-800 dark:text-yellow-300 mb-2">Nenhuma equipa encontrada</h3>
          <p className="text-sm text-yellow-700 dark:text-yellow-200">
            {isRallyAdmin
              ? "Não existem equipas criadas ainda. Para gerir membros das equipas, primeiro precisa de criar equipas."
              : "Não existem equipas criadas ainda. Contacte um administrador."}
          </p>
        </div>
      )}
    </div>
  );
}

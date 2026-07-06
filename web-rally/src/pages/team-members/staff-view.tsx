import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, QrCode } from "lucide-react";
import useUser from "@/hooks/useUser";
import useFallbackNavigation from "@/hooks/useFallbackNavigation";
import { Navigate } from "@tanstack/react-router";
import { LoadingState } from "@/components/shared";
import { TeamSelector } from "./components";
import {
  TeamService,
  TeamMembersService,
  type ListingTeam,
  type TeamMemberResponse,
  type DetailedTeam,
} from "@/client";
import QRCodeDisplay from "@/components/QRCodeDisplay";

export default function StaffTeamView() {
  const { isLoading, userStore } = useUser();
  const fallbackPath = useFallbackNavigation();
  const isStaff = userStore?.scopes?.includes("rally-staff");

  const [selectedTeam, setSelectedTeam] = useState<string>("");

  // Fetch teams
  const {
    data: teams,
    error: teamsError,
    isLoading: teamsLoading,
  } = useQuery<ListingTeam[]>({
    queryKey: ["teams"],
    queryFn: () => TeamService.getTeamsApiRallyV1TeamGet(),
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 0,
  });

  // Fetch team members
  const {
    data: teamMembers,
    error: membersError,
    isLoading: membersLoading,
  } = useQuery<TeamMemberResponse[]>({
    queryKey: ["teamMembers", selectedTeam],
    queryFn: async () => {
      if (!selectedTeam) return [];
      return TeamMembersService.getTeamMembersApiRallyV1TeamTeamIdMembersGet(Number(selectedTeam));
    },
    enabled: !!selectedTeam,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 0,
  });

  // Fetch team data for QR code
  const { data: teamData } = useQuery({
    queryKey: ["team", selectedTeam],
    queryFn: () => TeamService.getTeamByIdApiRallyV1TeamIdGet(Number(selectedTeam)),
    enabled: !!selectedTeam,
  });

  if (isLoading) {
    return <LoadingState message="Carregando..." />;
  }

  if (!isStaff) {
    return <Navigate to={fallbackPath} />;
  }

  const selectedTeamData = teams?.find((t) => t.id === Number(selectedTeam));

  return (
    <div className="mt-2 space-y-6">
      <div className="text-center">
        <h2 className="mb-2 flex items-center justify-center gap-2 text-2xl font-bold">
          <Users className="h-6 w-6" />
          Consultar Equipas
        </h2>
        <p className="text-muted-foreground">Visualizar membros e código QR das equipas do Rally</p>
      </div>

      {/* Error displays */}
      {teamsError && (
        <div className="rounded-lg border border-red-500/30 bg-red-50 p-4 dark:bg-red-950/30 sm:p-6">
          <h3 className="mb-2 font-semibold text-red-700 dark:text-red-400">
            Erro ao carregar equipas:
          </h3>
          <p className="text-sm text-red-700 dark:text-red-300">
            {teamsError instanceof Error ? teamsError.message : "Erro desconhecido"}
          </p>
        </div>
      )}

      {membersError && (
        <div className="rounded-lg border border-red-500/30 bg-red-50 p-4 dark:bg-red-950/30 sm:p-6">
          <h3 className="mb-2 font-semibold text-red-700 dark:text-red-400">
            Erro ao carregar membros:
          </h3>
          <p className="text-sm text-red-700 dark:text-red-300">
            {membersError instanceof Error ? membersError.message : "Erro desconhecido"}
          </p>
        </div>
      )}

      {/* Loading states */}
      {teamsLoading && (
        <div className="rounded-lg border border-border bg-muted p-4 sm:p-6">
          <p className="text-muted-foreground">A carregar equipas...</p>
        </div>
      )}

      <TeamSelector teams={teams} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} />

      {selectedTeam && (
        <>
          {membersLoading && (
            <div className="rounded-lg border border-border bg-muted p-4 sm:p-6">
              <p className="text-muted-foreground">A carregar membros da equipa...</p>
            </div>
          )}

          {/* Team Info and QR Code */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Team Members */}
            <div className="rally-surface rounded-2xl p-6">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <Users className="h-5 w-5" />
                Membros da Equipa
              </h3>
              <p className="mb-4 text-sm text-muted-foreground">
                {selectedTeamData?.name} • {teamMembers?.length || 0} membros
              </p>
              <div className="space-y-2">
                {teamMembers?.length === 0 ? (
                  <p className="text-center opacity-50">Nenhum membro registado</p>
                ) : (
                  teamMembers?.map((member) => (
                    <div key={member.id} className="rounded-lg border border-border bg-muted p-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-bold">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{member.name}</p>
                          {member.email && (
                            <p className="text-xs text-muted-foreground">{member.email}</p>
                          )}
                        </div>
                        {member.is_captain && (
                          <span className="rounded bg-yellow-100 px-2 py-1 text-xs text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                            Capitão
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* QR Code */}
            {teamData && (
              <div className="rally-surface flex flex-col items-center justify-center rounded-2xl p-6">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                  <QrCode className="h-5 w-5" />
                  Código QR
                </h3>
                <div className="flex justify-center">
                  <QRCodeDisplay
                    accessCode={
                      (teamData as DetailedTeam & { access_code?: string }).access_code || ""
                    }
                    size={200}
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Helpful messages */}
      {!teamsLoading && !teamsError && (!teams || teams.length === 0) && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-50 p-4 dark:bg-yellow-950/30 sm:p-6">
          <h3 className="mb-2 font-semibold text-yellow-800 dark:text-yellow-300">
            Nenhuma equipa encontrada
          </h3>
          <p className="text-sm text-yellow-700 dark:text-yellow-200">
            Não existem equipas criadas ainda. Contacte um administrador.
          </p>
        </div>
      )}
    </div>
  );
}

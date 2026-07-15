import { useState } from "react";
import { Users } from "lucide-react";
import useUser from "@/hooks/useUser";
import useFallbackNavigation from "@/hooks/useFallbackNavigation";
import { Navigate } from "@tanstack/react-router";
import { LoadingState } from "@/components/shared";
import { TeamSelector, ErrorBanner, NoTeamsMessage, StaffTeamRoster } from "./components";
import { useTeamMembersData } from "./hooks/useTeamMembersData";

export default function StaffTeamView() {
  const { isLoading, userStore } = useUser();
  const fallbackPath = useFallbackNavigation();
  const isStaff = userStore?.scopes?.includes("rally-staff");

  const [selectedTeam, setSelectedTeam] = useState<string>("");

  const { teamsQuery, membersQuery, teamDataQuery } = useTeamMembersData(selectedTeam);
  const { data: teams, error: teamsError, isLoading: teamsLoading } = teamsQuery;
  const { data: teamMembers, error: membersError, isLoading: membersLoading } = membersQuery;
  const { data: teamData } = teamDataQuery;

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

      {teamsError && <ErrorBanner title="Erro ao carregar equipas:" error={teamsError} />}
      {membersError && <ErrorBanner title="Erro ao carregar membros:" error={membersError} />}

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

          <StaffTeamRoster
            teamName={selectedTeamData?.name}
            teamMembers={teamMembers}
            teamData={teamData}
          />
        </>
      )}

      {!teamsLoading && !teamsError && (!teams || teams.length === 0) && (
        <NoTeamsMessage description="Não existem equipas criadas ainda. Contacte um administrador." />
      )}
    </div>
  );
}

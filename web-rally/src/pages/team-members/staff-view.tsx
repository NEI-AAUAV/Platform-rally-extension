import { useState } from "react";
import { Users } from "lucide-react";
import useUser from "@/hooks/useUser";
import useFallbackNavigation from "@/hooks/useFallbackNavigation";
import { Navigate } from "@tanstack/react-router";
import { LoadingState } from "@/components/shared";
import {
  TeamSelector,
  StaffTeamRoster,
  TeamMembersErrorBanners,
  TeamsLoadingBanner,
  MembersLoadingBanner,
  NoTeamsBanner,
} from "./components";
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

      <TeamMembersErrorBanners teamsError={teamsError} membersError={membersError} />

      <TeamsLoadingBanner teamsLoading={teamsLoading} />

      <TeamSelector teams={teams} selectedTeam={selectedTeam} onTeamChange={setSelectedTeam} />

      {selectedTeam && (
        <>
          <MembersLoadingBanner membersLoading={membersLoading} />

          <StaffTeamRoster
            teamName={selectedTeamData?.name}
            teamMembers={teamMembers}
            teamData={teamData}
          />
        </>
      )}

      <NoTeamsBanner
        teamsLoading={teamsLoading}
        teamsError={teamsError}
        hasTeams={!!teams && teams.length > 0}
        description="Não existem equipas criadas ainda. Contacte um administrador."
      />
    </div>
  );
}

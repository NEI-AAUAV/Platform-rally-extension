import { useState } from "react";
import { Users } from "lucide-react";
import useUser from "@/hooks/useUser";
import { useUserStore } from "@/stores/useUserStore";
import { Navigate } from "@tanstack/react-router";
import { LoadingState, PageHeader } from "@/components/shared";
import {
  TeamSelector,
  MemberForm,
  MemberList,
  ErrorBanner,
  NoTeamsMessage,
  StaffTeamRoster,
} from "./components";
import { useTeamMembersData } from "./hooks/useTeamMembersData";

interface TeamMembersProps {
  readonly embedded?: boolean;
}

export default function TeamMembers({ embedded = false }: TeamMembersProps) {
  const { isLoading, isRallyAdmin, userStore } = useUser();
  const token = useUserStore((state) => state.token);
  const isStaff = userStore?.scopes?.includes("rally-staff");

  const [selectedTeam, setSelectedTeam] = useState<string>("");

  const { teamsQuery, membersQuery, teamDataQuery } = useTeamMembersData(selectedTeam, {
    fetchMembers: isRallyAdmin || isStaff,
    fetchTeamData: isStaff,
  });
  const { data: teams, error: teamsError, isLoading: teamsLoading } = teamsQuery;
  const {
    data: teamMembers,
    refetch: refetchTeamMembers,
    error: membersError,
    isLoading: membersLoading,
  } = membersQuery;
  const { data: teamData } = teamDataQuery;

  const handleSuccess = () => {
    void refetchTeamMembers();
  };

  if (isLoading) {
    return <LoadingState message="Carregando..." />;
  }

  if (!embedded && !isRallyAdmin && !isStaff) {
    return <Navigate to="/scoreboard" />;
  }

  const selectedTeamData = teams?.find((t) => t.id === Number(selectedTeam));

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

          {isRallyAdmin && (
            <>
              <MemberForm
                selectedTeam={selectedTeam}
                userToken={token || ""}
                onSuccess={handleSuccess}
              />

              <MemberList
                teamMembers={(teamMembers || []).map((member) => ({
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

          {isStaff && (
            <StaffTeamRoster
              teamName={selectedTeamData?.name}
              teamMembers={teamMembers}
              teamData={teamData}
            />
          )}
        </>
      )}

      {!teamsLoading && !teamsError && (!teams || teams.length === 0) && (
        <NoTeamsMessage
          description={
            isRallyAdmin
              ? "Não existem equipas criadas ainda. Para gerir membros das equipas, primeiro precisa de criar equipas."
              : "Não existem equipas criadas ainda. Contacte um administrador."
          }
        />
      )}
    </div>
  );
}

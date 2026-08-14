import { Flag } from "lucide-react";

import type { ListingTeam } from "@/client";
import AssignmentEntityList from "./AssignmentEntityList";

interface GuideAssignment {
  id: number;
  user_id: number;
  user_name?: string;
  user_email?: string;
  team_id?: number;
  team_name?: string;
}

type GuideAssignmentListProps = Readonly<{
  assignments: GuideAssignment[];
  teams: ListingTeam[] | undefined;
  onUpdateAssignment: (userId: number, teamId: number) => void;
  className?: string;
}>;

export default function GuideAssignmentList({
  assignments,
  teams,
  onUpdateAssignment,
  className,
}: GuideAssignmentListProps) {
  return (
    <AssignmentEntityList
      assignments={assignments.map((a) => ({
        id: a.id,
        user_id: a.user_id,
        user_name: a.user_name,
        user_email: a.user_email,
        entity_id: a.team_id,
        entity_name: a.team_name,
      }))}
      options={teams}
      onUpdateAssignment={onUpdateAssignment}
      className={className}
      emptyStateMessage="Nenhuma atribuição de guia encontrada."
      selectPlaceholder="Reatribuir equipa"
      entityIcon={Flag}
      entityLabel="Equipa"
      unassignedLabel="Não atribuída"
    />
  );
}

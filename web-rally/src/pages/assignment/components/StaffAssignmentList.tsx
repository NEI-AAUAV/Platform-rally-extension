import { MapPin } from "lucide-react";

import type { DetailedCheckPoint } from "@/client";
import AssignmentEntityList from "./AssignmentEntityList";

type Checkpoint = DetailedCheckPoint;

interface StaffAssignment {
  id: number;
  user_id: number;
  user_name?: string;
  user_email?: string;
  checkpoint_id?: number;
  checkpoint_name?: string;
}

type StaffAssignmentListProps = Readonly<{
  assignments: StaffAssignment[];
  checkpoints: Checkpoint[] | undefined;
  onUpdateAssignment: (userId: number, checkpointId: number) => void;
  className?: string;
}>;

export default function StaffAssignmentList({
  assignments,
  checkpoints,
  onUpdateAssignment,
  className,
}: StaffAssignmentListProps) {
  return (
    <AssignmentEntityList
      assignments={assignments.map((a) => ({
        id: a.id,
        user_id: a.user_id,
        user_name: a.user_name,
        user_email: a.user_email,
        entity_id: a.checkpoint_id,
        entity_name: a.checkpoint_name,
      }))}
      options={checkpoints}
      onUpdateAssignment={onUpdateAssignment}
      className={className}
      emptyStateMessage="Nenhuma atribuição de staff encontrada."
      selectPlaceholder="Reatribuir checkpoint"
      entityIcon={MapPin}
      entityLabel="Checkpoint"
      unassignedLabel="Não atribuído"
    />
  );
}

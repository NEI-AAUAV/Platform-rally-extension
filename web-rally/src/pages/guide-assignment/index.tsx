import { Navigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import useUser from "@/hooks/useUser";
import useFallbackNavigation from "@/hooks/useFallbackNavigation";
import { LoadingState, PageHeader } from "@/components/shared";
import { Compass } from "lucide-react";
import { StaffAssignmentList, AssignmentForm } from "@/pages/assignment/components";
import {
  getCheckpoints,
  getGuideAssignments,
  updateGuideCheckpointAssignment,
  type CheckpointAssignmentUpdate,
  type DetailedCheckPoint,
  type RallyGuideAssignmentWithCheckpoint,
} from "@/client";

interface GuideAssignment {
  id: number;
  user_id: number;
  user_name?: string;
  user_email?: string;
  checkpoint_id?: number;
  checkpoint_name?: string;
}

interface GuideAssignmentProps {
  readonly embedded?: boolean;
}

export default function GuideAssignment({ embedded = false }: GuideAssignmentProps) {
  const { isLoading, isRallyAdmin } = useUser();
  const fallbackPath = useFallbackNavigation();

  const { data: checkpoints } = useQuery<DetailedCheckPoint[]>({
    queryKey: ["checkpoints"],
    queryFn: async (): Promise<DetailedCheckPoint[]> => {
      const { data: checkpoints } = await getCheckpoints();
      return Array.isArray(checkpoints) ? checkpoints : [];
    },
  });

  const {
    data: guideAssignments,
    error: assignmentsError,
    refetch: refetchAssignments,
  } = useQuery<RallyGuideAssignmentWithCheckpoint[]>({
    queryKey: ["guideAssignments"],
    queryFn: async (): Promise<RallyGuideAssignmentWithCheckpoint[]> => {
      const { data } = await getGuideAssignments();
      return data ?? [];
    },
    enabled: isRallyAdmin,
  });

  const {
    mutate: updateGuideAssignment,
    isSuccess: isSuccessUpdate,
    isError: isErrorUpdate,
    error: updateError,
  } = useMutation({
    mutationKey: ["updateGuideAssignment"],
    mutationFn: async ({ userId, checkpointId }: { userId: number; checkpointId: number }) => {
      const requestBody: CheckpointAssignmentUpdate = {
        checkpoint_id: checkpointId === 0 ? null : checkpointId,
      };
      const { data } = await updateGuideCheckpointAssignment({
        path: { user_id: userId },
        body: requestBody,
      });
      return data;
    },
    onSuccess: () => {
      void refetchAssignments();
    },
  });

  const handleUpdateAssignment = (userId: number, checkpointId: number) => {
    updateGuideAssignment({ userId, checkpointId });
  };

  if (isLoading) {
    return <LoadingState message="Carregando..." />;
  }

  if (!embedded && !isRallyAdmin) {
    return <Navigate to={fallbackPath} />;
  }

  const rallyGuideAssignments: GuideAssignment[] = (guideAssignments || []).map((assignment) => ({
    id: assignment.id,
    user_id: assignment.user_id,
    user_name: assignment.user_name ?? undefined,
    user_email: assignment.user_email ?? undefined,
    checkpoint_id: assignment.checkpoint_id ?? undefined,
    checkpoint_name: assignment.checkpoint_name ?? undefined,
  }));

  return (
    <div className="space-y-8">
      {!embedded && (
        <PageHeader
          eyebrow="Guias"
          icon={Compass}
          title="Atribuição de guias"
          description="Atribuir utilizadores com o papel rally-guide aos postos que acompanham."
        />
      )}

      <AssignmentForm
        assignmentsError={assignmentsError}
        isSuccessUpdate={isSuccessUpdate}
        isErrorUpdate={isErrorUpdate}
        updateError={updateError}
      >
        <StaffAssignmentList
          assignments={rallyGuideAssignments}
          checkpoints={checkpoints}
          onUpdateAssignment={handleUpdateAssignment}
        />
      </AssignmentForm>
    </div>
  );
}

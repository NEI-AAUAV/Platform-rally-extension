import { Navigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import useUser from "@/hooks/useUser";
import useFallbackNavigation from "@/hooks/useFallbackNavigation";
import { LoadingState } from "@/components/shared";
import { StaffAssignmentList, AssignmentForm } from "./components";
import { CheckPointService, UserService, type CheckpointAssignmentUpdate, type DetailedCheckPoint, type RallyStaffAssignmentWithCheckpoint } from "@/client";

interface StaffAssignment {
  id: number;
  user_id: number;
  user_name?: string;
  user_email?: string;
  checkpoint_id?: number;
  checkpoint_name?: string;
}

export default function Assignment() {
  const { isLoading, isRallyAdmin } = useUser();
  const fallbackPath = useFallbackNavigation();

  const { data: checkpoints } = useQuery<DetailedCheckPoint[]>({
    queryKey: ["checkpoints"],
    queryFn: async (): Promise<DetailedCheckPoint[]> => {
      const data = await CheckPointService.getCheckpointsApiRallyV1CheckpointGet();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: staffAssignments, error: assignmentsError, refetch: refetchAssignments } = useQuery<RallyStaffAssignmentWithCheckpoint[]>({
    queryKey: ["staffAssignments"],
    queryFn: async (): Promise<RallyStaffAssignmentWithCheckpoint[]> => {
      return UserService.getStaffAssignmentsApiRallyV1UserStaffAssignmentsGet();
    },
    enabled: isRallyAdmin,
  });

  const {
    mutate: updateStaffAssignment,
    isSuccess: isSuccessUpdate,
    isError: isErrorUpdate,
    error: updateError,
  } = useMutation({
    mutationKey: ["updateStaffAssignment"],
    mutationFn: async ({ userId, checkpointId }: { userId: number; checkpointId: number }) => {
      const requestBody: CheckpointAssignmentUpdate = {
        checkpoint_id: checkpointId === 0 ? null : checkpointId,
      };
      return UserService.updateCheckpointAssignmentApiRallyV1UserUserIdCheckpointAssignmentPut(userId, requestBody);
    },
    onSuccess: () => {
      refetchAssignments(); // Refetch assignments to update UI
    }
  });

  const handleUpdateAssignment = (userId: number, checkpointId: number) => {
    updateStaffAssignment({ userId, checkpointId });
  };

  if (isLoading) {
    return <LoadingState message="Carregando..." />;
  }

  if (!isRallyAdmin) {
    return <Navigate to={fallbackPath} />;
  }

  // Map API response to local interface (they're compatible)
  const rallyStaffAssignments: StaffAssignment[] = (staffAssignments || []).map((assignment) => ({
    id: assignment.id,
    user_id: assignment.user_id,
    user_name: assignment.user_name ?? undefined,
    user_email: assignment.user_email ?? undefined,
    checkpoint_id: assignment.checkpoint_id ?? undefined,
    checkpoint_name: assignment.checkpoint_name ?? undefined,
  }));

  return (
    <div className="mt-16 space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Atribuição de Checkpoints</h2>
        <p className="text-[rgb(255,255,255,0.7)]">
          Atribuir utilizadores com role rally-staff aos checkpoints do Rally
        </p>
      </div>

      <AssignmentForm
        assignmentsError={assignmentsError}
        isSuccessUpdate={isSuccessUpdate}
        isErrorUpdate={isErrorUpdate}
        updateError={updateError}
      >
        <StaffAssignmentList
          assignments={rallyStaffAssignments}
          checkpoints={checkpoints}
          onUpdateAssignment={handleUpdateAssignment}
        />
      </AssignmentForm>
    </div>
  );
}

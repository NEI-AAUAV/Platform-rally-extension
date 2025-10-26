import { Navigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import useUser from "@/hooks/useUser";
import { LoadingState } from "@/components/shared";
import { StaffAssignmentList, AssignmentForm } from "./components";
import { CheckPointService, UserService, type CheckpointAssignmentUpdate } from "@/client";

interface Checkpoint {
  id: number;
  name: string;
  description: string;
  order: number;
}

interface StaffAssignment {
  id: number;
  user_id: number;
  user_name?: string;
  user_email?: string;
  checkpoint_id?: number;
  checkpoint_name?: string;
}

export default function Assignment() {
  const { isLoading, userStore } = useUser();
  
  // Check if user is manager-rally or admin
  const isManager = userStore.scopes?.includes("manager-rally") || 
                   userStore.scopes?.includes("admin");

  const { data: checkpoints } = useQuery<Checkpoint[]>({
    queryKey: ["checkpoints"],
    queryFn: async (): Promise<Checkpoint[]> => {
      return CheckPointService.getCheckpointsApiRallyV1CheckpointGet() as Promise<Checkpoint[]>;
    },
  });

  const { data: staffAssignments, error: assignmentsError, refetch: refetchAssignments } = useQuery<StaffAssignment[]>({
    queryKey: ["staffAssignments"],
    queryFn: async (): Promise<StaffAssignment[]> => {
      return UserService.getStaffAssignmentsApiRallyV1UserStaffAssignmentsGet() as Promise<StaffAssignment[]>;
    },
    enabled: isManager,
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

  if (!isManager) {
    return <Navigate to="/scoreboard" />;
  }

  // Staff assignments are already filtered by the API
  const rallyStaffAssignments: StaffAssignment[] = staffAssignments || [];

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

import { Navigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import useUser from "@/hooks/useUser";
import { LoadingState } from "@/components/shared";
import { StaffAssignmentList, AssignmentForm } from "./components";

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
  const { isLoading, userStoreStuff } = useUser();
  
  // Check if user is manager-rally or admin
  const isManager = userStoreStuff.scopes?.includes("manager-rally") || 
                   userStoreStuff.scopes?.includes("admin");

  const { data: checkpoints } = useQuery<Checkpoint[]>({
    queryKey: ["checkpoints"],
    queryFn: async (): Promise<Checkpoint[]> => {
      const response = await fetch("/api/rally/v1/checkpoint/");
      if (!response.ok) throw new Error("Failed to fetch checkpoints");
      return (await response.json()) as Checkpoint[];
    },
  });

  const { data: staffAssignments, error: assignmentsError, refetch: refetchAssignments } = useQuery<StaffAssignment[]>({
    queryKey: ["staffAssignments"],
    queryFn: async (): Promise<StaffAssignment[]> => {
      const response = await fetch("/api/rally/v1/user/staff-assignments", {
        headers: {
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
      });
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("Insufficient permissions to view staff assignments. Admin access required.");
        }
        throw new Error("Failed to fetch staff assignments");
      }
      return (await response.json()) as StaffAssignment[];
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
      const response = await fetch(`/api/rally/v1/user/${userId}/checkpoint-assignment`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
        body: JSON.stringify({
          checkpoint_id: checkpointId === 0 ? null : checkpointId,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json() as { detail?: string };
        throw new Error(errorData.detail || "Failed to update assignment");
      }
      
      return (await response.json()) as Checkpoint[];
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

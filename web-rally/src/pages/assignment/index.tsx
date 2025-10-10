// @ts-nocheck
import { Navigate } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// @ts-ignore
import { useMutation, useQuery } from "@tanstack/react-query";
// @ts-ignore
import { Users, MapPin } from "lucide-react";
import useUser from "@/hooks/useUser";

// No form schema needed since we're only assigning existing users to checkpoints

export default function Assignment() {
  const { isLoading, userStoreStuff } = useUser();
  
  // Check if user is manager-rally or admin
  const isManager = userStoreStuff.scopes?.includes("manager-rally") || 
                   userStoreStuff.scopes?.includes("admin");

  const { data: checkpoints } = useQuery({
    queryKey: ["checkpoints"],
    queryFn: async () => {
      const response = await fetch("/api/rally/v1/checkpoint/");
      if (!response.ok) throw new Error("Failed to fetch checkpoints");
      return response.json();
    },
  });

  const { data: staffAssignments, error: assignmentsError, refetch: refetchAssignments } = useQuery({
    queryKey: ["staffAssignments"],
    queryFn: async () => {
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
      return response.json();
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
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to update assignment");
      }
      
      return response.json();
    },
    onSuccess: () => {
      refetchAssignments(); // Refetch assignments to update UI
    }
  });

  if (isLoading) {
    return <div className="mt-16 text-center">Carregando...</div>;
  }

  if (!isManager) {
    return <Navigate to="/scoreboard" />;
  }

  const handleUpdateAssignment = (userId: number, checkpointId: number) => {
    updateStaffAssignment({ userId, checkpointId });
  };

  // Staff assignments are already filtered by the API
  const rallyStaffAssignments = staffAssignments || [];

  return (
    <div className="mt-16 space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Atribuição de Checkpoints</h2>
        <p className="text-[rgb(255,255,255,0.7)]">
          Atribuir utilizadores com role rally-staff aos checkpoints do Rally
        </p>
        <p className="text-sm text-[rgb(255,255,255,0.5)] mt-2">
          Apenas utilizadores com role rally-staff são mostrados. Para criar novos utilizadores ou atribuir roles, utilize a gestão de utilizadores do NEI.
        </p>
      </div>

      {/* Existing Staff Management Section */}
      <div className="bg-[rgb(255,255,255,0.04)] rounded-2xl p-6 border border-[rgb(255,255,255,0.15)]">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5" />
          <h3 className="text-lg font-semibold">Staff Rally (rally-staff)</h3>
        </div>

        {assignmentsError ? (
          <div className="text-center text-red-500 py-8">
            <p className="font-semibold">Erro ao carregar atribuições</p>
            <p className="text-sm mt-2">{assignmentsError.message}</p>
            <p className="text-xs mt-2 text-[rgb(255,255,255,0.5)]">
              Contacte um administrador para resolver este problema.
            </p>
          </div>
        ) : rallyStaffAssignments.length === 0 ? (
          <div className="text-center text-[rgb(255,255,255,0.7)] py-8">
            Nenhuma atribuição de staff encontrada.
          </div>
        ) : (
          <div className="space-y-4">
            {rallyStaffAssignments.map((assignment: any) => (
              <div
                key={assignment.id}
                className="flex items-center justify-between p-4 bg-[rgb(255,255,255,0.02)] rounded-xl border border-[rgb(255,255,255,0.1)]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[rgb(255,255,255,0.1)] rounded-full flex items-center justify-center">
                    <Users className="w-5 h-5" />
                  </div>
                         <div>
                           <div className="font-semibold">
                             {assignment.user_name || `User ${assignment.user_id}`}
                           </div>
                           <div className="text-sm text-[rgb(255,255,255,0.7)]">
                             {assignment.user_email && `${assignment.user_email} • `}ID: {assignment.user_id}
                           </div>
                         </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    <span className="text-sm">
                      Checkpoint: {assignment.checkpoint_name || "Não atribuído"}
                    </span>
                  </div>

                  <Select
                    value={assignment.checkpoint_id ? String(assignment.checkpoint_id) : "none"}
                    onValueChange={(value: string) => {
                      if (value === "none") {
                        handleUpdateAssignment(assignment.user_id, 0); // Use 0 to indicate no assignment
                      } else {
                        handleUpdateAssignment(assignment.user_id, parseInt(value));
                      }
                    }}
                  >
                    <SelectTrigger className="w-48 rounded-xl border border-[rgb(255,255,255,0.15)] bg-[rgb(255,255,255,0.04)]">
                      <SelectValue placeholder="Reatribuir checkpoint" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Remover atribuição</SelectItem>
                      {checkpoints?.map((checkpoint: any) => (
                        <SelectItem key={checkpoint.id} value={String(checkpoint.id)}>
                          {checkpoint.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        )}

        {isSuccessUpdate && (
          <div className="text-center text-green-500 mt-4">
            Atribuição atualizada com sucesso!
          </div>
        )}
        {isErrorUpdate && (
          <div className="text-center text-red-500 mt-4">
            {updateError?.message || "Erro ao atualizar atribuição"}
          </div>
        )}
      </div>
    </div>
  );
}

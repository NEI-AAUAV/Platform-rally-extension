import { Navigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import useUser from "@/hooks/useUser";
import useFallbackNavigation from "@/hooks/useFallbackNavigation";
import usePagedSearch from "@/hooks/usePagedSearch";
import { LoadingState, PageHeader } from "@/components/shared";
import { ClipboardList } from "lucide-react";
import { StaffAssignmentList, AssignmentForm, AssignmentPager } from "./components";
import {
  getCheckpoints,
  getStaffAssignments,
  updateCheckpointAssignment,
  type CheckpointAssignmentUpdate,
  type DetailedCheckPoint,
  type PageRallyStaffAssignmentWithCheckpoint,
} from "@/client";

interface StaffAssignment {
  id: number;
  user_id: number;
  user_name?: string;
  user_email?: string;
  checkpoint_id?: number;
  checkpoint_name?: string;
}

interface AssignmentProps {
  readonly embedded?: boolean;
}

const PAGE_SIZE = 20;

export default function Assignment({ embedded = false }: AssignmentProps) {
  const { isLoading, isRallyAdmin } = useUser();
  const fallbackPath = useFallbackNavigation();
  const { searchInput, setSearchInput, debouncedSearch, page, setPage } = usePagedSearch();

  const { data: checkpoints } = useQuery<DetailedCheckPoint[]>({
    queryKey: ["checkpoints"],
    queryFn: async (): Promise<DetailedCheckPoint[]> => {
      const { data: checkpoints } = await getCheckpoints();
      return Array.isArray(checkpoints) ? checkpoints : [];
    },
  });

  const {
    data: staffAssignmentsPage,
    error: assignmentsError,
    refetch: refetchAssignments,
  } = useQuery<PageRallyStaffAssignmentWithCheckpoint>({
    queryKey: ["staffAssignments", debouncedSearch, page],
    queryFn: async (): Promise<PageRallyStaffAssignmentWithCheckpoint> => {
      const { data } = await getStaffAssignments({
        query: { q: debouncedSearch || undefined, page, page_size: PAGE_SIZE },
      });
      return data ?? { items: [], total: 0, page, page_size: PAGE_SIZE };
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
      const { data } = await updateCheckpointAssignment({
        path: { user_id: userId },
        body: requestBody,
      });
      return data;
    },
    onSuccess: () => {
      void refetchAssignments(); // Refetch assignments to update UI
    },
  });

  const handleUpdateAssignment = (userId: number, checkpointId: number) => {
    updateStaffAssignment({ userId, checkpointId });
  };

  if (isLoading) {
    return <LoadingState message="Carregando..." />;
  }

  if (!embedded && !isRallyAdmin) {
    return <Navigate to={fallbackPath} />;
  }

  const total = staffAssignmentsPage?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Map API response to local interface (they're compatible)
  const rallyStaffAssignments: StaffAssignment[] = (staffAssignmentsPage?.items ?? []).map(
    (assignment) => ({
      id: assignment.id,
      user_id: assignment.user_id,
      user_name: assignment.user_name ?? undefined,
      user_email: assignment.user_email ?? undefined,
      checkpoint_id: assignment.checkpoint_id ?? undefined,
      checkpoint_name: assignment.checkpoint_name ?? undefined,
    }),
  );

  return (
    <div className="space-y-8">
      {!embedded && (
        <PageHeader
          eyebrow="Staff"
          icon={ClipboardList}
          title="Atribuição de postos"
          description="Atribuir utilizadores com o papel rally-staff aos postos do rally."
        />
      )}

      <AssignmentForm
        assignmentsError={assignmentsError}
        isSuccessUpdate={isSuccessUpdate}
        isErrorUpdate={isErrorUpdate}
        updateError={updateError}
      >
        <AssignmentPager
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          searchPlaceholder="Procurar por nome ou email…"
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={setPage}
        />
        <StaffAssignmentList
          assignments={rallyStaffAssignments}
          checkpoints={checkpoints}
          onUpdateAssignment={handleUpdateAssignment}
        />
      </AssignmentForm>
    </div>
  );
}

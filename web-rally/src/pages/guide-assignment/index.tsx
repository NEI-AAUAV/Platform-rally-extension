import { Navigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import useUser from "@/hooks/useUser";
import useFallbackNavigation from "@/hooks/useFallbackNavigation";
import useRallySettings from "@/hooks/useRallySettings";
import usePagedSearch from "@/hooks/usePagedSearch";
import { FeatureDisabledAlert, LoadingState, PageHeader } from "@/components/shared";
import { Compass } from "lucide-react";
import {
  GuideAssignmentList,
  AssignmentForm,
  AssignmentPager,
} from "@/pages/assignment/components";
import {
  getTeams,
  getGuideAssignments,
  updateGuideTeamAssignment,
  type TeamAssignmentUpdate,
  type ListingTeam,
  type PageRallyGuideAssignmentWithTeam,
} from "@/client";

interface GuideAssignment {
  id: number;
  user_id: number;
  user_name?: string;
  user_email?: string;
  team_id?: number;
  team_name?: string;
}

interface GuideAssignmentProps {
  readonly embedded?: boolean;
}

const PAGE_SIZE = 20;

export default function GuideAssignment({ embedded = false }: GuideAssignmentProps) {
  const { isLoading, isRallyAdmin } = useUser();
  const fallbackPath = useFallbackNavigation();
  const { settings } = useRallySettings();
  const { searchInput, setSearchInput, debouncedSearch, page, setPage } = usePagedSearch();

  const { data: teams } = useQuery<ListingTeam[]>({
    queryKey: ["teams"],
    queryFn: async (): Promise<ListingTeam[]> => {
      const { data: teams } = await getTeams();
      return Array.isArray(teams) ? teams : [];
    },
  });

  const {
    data: guideAssignmentsPage,
    error: assignmentsError,
    refetch: refetchAssignments,
  } = useQuery<PageRallyGuideAssignmentWithTeam>({
    queryKey: ["guideAssignments", debouncedSearch, page],
    queryFn: async (): Promise<PageRallyGuideAssignmentWithTeam> => {
      const { data } = await getGuideAssignments({
        query: { q: debouncedSearch || undefined, page, page_size: PAGE_SIZE },
      });
      return data ?? { items: [], total: 0, page, page_size: PAGE_SIZE };
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
    mutationFn: async ({ userId, teamId }: { userId: number; teamId: number }) => {
      const requestBody: TeamAssignmentUpdate = {
        team_id: teamId === 0 ? null : teamId,
      };
      const { data } = await updateGuideTeamAssignment({
        path: { user_id: userId },
        body: requestBody,
      });
      return data;
    },
    onSuccess: () => {
      void refetchAssignments();
    },
  });

  const handleUpdateAssignment = (userId: number, teamId: number) => {
    updateGuideAssignment({ userId, teamId });
  };

  if (isLoading) {
    return <LoadingState message="Carregando..." />;
  }

  if (!embedded && !isRallyAdmin) {
    return <Navigate to={fallbackPath} />;
  }

  if (!settings?.guide_mode_enabled) {
    return <FeatureDisabledAlert featureName="modo guia" settingsPath="/settings" />;
  }

  const total = guideAssignmentsPage?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rallyGuideAssignments: GuideAssignment[] = (guideAssignmentsPage?.items ?? []).map(
    (assignment) => ({
      id: assignment.id,
      user_id: assignment.user_id,
      user_name: assignment.user_name ?? undefined,
      user_email: assignment.user_email ?? undefined,
      team_id: assignment.team_id ?? undefined,
      team_name: assignment.team_name ?? undefined,
    }),
  );

  return (
    <div className="space-y-8">
      {!embedded && (
        <PageHeader
          eyebrow="Guias"
          icon={Compass}
          title="Atribuição de guias"
          description="Atribuir utilizadores com o papel rally-guide às equipas que acompanham ao longo de toda a atividade."
        />
      )}

      <AssignmentForm
        assignmentsError={assignmentsError}
        isSuccessUpdate={isSuccessUpdate}
        isErrorUpdate={isErrorUpdate}
        updateError={updateError}
        title="Guias Rally (rally-guide)"
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
        <GuideAssignmentList
          assignments={rallyGuideAssignments}
          teams={teams}
          onUpdateAssignment={handleUpdateAssignment}
        />
      </AssignmentForm>
    </div>
  );
}

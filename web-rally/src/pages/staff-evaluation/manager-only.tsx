import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Users, Activity, CheckCircle, ChevronDown } from "lucide-react";
import { useUserStore } from "@/stores/useUserStore";
import { PageHeader } from "@/components/shared";
import { AssignedCheckpoints } from "./components/AssignedCheckpoints";
import { AllEvaluations, type Evaluation } from "./components/AllEvaluations";
import { useNavigate } from "@tanstack/react-router";
import useRallySettings from "@/hooks/useRallySettings";
import useRallyEventStream from "@/hooks/useRallyEventStream";
import {
  getCheckpoints,
  getActivities,
  getTeams,
  getAllEvaluations,
  type DetailedCheckPoint,
  type ActivityListResponse,
  type ListingTeam,
  type ActivityResultResponse,
  type ActivityResponse,
} from "@/client";

interface ManagerEvaluationPageProps {
  readonly embedded?: boolean;
}

const STREAM_QUERY_KEYS = [["allTeams"], ["allEvaluations"], ["allCheckpoints"]] as const;

export default function ManagerEvaluationPage({ embedded = false }: ManagerEvaluationPageProps) {
  const userStore = useUserStore();
  const navigate = useNavigate();
  const [showAllEvaluations, setShowAllEvaluations] = useState(false);
  const { settings } = useRallySettings();
  useRallyEventStream(STREAM_QUERY_KEYS);

  // Get all checkpoints
  const { data: allCheckpoints } = useQuery<DetailedCheckPoint[]>({
    queryKey: ["allCheckpoints"],
    queryFn: async () => {
      const { data } = await getCheckpoints();
      return data;
    },
    enabled: !!userStore.token,
  });

  // Get all activities
  const { data: allActivities } = useQuery<ActivityListResponse>({
    queryKey: ["allActivities"],
    queryFn: async () => {
      const { data } = await getActivities();
      return data;
    },
    enabled: !!userStore.token,
  });

  // Get all teams
  const { data: allTeams } = useQuery<ListingTeam[]>({
    queryKey: ["allTeams"],
    queryFn: async () => {
      const { data } = await getTeams();
      return data;
    },
    enabled: !!userStore.token,
  });

  type EvaluationResponse = ActivityResultResponse & {
    team?: ListingTeam & { members?: Array<unknown> };
    activity?: ActivityResponse;
  };

  // Get all evaluations using the dedicated endpoint that includes relationships
  const { data: allEvaluations, isLoading: evaluationsLoading } = useQuery({
    queryKey: ["allEvaluations"],
    queryFn: async (): Promise<Evaluation[]> => {
      const { data: response } = await getAllEvaluations();

      if (!response || !response.evaluations) return [];

      // Transform the results to match the AllEvaluations component interface
      const evaluations = (response.evaluations as EvaluationResponse[]).map((result) => ({
        id: result.id,
        team_id: result.team_id,
        activity_id: result.activity_id,
        final_score: result.final_score ?? 0,
        is_completed: Boolean(result.is_completed),
        completed_at: result.completed_at ?? "",
        result_data: result.result_data ?? {},
        extra_shots: result.extra_shots ?? 0,
        penalties: result.penalties ?? {},
        time_score: result.time_score ?? undefined,
        points_score: result.points_score ?? undefined,
        boolean_score: result.boolean_score ?? undefined,
        team: {
          id: result.team?.id || result.team_id,
          name: result.team?.name || `Team ${result.team_id}`,
          num_members: result.team?.members?.length,
        },
        activity: {
          id: result.activity?.id || result.activity_id,
          name: result.activity?.name || `Activity ${result.activity_id}`,
          activity_type: result.activity?.activity_type || "GeneralActivity",
          checkpoint_id: result.activity?.checkpoint_id || 1,
          description: result.activity?.description ?? undefined,
        },
      }));

      return evaluations;
    },
    enabled: !!userStore.token,
  });

  const handleCheckpointClick = (checkpoint: DetailedCheckPoint) => {
    navigate({
      to: "/staff-evaluation/checkpoint/$checkpointId",
      params: { checkpointId: String(checkpoint.id) },
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        {!embedded && (
          <PageHeader
            eyebrow="Avaliação"
            icon={Activity}
            title="Painel de avaliação"
            description="Visão geral e gestão de todas as avaliações."
          />
        )}

        {/* All Evaluations Section */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowAllEvaluations(!showAllEvaluations)}
            className="rally-surface flex w-full cursor-pointer items-center justify-between rounded-lg p-3 text-left transition-colors hover:bg-accent sm:p-4"
          >
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              <span className="font-semibold">Todas as Avaliações</span>
              <Badge variant="outline" className="border-border text-foreground">
                {evaluationsLoading
                  ? "A carregar..."
                  : (allEvaluations as Evaluation[])?.length || 0}
              </Badge>
            </div>
            <ChevronDown
              className={`h-5 w-5 transition-transform ${showAllEvaluations ? "rotate-180" : ""}`}
            />
          </button>

          {showAllEvaluations && (
            <div className="mt-2">
              {evaluationsLoading ? (
                <div className="rally-surface rounded-2xl p-4 sm:p-6">
                  <p className="text-center text-muted-foreground">A carregar avaliações...</p>
                </div>
              ) : (
                <AllEvaluations evaluations={(allEvaluations as Evaluation[]) || []} />
              )}
            </div>
          )}
        </div>

        {/* Assigned Checkpoints */}
        <AssignedCheckpoints
          checkpoints={allCheckpoints || []}
          activities={allActivities?.activities || []}
          teams={allTeams || []}
          onCheckpointClick={handleCheckpointClick}
        />

        {/* Teams Overview */}
        <div className="rally-surface rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="rally-bg-accent-soft rally-accent grid h-9 w-9 place-items-center rounded-lg">
              <Users className="h-4 w-4" />
            </span>
            <div>
              <p className="font-bold text-foreground">Visão Geral das Equipas</p>
              <p className="text-xs text-muted-foreground">Todas as equipas do rally</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {allTeams?.map((team) => (
              <div key={team.id} className="rounded-xl border border-border bg-secondary p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="font-semibold text-foreground">{team.name}</h4>
                  <Badge variant="outline" className="border-border text-foreground">
                    #{team.id}
                  </Badge>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>Membros: {team.num_members || 0}</p>
                  {settings?.show_score_mode !== "hidden" && <p>Pontuação: {team.total || 0}</p>}
                  {settings?.show_score_mode !== "hidden" && (
                    <p>Classificação: {team.classification || "N/D"}</p>
                  )}
                  <p>Último posto: {team.last_checkpoint_number || "Nenhum"}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3 md:gap-6">
          <div className="rally-surface rounded-2xl p-4 sm:p-6">
            <div className="text-center">
              <div className="mb-2 text-2xl font-bold text-foreground">{allTeams?.length || 0}</div>
              <div className="text-sm text-muted-foreground">Equipas</div>
            </div>
          </div>

          <div className="rally-surface rounded-2xl p-4 sm:p-6">
            <div className="text-center">
              <div className="mb-2 text-2xl font-bold text-foreground">
                {allCheckpoints?.length || 0}
              </div>
              <div className="text-sm text-muted-foreground">Checkpoints</div>
            </div>
          </div>

          <div className="rally-surface rounded-2xl p-4 sm:p-6">
            <div className="text-center">
              <div className="mb-2 text-2xl font-bold text-foreground">
                {allActivities?.activities?.length || 0}
              </div>
              <div className="text-sm text-muted-foreground">Atividades</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

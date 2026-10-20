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
    void navigate({
      to: "/staff-evaluation/checkpoint/$checkpointId",
      params: { checkpointId: String(checkpoint.id) },
    });
  };

  const showScore = settings?.show_score_mode !== "hidden";
  const stats = [
    { label: "Equipas", value: allTeams?.length || 0 },
    { label: "Postos", value: allCheckpoints?.length || 0 },
    { label: "Atividades", value: allActivities?.activities?.length || 0 },
    {
      label: "Avaliações",
      value: evaluationsLoading ? "…" : (allEvaluations as Evaluation[])?.length || 0,
    },
  ];

  // Overview first (how big is the event), then where to go (posts), then the
  // records (evaluations) and the reference list of teams.
  return (
    <div className="space-y-10">
      {!embedded && (
        <PageHeader
          eyebrow="Avaliação"
          icon={Activity}
          title="Painel de avaliação"
          description="Visão geral e gestão de todas as avaliações."
        />
      )}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl bg-border md:grid-cols-4">
        {stats.map(({ label, value }) => (
          <div key={label} className="flex flex-col-reverse justify-end bg-background p-5">
            <dd className="rally-display mt-1 text-5xl tabular-nums text-foreground">{value}</dd>
            <dt className="rally-eyebrow">{label}</dt>
          </div>
        ))}
      </dl>

      <AssignedCheckpoints
        checkpoints={allCheckpoints || []}
        activities={allActivities?.activities || []}
        teams={allTeams || []}
        onCheckpointClick={handleCheckpointClick}
      />

      <section className="space-y-3">
        <button
          type="button"
          onClick={() => setShowAllEvaluations(!showAllEvaluations)}
          aria-expanded={showAllEvaluations}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="flex items-baseline gap-3">
            <span className="rally-display text-4xl text-foreground">Todas as Avaliações</span>
            <Badge variant="outline" className="border-border text-foreground">
              {evaluationsLoading ? "A carregar..." : (allEvaluations as Evaluation[])?.length || 0}
            </Badge>
          </span>
          <span className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
            <CheckCircle className="h-4 w-4" />
            {showAllEvaluations ? "Esconder" : "Mostrar"}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${showAllEvaluations ? "rotate-180" : ""}`}
            />
          </span>
        </button>

        {showAllEvaluations &&
          (evaluationsLoading ? (
            <div className="rally-surface p-6">
              <p className="text-center text-muted-foreground">A carregar avaliações...</p>
            </div>
          ) : (
            <AllEvaluations evaluations={(allEvaluations as Evaluation[]) || []} />
          ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline gap-3">
          <h2 className="rally-display text-4xl text-foreground">Equipas</h2>
          <Users className="h-5 w-5 self-center text-muted-foreground" />
        </div>
        <ul className="rally-surface divide-y divide-border/70 p-2">
          {allTeams?.map((team) => (
            <li key={team.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3">
              <span className="rally-num w-10 text-sm font-bold text-muted-foreground">
                #{team.id}
              </span>
              <span className="min-w-0 flex-1 truncate font-bold text-foreground">{team.name}</span>
              <span className="text-sm text-muted-foreground">
                Membros: {team.num_members || 0}
              </span>
              {showScore && (
                <span className="text-sm text-muted-foreground">Pontuação: {team.total || 0}</span>
              )}
              {showScore && (
                <span className="text-sm text-muted-foreground">
                  Classificação: {team.classification > 0 ? team.classification : "N/D"}
                </span>
              )}
              <span className="text-sm text-muted-foreground">
                Postos resolvidos: {team.resolved_checkpoint_orders?.length ?? 0}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

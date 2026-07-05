import { Button } from "@/components/ui/button";
import { Users, ArrowLeft, MapPin, Loader2 } from "lucide-react";
import { useParams } from "@tanstack/react-router";
import useRallySettings from "@/hooks/useRallySettings";
import useRallyEventStream from "@/hooks/useRallyEventStream";
import type { ListingTeam } from "@/client";
import { TeamActivitiesList } from "./TeamActivitiesList";
import { TeamSection } from "./TeamSection";
import { IncompleteEvaluationDialog } from "./IncompleteEvaluationDialog";
import { useCheckpointEvaluation } from "./useCheckpointEvaluation";
import { StaffCheckinScanner } from "@/components/checkin/StaffCheckinScanner";

const STREAM_QUERY_KEYS = [
  ["checkpointTeams"],
  ["teamEvaluationStatus"],
  ["teamActivities"],
] as const;

export default function CheckpointTeamEvaluation() {
  const { checkpointId } = useParams({ strict: false }) as { checkpointId: string };
  const { settings } = useRallySettings();
  useRallyEventStream(STREAM_QUERY_KEYS);
  const {
    checkpoint,
    checkpointTeams,
    teamEvaluationStatus,
    teamActivities,
    teamActivitiesLoading,
    selectedTeam,
    showTeamList,
    evaluationSummary,
    showWarningDialog,
    isEvaluating,
    handleEvaluateActivity,
    selectTeam,
    backToTeams,
    dismissWarning,
  } = useCheckpointEvaluation(checkpointId);

  if (!checkpoint) {
    return (
      <div className="rally-surface rally-elevate mx-auto max-w-lg rounded-2xl p-8 text-center">
        <MapPin className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <h2 className="rally-display text-xl font-bold text-foreground">Posto não encontrado</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O posto solicitado não foi encontrado.
        </p>
      </div>
    );
  }

  const showScore = settings?.show_score_mode !== "hidden";

  const order = Number(checkpoint.order ?? 0) || 0;
  const lastOf = (team: ListingTeam) => Number(team.last_checkpoint_number ?? 0) || 0;
  const teams = checkpointTeams ?? [];

  const teamsToEvaluate = teams.filter(
    (team) => !teamEvaluationStatus?.[team.id] && lastOf(team) === order - 1,
  );
  const teamsAtPreviousCheckpoints = teams.filter(
    (team) => !teamEvaluationStatus?.[team.id] && lastOf(team) < order - 1,
  );
  const teamsAlreadyEvaluated = teams.filter(
    (team) => lastOf(team) >= order || !!teamEvaluationStatus?.[team.id],
  );

  return (
    <div className="space-y-6">
      {/* Checkpoint banner */}
      <div className="relative overflow-hidden rounded-2xl rally-bg-accent p-5 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:24px_24px]"
        />
        <div className="relative z-10 flex items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/20">
            <MapPin className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.12em] opacity-80">
              Posto #{checkpoint.order}
            </p>
            <p className="rally-display truncate text-xl font-bold leading-tight">
              {checkpoint.name}
            </p>
          </div>
          <div className="ml-auto shrink-0 text-right">
            <p className="rally-display text-3xl font-bold tabular-nums">
              {teamsAlreadyEvaluated.length}/{teams.length}
            </p>
            <p className="text-xs opacity-80">Avaliadas</p>
          </div>
        </div>
      </div>

      {/* Staff scans the arriving team's QR to identify + open its evaluation */}
      <StaffCheckinScanner
        checkpointId={Number(checkpointId)}
        onTeamIdentified={(teamId) => {
          const found = (checkpointTeams ?? []).find((t) => t.id === teamId);
          if (found) selectTeam(found);
        }}
      />

      {/* Team activities detail */}
      {selectedTeam && !showTeamList && (
        <div className="space-y-4">
          <Button onClick={backToTeams} variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar às equipas
          </Button>

          {teamActivitiesLoading ? (
            <div className="rally-surface rally-elevate flex flex-col items-center gap-3 rounded-2xl p-10 text-center">
              <Loader2 className="h-8 w-8 animate-spin rally-accent" />
              <p className="text-sm text-muted-foreground">A carregar atividades...</p>
            </div>
          ) : (
            <TeamActivitiesList
              team={selectedTeam}
              activities={teamActivities || []}
              onEvaluate={handleEvaluateActivity}
              isEvaluating={isEvaluating}
            />
          )}
        </div>
      )}

      {/* Teams list */}
      {showTeamList && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="rally-display text-xl font-bold text-foreground">
              Equipas para avaliar
            </h2>
            {checkpointTeams && checkpointTeams.length > 0 && (
              <span className="rally-bg-accent-soft rally-accent rounded-full px-3 py-1 text-sm font-bold">
                {checkpointTeams.length}
              </span>
            )}
          </div>

          {checkpointTeams?.length === 0 ? (
            <div className="rally-surface flex flex-col items-center gap-3 rounded-2xl p-10 text-center">
              <Users className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhuma equipa disponível</p>
            </div>
          ) : (
            <div className="space-y-6">
              <TeamSection
                title={`Em ${checkpoint.name}`}
                variant="current"
                teams={teamsToEvaluate}
                showScore={showScore}
                onSelect={selectTeam}
              />
              <TeamSection
                title="Postos anteriores"
                variant="previous"
                teams={teamsAtPreviousCheckpoints}
                showScore={showScore}
                onSelect={selectTeam}
              />
              <TeamSection
                title="Já avaliadas"
                variant="evaluated"
                teams={teamsAlreadyEvaluated}
                showScore={showScore}
                onSelect={selectTeam}
              />
            </div>
          )}
        </div>
      )}

      {showWarningDialog && (
        <IncompleteEvaluationDialog summary={evaluationSummary} onClose={dismissWarning} />
      )}
    </div>
  );
}

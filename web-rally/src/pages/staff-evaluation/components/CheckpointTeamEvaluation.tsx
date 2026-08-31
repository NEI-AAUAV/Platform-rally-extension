import { Button } from "@/components/ui/button";
import { Users, ArrowLeft, MapPin, Loader2, Lock } from "lucide-react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import useRallySettings from "@/hooks/useRallySettings";
import useRallyEventStream from "@/hooks/useRallyEventStream";
import useUser from "@/hooks/useUser";
import { useUserStore } from "@/stores/useUserStore";
import { getMyCheckpoint, type ListingTeam } from "@/client";
import { TeamActivitiesList } from "./TeamActivitiesList";
import { TeamSection } from "./TeamSection";
import { IncompleteEvaluationDialog } from "./IncompleteEvaluationDialog";
import { useCheckpointEvaluation } from "./useCheckpointEvaluation";
import { StaffCheckinScanner } from "@/components/checkin/StaffCheckinScanner";
import OfflineQueueBanner from "./OfflineQueueBanner";
import CheckpointAnnouncement from "./CheckpointAnnouncement";

const STREAM_QUERY_KEYS = [
  ["checkpointTeams"],
  ["teamEvaluationStatus"],
  ["teamActivities"],
] as const;

export default function CheckpointTeamEvaluation() {
  const { checkpointId } = useParams({ strict: false }) as { checkpointId: string };
  const { settings } = useRallySettings();
  const { isRallyAdmin } = useUser();
  const navigate = useNavigate();
  const token = useUserStore((state) => state.token);
  useRallyEventStream(STREAM_QUERY_KEYS);

  // The post comes from the URL, so nothing stops a staff member reaching
  // another post's screen — a stale bookmark, a link passed around the group,
  // an id typed by hand. The server refuses their writes there (ABAC's
  // `_staff_own_checkpoint`), but it used to refuse them one submitted
  // evaluation at a time, after the team had already been asked to do the
  // challenge. Ask the same question the server asks, up front.
  // Admins and coordinators are deliberately exempt: they have no post of
  // their own and reach every post's screen from the manager view.
  const { data: myCheckpoint, isPending: myCheckpointPending } = useQuery({
    queryKey: ["myCheckpoint"],
    queryFn: async () => (await getMyCheckpoint()).data,
    enabled: !isRallyAdmin && !!token,
    retry: false,
    // An admin may reassign this staff member's post at any time, and the
    // answer decides whether they can work at all.
    staleTime: 0,
  });
  const isForeignPost =
    !isRallyAdmin && !myCheckpointPending && myCheckpoint?.id !== Number(checkpointId);
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

  if (isForeignPost) {
    return (
      <div className="rally-surface rally-elevate mx-auto max-w-lg rounded-2xl p-8 text-center">
        <Lock className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <h2 className="rally-display text-xl font-bold text-foreground">Este não é o teu posto</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {myCheckpoint
            ? `Só podes avaliar no posto que te foi atribuído: ${myCheckpoint.name}.`
            : "Ainda não foste atribuído a um posto. Contacta um administrador."}
        </p>
        {myCheckpoint && (
          <Button
            className="mt-4"
            onClick={() =>
              void navigate({
                to: "/staff-evaluation/checkpoint/$checkpointId",
                params: { checkpointId: String(myCheckpoint.id) },
              })
            }
          >
            Ir para o meu posto
          </Button>
        )}
      </div>
    );
  }

  if (!checkpoint) {
    return (
      <div className="rally-surface rally-elevate mx-auto max-w-lg rounded-2xl p-8 text-center">
        <MapPin className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <h2 className="rally-display text-xl font-bold text-foreground">Posto não encontrado</h2>
        <p className="mt-2 text-sm text-muted-foreground">O posto solicitado não foi encontrado.</p>
      </div>
    );
  }

  const showScore = settings?.show_score_mode !== "hidden";
  // Staff scoring can be switched off event-wide. The server refuses the write
  // either way; hiding the form means a staff member is not invited to run a
  // team through a challenge and then told at submit that it does not count.
  // Admins and managers keep it — the switch is about staff, and they are the
  // ones who correct results while it is off.
  const staffScoringOff = settings?.enable_staff_scoring === false && !isRallyAdmin;

  const order = Number(checkpoint.order ?? 0) || 0;
  const teams = checkpointTeams ?? [];

  // Bucketed by what the server's progress engine says about each team, not by
  // `last_checkpoint_number === order - 1`. That arithmetic reads a count as a
  // position: under free order or stages a team standing right here has an
  // arbitrary count, so it landed in "postos anteriores" and the staff member
  // was told the team in front of them had not arrived.
  const resolvedHere = (team: ListingTeam) =>
    (team.resolved_checkpoint_orders ?? []).includes(order);
  const openHere = (team: ListingTeam) => (team.open_checkpoint_orders ?? []).includes(order);

  const teamsToEvaluate = teams.filter(
    (team) => !teamEvaluationStatus?.[team.id] && !resolvedHere(team) && openHere(team),
  );
  const teamsAtPreviousCheckpoints = teams.filter(
    (team) => !teamEvaluationStatus?.[team.id] && !resolvedHere(team) && !openHere(team),
  );
  const teamsAlreadyEvaluated = teams.filter(
    (team) => resolvedHere(team) || !!teamEvaluationStatus?.[team.id],
  );

  return (
    <div className="space-y-6">
      <OfflineQueueBanner />
      {/* Checkpoint banner */}
      <div className="rally-bg-accent relative overflow-hidden rounded-2xl p-5 text-white">
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

      <CheckpointAnnouncement />

      {staffScoringOff && (
        <div className="rally-surface flex items-start gap-3 rounded-2xl border border-border p-4">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground/60" />
          <div>
            <p className="font-semibold text-foreground">Pontuação pelo staff desativada</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Um administrador desligou a pontuação manual para este evento. Podes identificar as
              equipas, mas as avaliações têm de ser registadas por um administrador.
            </p>
          </div>
        </div>
      )}

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
              <Loader2 className="rally-accent h-8 w-8 animate-spin" />
              <p className="text-sm text-muted-foreground">A carregar atividades...</p>
            </div>
          ) : (
            <TeamActivitiesList
              team={selectedTeam}
              activities={teamActivities || []}
              onEvaluate={staffScoringOff ? undefined : handleEvaluateActivity}
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
              <span className="rally-bg-accent-soft rounded-full px-3 py-1 text-sm font-bold text-foreground">
                {checkpointTeams.length}
              </span>
            )}
          </div>

          {teams.length === 0 ? (
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

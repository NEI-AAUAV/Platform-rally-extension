import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Users, ArrowLeft, MapPin, Lock } from "lucide-react";
import { Spinner } from "@/components/shared";
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
      <div className="rally-surface mx-auto max-w-lg p-8 text-center">
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
      <div className="rally-surface mx-auto max-w-lg p-8 text-center">
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

  const evaluatedPct = Math.round((teamsAlreadyEvaluated.length / (teams.length || 1)) * 100);

  return (
    <div className="space-y-6">
      <OfflineQueueBanner />
      {/* Checkpoint banner */}
      <div className="rally-bg-accent overflow-hidden rounded-[28px] p-6 text-white sm:p-8">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/20">
            <MapPin className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.12em]">
              Posto #{checkpoint.order}
            </p>
            <p className="rally-display truncate text-4xl sm:text-5xl">{checkpoint.name}</p>
          </div>
          <div className="ml-auto shrink-0 text-right">
            <p className="rally-display text-5xl tabular-nums sm:text-6xl">
              {teamsAlreadyEvaluated.length}/{teams.length}
            </p>
            <p className="mt-1.5 text-xs font-semibold">Avaliadas</p>
          </div>
        </div>
        <div
          className="mt-6 h-2 w-full overflow-hidden rounded-full bg-white/25"
          role="progressbar"
          aria-label="Equipas avaliadas"
          aria-valuemin={0}
          aria-valuemax={teams.length}
          aria-valuenow={teamsAlreadyEvaluated.length}
        >
          <div
            className="h-full rounded-full bg-white transition-[width] duration-700 ease-out"
            style={{ width: `${evaluatedPct}%` }}
          />
        </div>
      </div>

      {/* Work area on the left, the post's own tools in a sticky rail on the
          right. On a phone the rail comes first: scanning the arriving team
          is the staff member's main action. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <aside
          className={cn(
            "space-y-4 lg:sticky lg:top-24 lg:order-last",
            // While a team is open on a phone the rail would push its
            // activities below the fold; the team list is one tap back.
            selectedTeam && !showTeamList && "hidden lg:block",
          )}
        >
          {/* Staff scans the arriving team's QR to identify + open its evaluation */}
          <StaffCheckinScanner
            checkpointId={Number(checkpointId)}
            onTeamIdentified={(teamId) => {
              const found = (checkpointTeams ?? []).find((t) => t.id === teamId);
              if (found) selectTeam(found);
            }}
          />

          <CheckpointAnnouncement />

          {staffScoringOff && (
            <div className="rally-surface flex items-start gap-3 p-5">
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground/60" />
              <div>
                <p className="font-semibold text-foreground">Pontuação pelo staff desativada</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Um administrador desligou a pontuação manual para este evento. Podes identificar
                  as equipas, mas as avaliações têm de ser registadas por um administrador.
                </p>
              </div>
            </div>
          )}
        </aside>

        <div className="min-w-0 space-y-6">
          {/* Team activities detail */}
          {selectedTeam && !showTeamList && (
            <div className="space-y-4">
              <Button onClick={backToTeams} variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar às equipas
              </Button>

              {teamActivitiesLoading ? (
                <div className="rally-surface flex flex-col items-center gap-3 p-10 text-center">
                  <Spinner size="md" className="rally-accent" label="" />
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
            <div className="space-y-8">
              <h2 className="rally-display text-4xl text-foreground sm:text-5xl">
                Equipas para avaliar
              </h2>

              {teams.length === 0 ? (
                <div className="rally-surface flex flex-col items-center gap-3 p-10 text-center">
                  <Users className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Nenhuma equipa disponível</p>
                </div>
              ) : (
                <div className="space-y-8">
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
        </div>
      </div>

      {showWarningDialog && (
        <IncompleteEvaluationDialog summary={evaluationSummary} onClose={dismissWarning} />
      )}
    </div>
  );
}

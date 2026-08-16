import { useState, useEffect, useRef, type FormEvent } from "react";
import { getTeamOpponent, getTeams } from "@/client";
import { logger } from "@/lib/logger";
import { useExtraShotsAndPenalties, getSubmitLabel } from "@/hooks/useExtraShotsAndPenalties";
import { useAppToast } from "@/hooks/use-toast";
import ExtraShotsField from "@/components/forms/shared/ExtraShotsField";
import PenaltiesFieldset from "@/components/forms/shared/PenaltiesFieldset";
import NotesField from "@/components/forms/shared/NotesField";
import FormSubmitButton from "@/components/forms/shared/FormSubmitButton";
import type { TeamVsFormProps } from "@/types/forms";
import type { ListingTeam } from "@/client";

function getOutcomePoints(result: string, config: TeamVsFormProps["config"]): number {
  if (result === "win") return Number(config.win_points ?? 100);
  if (result === "draw") return Number(config.draw_points ?? 50);
  return Number(config.lose_points ?? 0);
}

function getOutcomeLabel(result: string): string {
  if (result === "win") return "Vitória";
  if (result === "draw") return "Empate";
  return "Derrota";
}

async function fetchPreselectedOpponent(
  teamId: number,
): Promise<{ id: number; name: string } | null> {
  try {
    const { data: opponent } = await getTeamOpponent({ path: { team_id: teamId } });
    if (opponent?.opponent_id) {
      return { id: opponent.opponent_id, name: opponent.opponent_name || "" };
    }
  } catch (error) {
    logger.warn("Failed to fetch preselected opponent, falling back to manual selection", {
      teamId,
      error: String(error),
    });
  }
  return null;
}

export default function TeamVsForm({
  existingResult,
  team,
  config = {},
  onSubmit,
  isSubmitting,
  penaltyCounters = [],
}: TeamVsFormProps) {
  const [result, setResult] = useState<string>("win");
  const [completed, setCompleted] = useState<boolean>(true);
  const [opponentTeamId, setOpponentTeamId] = useState<number | undefined>();
  const [opponentTeamName, setOpponentTeamName] = useState<string>("");
  const [isOpponentPreselected, setIsOpponentPreselected] = useState(false);
  const [notes, setNotes] = useState<string>("");
  const [teams, setTeams] = useState<ListingTeam[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const teamsFetchedRef = useRef(false);
  const toast = useAppToast();

  const {
    extraShots,
    setExtraShots,
    penalties,
    penaltiesInPoints,
    setPenalties,
    maxExtraShots,
    maxExtraShotsPerMember,
    showExtraShots,
    penaltyValues,
    showVomitPenalty,
    showNotDrinkingPenalty,
    showPenalties,
    validateExtraShots,
  } = useExtraShotsAndPenalties(team, existingResult, penaltyCounters);

  // Fetch opponent when team is available, then fetch teams if needed
  useEffect(() => {
    const loadTeamsList = async (teamId: number) => {
      teamsFetchedRef.current = true;
      setIsLoadingTeams(true);
      try {
        const { data: teamsList } = await getTeams();
        const filteredTeams = teamsList.filter((t: ListingTeam) => t.id !== teamId);
        setTeams(filteredTeams);

        // If we have an opponent ID from existingResult but no name, try to find it now
        const currentOpponentId = opponentTeamId || existingResult?.result_data?.opponent_team_id;
        const foundTeam = currentOpponentId
          ? filteredTeams.find((t: ListingTeam) => t.id === currentOpponentId)
          : undefined;
        if (foundTeam && !opponentTeamName) {
          setOpponentTeamName(foundTeam.name);
        }
      } catch (error) {
        toast.error("Falha ao carregar lista de equipas");
        teamsFetchedRef.current = false; // Allow retry on error
      } finally {
        setIsLoadingTeams(false);
      }
    };

    const initializeOpponent = async () => {
      if (!team?.id) return;

      // First, try to fetch opponent from versus pair (if not in existingResult)
      if (!existingResult?.result_data?.opponent_team_id) {
        const preselected = await fetchPreselectedOpponent(team.id);
        if (preselected) {
          setOpponentTeamId(preselected.id);
          setOpponentTeamName(preselected.name);
          setIsOpponentPreselected(true);
          return; // Opponent is preselected, don't fetch teams
        }
      }

      // If opponent is not preselected, fetch teams list (only once)
      if (!teamsFetchedRef.current && !isLoadingTeams) {
        await loadTeamsList(team.id);
      }
    };

    void initializeOpponent();
    // Note: Intentionally omitting opponentTeamId, opponentTeamName, and teams from dependencies
    // to avoid infinite loops. These are state variables set by this effect itself.
    // The effect only needs to run when team.id or existingResult changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team?.id, existingResult?.result_data?.opponent_team_id]);

  useEffect(() => {
    if (existingResult?.result_data) {
      setResult((existingResult.result_data.result as string) || "win");
      if (typeof existingResult.result_data.completed === "boolean") {
        setCompleted(existingResult.result_data.completed);
      }
      const existingOpponentId = existingResult.result_data.opponent_team_id as number | undefined;
      // Only set opponent if not already set to avoid infinite loops
      if (existingOpponentId && opponentTeamId === undefined) {
        setOpponentTeamId(existingOpponentId);
        // Try to find team name from teams list if available
        if (teams.length > 0) {
          const existingTeam = teams.find((t) => t.id === existingOpponentId);
          if (existingTeam && opponentTeamName === "") {
            setOpponentTeamName(existingTeam.name);
          }
        }
        // Don't mark as preselected when loading from existingResult - allow editing
        setIsOpponentPreselected(false);
      }
      setNotes((existingResult.result_data.notes as string) || "");
    }
    // Only depend on existingResult and teams - not on opponentTeamId/opponentTeamName
    // to avoid infinite loops when these values are set inside the effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingResult, teams]);

  // Compute live score breakdown from config
  const basePoints = Number(config.base_points ?? 0);
  const completionPoints = Number(config.completion_points ?? 0);
  const outcomePoints = getOutcomePoints(result, config);
  const hasTieredScoring = basePoints > 0 || completionPoints > 0;
  const previewTotal = basePoints + (completed ? completionPoints : 0) + outcomePoints;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (!validateExtraShots()) return;

    onSubmit({
      result_data: {
        result: result,
        completed: completed,
        opponent_team_id: opponentTeamId,
        notes: notes,
      },
      extra_shots: extraShots,
      penalties: penaltiesInPoints,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="teamvs-result" className="mb-2 block text-sm font-medium text-foreground">
          Resultado do confronto
        </label>
        <select
          id="teamvs-result"
          data-testid="select-result"
          value={result}
          onChange={(e) => setResult(e.target.value)}
          className="w-full rounded border border-border bg-muted p-3 text-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500"
        >
          <option value="win" className="bg-gray-800">
            Vitória
          </option>
          <option value="lose" className="bg-gray-800">
            Derrota
          </option>
          <option value="draw" className="bg-gray-800">
            Empate
          </option>
        </select>
      </div>

      {/* Completed toggle — only shown when activity has tiered scoring configured */}
      {hasTieredScoring && (
        <div>
          <label
            htmlFor="teamvs-toggle-completed"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            Desafio concluído?
          </label>
          <div className="flex items-center gap-3">
            <button
              id="teamvs-toggle-completed"
              type="button"
              data-testid="toggle-completed"
              onClick={() => setCompleted(!completed)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 ${
                completed ? "bg-green-500" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  completed ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span className="text-sm text-muted-foreground">
              {completed ? "✓ Completou o desafio" : "✗ Não completou o desafio"}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">+{completionPoints} pts se completou</p>
        </div>
      )}

      {/* Live score preview — shown when tiered scoring is configured */}
      {hasTieredScoring && (
        <div className="rounded border border-border bg-muted p-3 text-sm">
          <p className="mb-1 font-medium text-muted-foreground">Pontuação estimada</p>
          <div className="space-y-0.5 text-muted-foreground">
            <div className="flex justify-between">
              <span>Participação</span>
              <span>+{basePoints} pts</span>
            </div>
            <div className={`flex justify-between ${completed ? "" : "line-through opacity-40"}`}>
              <span>Completou desafio</span>
              <span>+{completionPoints} pts</span>
            </div>
            <div className="flex justify-between">
              <span className="capitalize">{getOutcomeLabel(result)}</span>
              <span>+{outcomePoints} pts</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold text-foreground">
              <span>Total</span>
              <span>{previewTotal} pts</span>
            </div>
          </div>
        </div>
      )}

      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">
          Adversário {opponentTeamName && `(${opponentTeamName})`}
        </label>
        {isOpponentPreselected && opponentTeamId && opponentTeamName ? (
          // Show read-only display when opponent is automatically preselected
          <div>
            <input
              type="text"
              value={opponentTeamName}
              disabled
              className="w-full cursor-not-allowed rounded border border-border bg-muted p-3 text-foreground opacity-50"
            />
            <p className="mt-1 text-sm text-muted-foreground">
              ✓ Adversário definido automaticamente pelo par de confronto
            </p>
          </div>
        ) : (
          // Show select dropdown when opponent is not preselected or manually selected
          <select
            value={opponentTeamId || ""}
            onChange={(e) => {
              const selectedId = e.target.value ? Number(e.target.value) : undefined;
              setOpponentTeamId(selectedId);
              const selectedTeam = teams.find((t) => t.id === selectedId);
              setOpponentTeamName(selectedTeam?.name || "");
              setIsOpponentPreselected(false); // Mark as manually selected
            }}
            disabled={isLoadingTeams || isSubmitting}
            className="w-full rounded border border-border bg-muted p-3 text-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            required
          >
            <option value="" className="bg-gray-800">
              {isLoadingTeams ? "A carregar equipas..." : "Seleciona a equipa adversária"}
            </option>
            {teams.map((teamOption) => (
              <option key={teamOption.id} value={teamOption.id} className="bg-gray-800">
                {teamOption.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {showExtraShots && (
        <ExtraShotsField
          idPrefix="teamvs"
          extraShots={extraShots}
          onChange={setExtraShots}
          maxExtraShots={maxExtraShots}
          maxExtraShotsPerMember={maxExtraShotsPerMember}
        />
      )}

      {showPenalties && (
        <PenaltiesFieldset
          idPrefix="teamvs"
          penalties={penalties}
          onChange={setPenalties}
          penaltyValues={penaltyValues}
          penaltyCounters={penaltyCounters}
          showVomitPenalty={showVomitPenalty}
          showNotDrinkingPenalty={showNotDrinkingPenalty}
        />
      )}

      <NotesField idPrefix="teamvs" notes={notes} onChange={setNotes} />

      <FormSubmitButton
        isSubmitting={isSubmitting}
        label={getSubmitLabel(isSubmitting, !!existingResult)}
      />
    </form>
  );
}

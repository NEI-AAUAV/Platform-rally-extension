import { useState } from "react";
import React from "react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  CheckCircle,
  Clock,
  Star,
  Trophy,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface Evaluation {
  id: number;
  team_id: number;
  activity_id: number;
  final_score: number;
  is_completed: boolean;
  completed_at: string;
  result_data?: Record<string, unknown> & {
    result?: string;
    opponent_team_id?: number;
    notes?: string;
  };
  extra_shots?: number;
  penalties?: Record<string, number>;
  time_score?: number;
  points_score?: number;
  boolean_score?: boolean;
  team: {
    id: number;
    name: string;
    num_members?: number;
  };
  activity: {
    id: number;
    name: string;
    activity_type: string;
    checkpoint_id: number;
    description?: string;
    config?: Record<string, unknown>;
  };
}

type AllEvaluationsProps = Readonly<{
  evaluations: Evaluation[];
}>;

function getTeamVsResultLabel(result: string): string {
  if (result === "win") return "✓ Won";
  if (result === "lose") return "✗ Lost";
  return "= Draw";
}

const activityTypeIcons = {
  TimeBasedActivity: Clock,
  ScoreBasedActivity: Star,
  BooleanActivity: CheckCircle,
  TeamVsActivity: Trophy,
  GeneralActivity: Activity,
};

const TEAM_VS_CLASSES: Record<string, string> = {
  win: "border-green-500/50 text-green-400",
  lose: "border-red-500/50 text-red-400",
};

function TeamVsResultBadges({ result, opponentId }: { result: string; opponentId: number | null }) {
  const badgeClass = TEAM_VS_CLASSES[result] ?? "border-yellow-500/50 text-yellow-400";
  return (
    <>
      <Badge variant="outline" className={`text-xs ${badgeClass}`}>
        {getTeamVsResultLabel(result)}
      </Badge>
      {opponentId !== null && (
        <Badge variant="outline" className="text-xs">
          vs Equipa #{opponentId}
        </Badge>
      )}
    </>
  );
}

export default function AllEvaluations({ evaluations: evaluationsProp }: AllEvaluationsProps) {
  const evaluations = Array.isArray(evaluationsProp) ? evaluationsProp : [];
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<string>("all");
  const [expandedEvaluations, setExpandedEvaluations] = useState<Set<number>>(new Set());

  const toggleExpand = (evaluationId: number) => {
    setExpandedEvaluations((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(evaluationId)) {
        newSet.delete(evaluationId);
      } else {
        newSet.add(evaluationId);
      }
      return newSet;
    });
  };

  // Get unique teams and checkpoints for filter options
  const uniqueTeams = Array.from(new Set(evaluations.map((e) => e.team.name))).sort((a, b) =>
    a.localeCompare(b),
  );
  const uniqueCheckpoints = Array.from(
    new Set(evaluations.map((e) => e.activity.checkpoint_id)),
  ).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));

  // Filter evaluations based on selected filters
  const filteredEvaluations = evaluations.filter((evaluation) => {
    const teamMatch = selectedTeam === "all" || evaluation.team.name === selectedTeam;
    const checkpointMatch =
      selectedCheckpoint === "all" ||
      evaluation.activity.checkpoint_id.toString() === selectedCheckpoint;
    return teamMatch && checkpointMatch;
  });

  const hasActiveFilters = selectedTeam !== "all" || selectedCheckpoint !== "all";
  if (!evaluations || evaluations.length === 0) {
    return (
      <div className="rally-surface rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Activity className="h-5 w-5" />
            Todas as Avaliações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-4 text-center text-muted-foreground">Nenhuma avaliação encontrada.</p>
        </CardContent>
      </div>
    );
  }

  return (
    <div className="rally-surface rounded-2xl">
      <CardContent>
        {/* Filters */}
        <div className="mb-4 mt-4 p-2">
          <div className="mb-3 flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Filtros</span>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setSelectedTeam("all");
                  setSelectedCheckpoint("all");
                }}
                className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
                Limpar filtros
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {/* Team Filter */}
            <div>
              <label htmlFor="filter-team" className="mb-1 block text-xs text-muted-foreground">
                Equipa
              </label>
              <select
                id="filter-team"
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="w-full rounded border border-border bg-muted p-2 text-sm text-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500"
              >
                <option value="all" className="bg-background">
                  Todas as equipas
                </option>
                {uniqueTeams.map((team) => (
                  <option key={team} value={team} className="bg-background">
                    {team}
                  </option>
                ))}
              </select>
            </div>

            {/* Checkpoint Filter */}
            <div>
              <label
                htmlFor="filter-checkpoint"
                className="mb-1 block text-xs text-muted-foreground"
              >
                Posto
              </label>
              <select
                id="filter-checkpoint"
                value={selectedCheckpoint}
                onChange={(e) => setSelectedCheckpoint(e.target.value)}
                className="w-full rounded border border-border bg-muted p-2 text-sm text-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500"
              >
                <option value="all" className="bg-background">
                  Todos os postos
                </option>
                {uniqueCheckpoints.map((checkpoint) => (
                  <option key={checkpoint} value={checkpoint.toString()} className="bg-background">
                    Checkpoint {checkpoint}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="mt-2 text-xs text-muted-foreground">
              Showing {filteredEvaluations.length} of {evaluations.length} evaluations
            </div>
          )}
        </div>

        <div className="space-y-3">
          {filteredEvaluations.map((evaluation) => {
            const IconComponent =
              activityTypeIcons[
                evaluation.activity.activity_type as keyof typeof activityTypeIcons
              ] || Activity;
            const isExpanded = expandedEvaluations.has(evaluation.id);

            // Compute TeamVsActivity result badge if applicable
            let teamVsResult: React.ReactNode = null;
            if (evaluation.activity.activity_type === "TeamVsActivity" && evaluation.result_data) {
              const resultValue = evaluation.result_data.result;
              if (typeof resultValue === "string" && resultValue) {
                const result: string = resultValue; // Type assertion after type guard
                const opponentId =
                  "opponent_team_id" in evaluation.result_data &&
                  typeof evaluation.result_data.opponent_team_id === "number"
                    ? evaluation.result_data.opponent_team_id
                    : null;
                teamVsResult = <TeamVsResultBadges result={result} opponentId={opponentId} />;
              }
            }
            const hasDetails =
              (evaluation.result_data && Object.keys(evaluation.result_data).length > 0) ||
              (evaluation.extra_shots && evaluation.extra_shots > 0) ||
              (evaluation.penalties && Object.keys(evaluation.penalties).length > 0);

            return (
              <div
                key={evaluation.id}
                className="rounded-lg border border-border bg-secondary p-3 transition-colors hover:bg-accent"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      disabled={!hasDetails}
                      onClick={() => toggleExpand(evaluation.id)}
                      aria-expanded={hasDetails ? isExpanded : undefined}
                      className="flex w-full min-w-0 flex-1 cursor-pointer items-start gap-3 border-none bg-transparent p-0 text-left disabled:cursor-default"
                    >
                      <div className="flex items-center gap-2">
                        <IconComponent className="mt-0.5 h-5 w-5 flex-shrink-0 text-foreground" />
                        {hasDetails &&
                          (isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ))}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-base font-semibold text-foreground sm:text-sm">
                          {evaluation.activity.name}
                        </h4>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Team: {evaluation.team.name} • Checkpoint{" "}
                          {evaluation.activity.checkpoint_id}
                          {evaluation.activity.description && (
                            <span className="mt-1 block text-xs">
                              {evaluation.activity.description}
                            </span>
                          )}
                        </p>
                        {(evaluation.team.num_members ?? 0) > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Team Size: {evaluation.team.num_members} members
                          </p>
                        )}
                      </div>
                    </button>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Badge
                        variant="default"
                        className="w-fit bg-green-500/20 text-xs text-green-400 sm:text-sm"
                      >
                        Pontuação: {evaluation.final_score?.toFixed(1) || "0"}
                      </Badge>
                      <div className="flex flex-col gap-0.5">
                        <Badge
                          variant="outline"
                          className="w-fit border-border text-[10px] text-muted-foreground"
                        >
                          {new Date(evaluation.completed_at).toLocaleDateString()}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="w-fit border-border text-[10px] text-muted-foreground"
                        >
                          {new Date(evaluation.completed_at).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {isExpanded && hasDetails && (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      {/* Result Section */}
                      {(evaluation.is_completed ||
                        evaluation.time_score ||
                        evaluation.points_score ||
                        evaluation.result_data?.result ||
                        (evaluation.activity.activity_type === "BooleanActivity" &&
                          evaluation.boolean_score !== undefined)) && (
                        <div>
                          <p className="mb-1 text-xs font-semibold text-muted-foreground">
                            Resultado:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {evaluation.is_completed && (
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  evaluation.final_score > 0
                                    ? "border-green-500/50 bg-green-500/10 text-green-400"
                                    : "border-yellow-500/50 bg-yellow-500/10 text-yellow-400"
                                }`}
                              >
                                {evaluation.final_score > 0 ? "✓ Completed" : "○ Attempted"}
                              </Badge>
                            )}

                            {evaluation.time_score && (
                              <Badge variant="outline" className="text-xs">
                                Time: {evaluation.time_score.toFixed(2)}s
                              </Badge>
                            )}
                            {evaluation.points_score && (
                              <Badge variant="outline" className="text-xs">
                                Points: {evaluation.points_score}
                              </Badge>
                            )}
                            {evaluation.activity.activity_type === "BooleanActivity" &&
                              evaluation.boolean_score !== undefined && (
                                <Badge
                                  variant="outline"
                                  className={`text-xs ${
                                    evaluation.boolean_score
                                      ? "border-green-500/50 text-green-400"
                                      : "border-red-500/50 text-red-400"
                                  }`}
                                >
                                  {evaluation.boolean_score ? "✓ Success" : "✗ Failed"}
                                </Badge>
                              )}

                            {/* TeamVsActivity Result */}
                            {teamVsResult}

                            {/* Notes */}
                            {evaluation.result_data?.notes &&
                              typeof evaluation.result_data.notes === "string" &&
                              evaluation.result_data.notes.trim() !== "" && (
                                <Badge variant="outline" className="text-xs">
                                  Note: {evaluation.result_data.notes}
                                </Badge>
                              )}
                          </div>
                        </div>
                      )}

                      {(evaluation.extra_shots ?? 0) > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-semibold text-blue-400">Modifiers:</p>
                          <div className="flex flex-wrap gap-1">
                            <Badge
                              variant="outline"
                              className="border-blue-500/30 text-xs text-blue-400"
                            >
                              Extra Shots: +{evaluation.extra_shots}
                            </Badge>
                            {(evaluation.team.num_members ?? 0) > 0 && (
                              <Badge
                                variant="outline"
                                className="border-blue-500/30 text-xs text-blue-400"
                              >
                                Team Members: {evaluation.team.num_members}
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}

                      {evaluation.penalties && Object.keys(evaluation.penalties).length > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-semibold text-red-400">Penalties:</p>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(evaluation.penalties).map(([key, value]) => (
                              <Badge
                                key={key}
                                variant="outline"
                                className="border-red-500/30 text-xs text-red-400"
                              >
                                {key}: {value}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </div>
  );
}

export { AllEvaluations };
export type { Evaluation };

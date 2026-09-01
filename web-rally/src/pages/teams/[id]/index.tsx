import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link, Navigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { nthNumber } from "./teamDetails.types";
import { useTeamDetails } from "./useTeamDetails";
import { NextCheckpointCard } from "./NextCheckpointCard";
import { CheckpointTimelineItem } from "./CheckpointTimelineItem";
import { BadgeShowcase } from "@/components/badges/BadgeShowcase";

export default function TeamsById() {
  const { id } = useParams({ strict: false }) as { id: string };
  const [expandedCheckpoints, setExpandedCheckpoints] = useState<Set<number>>(new Set());

  const {
    settings,
    team,
    isLoading,
    isSuccess,
    checkpoints,
    activityResults,
    allEvaluations,
    totalTeams,
    totalCount,
    resolvedOrders,
    nextCheckpoint,
    isRouteFinished,
    rank,
  } = useTeamDetails(id);

  const penaltiesByOrder = new Map(
    (team?.penalties_per_checkpoint ?? []).map((p) => [p.checkpoint_order, p]),
  );

  const toggleCheckpoint = (checkpointIndex: number) => {
    setExpandedCheckpoints((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(checkpointIndex)) {
        newSet.delete(checkpointIndex);
      } else {
        newSet.add(checkpointIndex);
      }
      return newSet;
    });
  };

  const renderTeamContent = () => {
    if (isLoading) {
      return (
        <div className="rally-surface mt-16 rounded-2xl p-6 text-center">
          <div className="text-lg font-semibold">A carregar...</div>
        </div>
      );
    }

    if (isSuccess) {
      return (
        <div className="rally-surface mt-16 rounded-2xl p-6 text-center">
          <div className="text-lg font-semibold">Detalhes da equipa ocultos</div>
          <div className="mt-2 text-sm text-muted-foreground">
            O organizador desativou a visualização de detalhes das equipas.
          </div>
          <div className="mt-4">
            <Link
              to="/teams"
              className="inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2 font-medium text-foreground transition-colors hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar à lista de equipas
            </Link>
          </div>
        </div>
      );
    }

    return null;
  };

  if (Number.isNaN(Number(id))) {
    return <Navigate to="/teams" />;
  }

  return (
    <>
      <Button className="mb-6 mt-2 p-0" variant={"ghost"} asChild>
        <Link to="/teams" className="flex items-center gap-1">
          <ArrowLeft className="h-5 w-5" /> Voltar à lista de equipas
        </Link>
      </Button>

      {/* Team Details */}
      {isSuccess && team && settings?.show_team_details !== false ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start">
          {/* Left column — identity, badges, members */}
          <div className="space-y-6 lg:sticky lg:top-24">
            <div className="rally-surface rally-elevate overflow-hidden">
              {/* accent identity banner */}
              <div className="rally-bg-accent-soft flex items-center gap-4 px-5 py-5">
                <span className="rally-bg-accent grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-xl font-bold text-white shadow-[var(--rally-shadow-md)]">
                  {team.name
                    .split(/\s+/)
                    .filter(Boolean)
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="rally-display truncate text-2xl font-bold text-foreground">
                    {team.name}
                  </p>
                  {rank != null && (
                    <span className="rally-bg-accent mt-1.5 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white">
                      {rank}
                      {nthNumber(rank)} lugar
                    </span>
                  )}
                </div>
              </div>
              {settings?.show_score_mode !== "hidden" && (
                <div className="px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Pontuação
                  </p>
                  <p className="rally-display rally-accent mt-1 text-4xl font-bold tabular-nums">
                    {team.total}
                    <span className="ml-1 text-base font-medium text-muted-foreground">pts</span>
                  </p>
                </div>
              )}
            </div>

            {settings?.badges_enabled !== false && <BadgeShowcase teamId={Number(id)} />}

            <div>
              <h2 className="mb-3 text-lg font-semibold">Membros</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {team?.members.map((member) => {
                  const names = member.name.split(" ");
                  const firstName = names[0];
                  const lastName = names.slice(1).join(" ");
                  return (
                    <div key={member.id} className="rally-surface rounded-xl p-4 sm:p-6">
                      <span className="font-medium">{firstName}</span>{" "}
                      <span className="font-light text-muted-foreground">{lastName}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right column — progress timeline */}
          <div className="space-y-6">
            <NextCheckpointCard
              nextCheckpoint={nextCheckpoint}
              isRouteFinished={isRouteFinished}
              settings={settings}
            />

            <div className="rally-surface rounded-2xl p-4 sm:p-6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Progresso: {resolvedOrders.size} de {totalCount} postos
                </span>
                {settings?.show_score_mode !== "hidden" && (
                  <span className="font-medium">{team.total} pts</span>
                )}
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="rally-bg-accent h-full transition-all duration-500"
                  style={{
                    width: `${(resolvedOrders.size / (totalCount || 1)) * 100}%`,
                  }}
                />
              </div>
            </div>

            {/* The whole route, in order — the same array /team-progress
                renders. Iterating `Array.from({length: last_checkpoint_number})`
                showed only the posts the team had finished, numbered by
                position, so a free-order or staged route was unreadable and a
                team ahead of the count had rows the lookup could not match. */}
            <div className="space-y-4">
              {checkpoints && checkpoints.length > 0 ? (
                checkpoints.map((checkpoint, index: number) => (
                  <CheckpointTimelineItem
                    key={checkpoint.id}
                    team={team}
                    index={index}
                    checkpoint={checkpoint}
                    isResolved={resolvedOrders.has(checkpoint.order)}
                    penalties={penaltiesByOrder.get(checkpoint.order)}
                    isCurrent={
                      !resolvedOrders.has(checkpoint.order) && checkpoint.is_reachable === true
                    }
                    activityResults={activityResults}
                    allEvaluations={allEvaluations}
                    totalTeams={totalTeams}
                    isExpanded={expandedCheckpoints.has(index)}
                    onToggle={toggleCheckpoint}
                  />
                ))
              ) : (
                <div className="rally-surface rounded-2xl p-6 text-center">
                  <p className="text-muted-foreground">Ainda sem postos visitados</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        renderTeamContent()
      )}
    </>
  );
}

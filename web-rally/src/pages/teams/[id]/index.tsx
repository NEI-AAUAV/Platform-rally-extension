import { Button } from "@/components/ui/button";
import { ArrowBigLeft } from "lucide-react";
import { Link, Navigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { nthNumber } from "./teamDetails.types";
import { useTeamDetails } from "./useTeamDetails";
import { NextCheckpointCard } from "./NextCheckpointCard";
import { CheckpointTimelineItem } from "./CheckpointTimelineItem";
import { BadgeShowcase } from "@/components/badges/BadgeShowcase";
import { ShareButton } from "@/components/shared/ShareButton";

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
  } = useTeamDetails(id);

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
        <div className="rally-surface rounded-2xl p-6 mt-16 text-center">
          <div className="text-lg font-semibold">A carregar...</div>
        </div>
      );
    }

    if (isSuccess) {
      return (
        <div className="rally-surface rounded-2xl p-6 mt-16 text-center">
          <div className="text-lg font-semibold">Detalhes da equipa ocultos</div>
          <div className="text-muted-foreground mt-2 text-sm">
            O organizador desativou a visualização de detalhes das equipas.
          </div>
          <div className="mt-4">
            <Link to="/teams" className="inline-flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted rounded-lg text-foreground font-medium transition-colors">
              <ArrowBigLeft className="w-4 h-4" />
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
          <ArrowBigLeft className="h-5 w-5" /> Voltar à lista de equipas
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
                  <span className="rally-bg-accent mt-1.5 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white">
                    {team.classification}
                    {nthNumber(team.classification)} lugar
                  </span>
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
              <div className="flex justify-end px-5 pb-4">
                <ShareButton title={`${team.name} — Rally`} label="Partilhar equipa" />
              </div>
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
              team={team}
              checkpoints={checkpoints}
              totalCount={totalCount}
              settings={settings}
            />

            <div className="rally-surface rounded-2xl p-4 sm:p-6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Progresso: {team.last_checkpoint_number || 0} de {totalCount} postos
                </span>
                {settings?.show_score_mode !== "hidden" && (
                  <span className="font-medium">{team.total} pts</span>
                )}
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="rally-bg-accent h-full transition-all duration-500"
                  style={{ width: `${((team.last_checkpoint_number || 0) / (totalCount || 1)) * 100}%` }}
                />
              </div>
            </div>

            <div className="space-y-4">
              {(team?.last_checkpoint_number ?? team?.times?.length ?? 0) > 0 ? (
                Array.from({ length: team.last_checkpoint_number ?? team.times.length }).map((_, index: number) => (
                  <CheckpointTimelineItem
                    key={checkpoints?.find((cp) => cp.order === index + 1)?.id ?? `checkpoint-${index}`}
                    team={team}
                    index={index}
                    checkpoints={checkpoints}
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

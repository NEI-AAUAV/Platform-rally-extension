import { Button } from "@/components/ui/button";
import { ArrowBigLeft } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useState } from "react";
import { useThemedComponents } from "@/components/themes";
import { nthNumber } from "./teamDetails.types";
import { useTeamDetails } from "./useTeamDetails";
import { NextCheckpointCard } from "./NextCheckpointCard";
import { CheckpointTimelineItem } from "./CheckpointTimelineItem";

export default function TeamsById() {
  const { Card } = useThemedComponents();
  const { id } = useParams<{ id: string }>();
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
        <Card variant="default" padding="lg" rounded="2xl" className="mt-16 text-center">
          <div className="text-lg font-semibold">A carregar...</div>
        </Card>
      );
    }

    if (isSuccess) {
      return (
        <Card variant="default" padding="lg" rounded="2xl" className="mt-16 text-center">
          <div className="text-lg font-semibold">Detalhes da equipa ocultos</div>
          <div className="text-white/70 mt-2 text-sm">
            O organizador desativou a visualização de detalhes das equipas.
          </div>
          <div className="mt-4">
            <Link to="/teams" className="inline-flex items-center gap-2 px-4 py-2 bg-[rgb(255,255,255,0.1)] hover:bg-[rgb(255,255,255,0.2)] rounded-lg text-white font-medium transition-colors">
              <ArrowBigLeft className="w-4 h-4" />
              Voltar à lista de equipas
            </Link>
          </div>
        </Card>
      );
    }

    return null;
  };

  if (Number.isNaN(Number(id))) {
    return <Navigate to="/teams" />;
  }

  return (
    <>
      <Button className="my-16 p-0" variant={"ghost"}>
        <Link to="/teams" className="flex">
          <ArrowBigLeft /> Go back to teams list
        </Link>
      </Button>

      {/* Team Details */}
      {isSuccess && team && settings?.show_team_details !== false ? (
        <div className="team-details">
          {/* Team Header */}
          <div className="team-header">
            <h2 className="mb-4 text-2xl font-semibold">Team description and score</h2>
          </div>

          <Card variant="default" padding="lg" rounded="2xl" className="mb-8">
            <div className="text-center">
              <p className="mb-4 text-xl font-semibold">{team.name}</p>
              <div>
                <p className="mb-2">{team.total} points</p>
                <p className="text-sm font-light">
                  {team.classification}
                  {nthNumber(team.classification)} place
                </p>
              </div>
            </div>
          </Card>

          {/* Next Checkpoint Section */}
          <NextCheckpointCard
            team={team}
            checkpoints={checkpoints}
            totalCount={totalCount}
            settings={settings}
          />

          <h2 className="mb-4 text-2xl font-semibold">Checkpoint Progress</h2>
          <Card variant="default" padding="md" rounded="2xl" className="mb-6">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70">
                Progress: {team.last_checkpoint_number || 0} of {totalCount} checkpoints
              </span>
              {settings?.show_score_mode !== "hidden" && (
                <span className="font-medium">{team.total} pts</span>
              )}
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${((team.last_checkpoint_number || 0) / (totalCount || 1)) * 100}%` }}
              />
            </div>
          </Card>

          <div className="mb-8 space-y-4">
            {team?.times && team.times.length > 0 ? (
              team.times.map((_, index: number) => (
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
              <Card variant="default" padding="lg" rounded="2xl" className="text-center">
                <p className="text-white/70">No checkpoints visited yet</p>
              </Card>
            )}
          </div>

          {/* Team Members */}
          <div className="team-members">
            <h2 className="mb-4 text-2xl font-semibold">Team Members</h2>
            <div className="grid gap-4">
              {team?.members.map((member) => {
                const names = member.name.split(" ");
                const firstName = names[0];
                const lastName = names.slice(1).join(" ");
                return (
                  <Card variant="default" padding="lg" rounded="2xl" className="text-xl" key={member.id}>
                    <span className="font-medium">{firstName}</span>{" "}
                    <span className="font-light">{lastName}</span>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        renderTeamContent()
      )}
    </>
  );
}

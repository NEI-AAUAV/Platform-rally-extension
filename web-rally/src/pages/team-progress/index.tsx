import { MapPin } from "lucide-react";
import { useTeamProgress } from "./useTeamProgress";
import useTeamNotifications from "@/hooks/useTeamNotifications";
import StatusScreen from "./StatusScreen";
import TeamProgressSkeleton from "./TeamProgressSkeleton";
import TeamHeaderCard from "./TeamHeaderCard";
import TeamMembersCard from "./TeamMembersCard";
import ProgressSummaryCard from "./ProgressSummaryCard";
import NextCheckpointCard from "./NextCheckpointCard";
import RouteCheckpointItem from "./RouteCheckpointItem";
import MapSection from "@/pages/checkpoints/components/MapSection";

export default function TeamProgress() {
  const {
    settings,
    team,
    checkpoints,
    isLoading,
    teamError,
    expandedCheckpoints,
    toggleCheckpoint,
    completedCheckpointsCount,
    nextCheckpoint,
    showScore,
    showRanking,
    totalCount,
  } = useTeamProgress();

  useTeamNotifications(team);

  if (isLoading) {
    return <TeamProgressSkeleton />;
  }

  if (!settings?.participant_view_enabled) {
    return (
      <StatusScreen
        variant="error"
        title="Vista não disponível"
        description="A vista de participante está atualmente desativada pelos administradores."
      />
    );
  }

  if (teamError || !team) {
    return (
      <StatusScreen
        variant="error"
        title="Erro ao carregar"
        description="Não foi possível carregar o progresso da equipa."
      />
    );
  }

  const showMap = settings?.show_checkpoint_map ?? true;

  return (
    <div className="duration-500 animate-in fade-in">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-6 lg:sticky lg:top-24">
          <TeamHeaderCard
            team={team}
            showScore={showScore}
            showRanking={showRanking}
            completedCount={completedCheckpointsCount}
            totalCount={totalCount}
          />
          <TeamMembersCard team={team} />
          <ProgressSummaryCard
            completedCount={completedCheckpointsCount}
            totalCount={totalCount}
            totalScore={team.total}
            showScore={showScore}
          />

          {showMap && checkpoints && checkpoints.length > 0 && (
            <MapSection
              checkpoints={checkpoints}
              // A redacted next checkpoint has no coordinates — nothing to
              // fly to, and selecting it would print a "Posto selecionado"
              // label over a pin that isn't there.
              selectedCheckpoint={
                nextCheckpoint?.latitude != null && nextCheckpoint?.longitude != null
                  ? nextCheckpoint
                  : null
              }
            />
          )}

          {nextCheckpoint && <NextCheckpointCard checkpoint={nextCheckpoint} showMap={showMap} />}
        </div>

        {checkpoints && checkpoints.length > 0 && (
          <div className="space-y-4">
            <h2 className="rally-display flex items-center gap-2 px-2 text-xl font-bold text-foreground">
              <MapPin className="rally-accent h-5 w-5" />
              Percurso
            </h2>
            <div className="space-y-3">
              {checkpoints.map((checkpoint, index) => (
                <RouteCheckpointItem
                  key={checkpoint.id}
                  checkpoint={checkpoint}
                  index={index}
                  team={team}
                  completedCount={completedCheckpointsCount}
                  showScore={showScore}
                  showMap={showMap}
                  isExpanded={expandedCheckpoints.has(index)}
                  onToggle={toggleCheckpoint}
                  isLast={index === checkpoints.length - 1}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

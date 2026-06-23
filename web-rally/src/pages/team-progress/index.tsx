import { MapPin } from "lucide-react";
import { useThemedComponents } from "@/components/themes/ThemeContext";
import { useTeamProgress } from "./useTeamProgress";
import StatusScreen from "./StatusScreen";
import TeamHeaderCard from "./TeamHeaderCard";
import TeamMembersCard from "./TeamMembersCard";
import ProgressSummaryCard from "./ProgressSummaryCard";
import NextCheckpointCard from "./NextCheckpointCard";
import RouteCheckpointItem from "./RouteCheckpointItem";

export default function TeamProgress() {
  const { config, background } = useThemedComponents();
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

  if (isLoading) {
    return <StatusScreen variant="loading" title="A carregar progresso..." />;
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

  const showMap = settings?.show_checkpoint_map !== false;

  return (
    <div className="min-h-screen p-4 pb-20 transition-colors duration-500" style={background}>
      <div className="max-w-2xl mx-auto pt-6 animate-in fade-in duration-500 space-y-6">
        <TeamHeaderCard team={team} showScore={showScore} showRanking={showRanking} />
        <TeamMembersCard team={team} />
        <ProgressSummaryCard
          completedCount={completedCheckpointsCount}
          totalCount={totalCount}
          totalScore={team.total}
          showScore={showScore}
        />

        {nextCheckpoint && <NextCheckpointCard checkpoint={nextCheckpoint} showMap={showMap} />}

        {checkpoints && checkpoints.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2 px-2" style={{ color: config?.colors?.text }}>
              <MapPin className="w-5 h-5" style={{ color: config?.colors?.primary }} />
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
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

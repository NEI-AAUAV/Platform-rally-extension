import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, ArrowLeft, MapPin } from "lucide-react";
import { useParams } from "@tanstack/react-router";
import useRallySettings from "@/hooks/useRallySettings";
import type { ListingTeam } from "@/client";
import { TeamActivitiesList } from "./TeamActivitiesList";
import { TeamSection } from "./TeamSection";
import { IncompleteEvaluationDialog } from "./IncompleteEvaluationDialog";
import { useCheckpointEvaluation } from "./useCheckpointEvaluation";
import { CheckinQrPanel } from "@/components/checkin/CheckinQrPanel";

export default function CheckpointTeamEvaluation() {
  const { checkpointId } = useParams({ strict: false }) as { checkpointId: string };
  const { settings } = useRallySettings();
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
      <div className="p-2 sm:p-4 md:p-6">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Checkpoint Not Found</h2>
                <p className="text-muted-foreground">
                  The requested checkpoint could not be found.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const showScore = settings?.show_score_mode !== "hidden";

  // Bucket teams by their progress relative to this checkpoint.
  const order = Number(checkpoint.order ?? 0) || 0;
  const lastOf = (team: ListingTeam) => Number(team.last_checkpoint_number ?? 0) || 0;
  const teams = checkpointTeams ?? [];

  const teamsToEvaluate = teams.filter(
    (team) => !teamEvaluationStatus?.[team.id] && lastOf(team) === order - 1,
  );
  const teamsAtPreviousCheckpoints = teams.filter(
    (team) => !teamEvaluationStatus?.[team.id] && lastOf(team) < order - 1,
  );
  const teamsAlreadyEvaluated = teams.filter((team) => lastOf(team) >= order);

  return (
    <div className="p-2 sm:p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
        {/* Team self-check-in QR (renders only when self check-in is enabled) */}
        <CheckinQrPanel />

        {/* Header */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-6 h-6" />
              {checkpoint.name} - Team Evaluation
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              All teams - click on a team to evaluate their activities
            </p>
          </CardHeader>
        </Card>

        {/* Team Activities View */}
        {selectedTeam && !showTeamList && (
          <div className="space-y-4">
            <Button onClick={backToTeams} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Teams
            </Button>

            {teamActivitiesLoading ? (
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p>Loading team activities...</p>
                  </div>
                </CardContent>
              </Card>
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

        {/* Teams List */}
        {showTeamList && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Teams Available for Evaluation
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Teams at your checkpoint ({checkpoint.name}) and previous checkpoints
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <TeamSection
                  title={`Teams to be evaluated at ${checkpoint.name}:`}
                  accent="green"
                  variant="current"
                  teams={teamsToEvaluate}
                  showScore={showScore}
                  onSelect={selectTeam}
                />
                <TeamSection
                  title="Teams at previous checkpoints:"
                  accent="yellow"
                  variant="previous"
                  teams={teamsAtPreviousCheckpoints}
                  showScore={showScore}
                  onSelect={selectTeam}
                />
                <TeamSection
                  title="Teams already evaluated:"
                  accent="gray"
                  variant="evaluated"
                  teams={teamsAlreadyEvaluated}
                  showScore={showScore}
                  onSelect={selectTeam}
                />

                {checkpointTeams?.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No teams available for evaluation</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Warning Dialog for Incomplete Evaluations */}
        {showWarningDialog && (
          <IncompleteEvaluationDialog summary={evaluationSummary} onClose={dismissWarning} />
        )}
      </div>
    </div>
  );
}

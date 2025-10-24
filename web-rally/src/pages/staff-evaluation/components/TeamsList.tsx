import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, ArrowRight } from "lucide-react";

interface Team {
  id: number;
  name: string;
  times?: any[];
}

interface TeamsListProps {
  checkpoint: any;
  teams: Team[];
  activities: any[];
  evaluations: any[];
  onTeamClick: (team: Team) => void;
  onBack: () => void;
}

export default function TeamsList({ 
  checkpoint, 
  teams, 
  activities, 
  evaluations, 
  onTeamClick, 
  onBack 
}: TeamsListProps) {
  // Show all teams (no filtering by checkpoint location)
  const teamsAtCheckpoint = teams || [];

  return (
    <Card className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)]">
      <CardHeader>
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="text-[rgb(255,255,255,0.6)] hover:text-white transition-colors"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
          </button>
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="w-5 h-5" />
            Teams at {checkpoint.name}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {teamsAtCheckpoint.map((team: any) => {
            const checkpointActivities = activities?.filter(
              (activity: any) => activity.checkpoint_id === checkpoint.id
            ) || [];
            const evaluatedCount = checkpointActivities.filter((activity: any) => {
              return evaluations?.find(
                (evaluation: any) => evaluation.team_id === team.id && evaluation.activity_id === activity.id
              );
            }).length;
            
            return (
              <div
                key={team.id}
                className="p-4 rounded-lg border border-[rgb(255,255,255,0.2)] bg-[rgb(255,255,255,0.05)] cursor-pointer hover:bg-[rgb(255,255,255,0.1)] active:bg-[rgb(255,255,255,0.15)] transition-colors touch-manipulation"
                onClick={() => onTeamClick(team)}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white text-lg sm:text-base truncate">{team.name}</h3>
                    <p className="text-sm text-[rgb(255,255,255,0.6)] mt-1">
                      {evaluatedCount}/{checkpointActivities.length} activities evaluated
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={evaluatedCount === checkpointActivities.length ? "default" : "secondary"}
                        className={
                          evaluatedCount === checkpointActivities.length 
                            ? "bg-green-500/20 text-green-400 text-xs sm:text-sm" 
                            : "bg-yellow-500/20 text-yellow-400 text-xs sm:text-sm"
                        }
                      >
                        {evaluatedCount === checkpointActivities.length ? "Complete" : "Pending"}
                      </Badge>
                      <Badge variant="outline" className="text-white border-white/20 text-xs sm:text-sm">
                        Team #{team.id}
                      </Badge>
                    </div>
                    <ArrowRight className="w-5 h-5 sm:w-4 sm:h-4 text-[rgb(255,255,255,0.6)] flex-shrink-0 self-end sm:self-center" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

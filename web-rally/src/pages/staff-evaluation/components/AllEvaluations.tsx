import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle, Clock, Star, Trophy, Filter, X } from "lucide-react";

interface Evaluation {
  id: number;
  team_id: number;
  activity_id: number;
  final_score: number;
  is_completed: boolean;
  completed_at: string;
  team: {
    id: number;
    name: string;
  };
  activity: {
    id: number;
    name: string;
    activity_type: string;
    checkpoint_id: number;
  };
}

interface AllEvaluationsProps {
  evaluations: Evaluation[];
}

const activityTypeIcons = {
  TimeBasedActivity: Clock,
  ScoreBasedActivity: Star,
  BooleanActivity: CheckCircle,
  TeamVsActivity: Trophy,
  GeneralActivity: Activity,
};

export default function AllEvaluations({ evaluations }: AllEvaluationsProps) {
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<string>("all");

  // Get unique teams and checkpoints for filter options
  const uniqueTeams = Array.from(new Set(evaluations.map(e => e.team.name))).sort();
  const uniqueCheckpoints = Array.from(new Set(evaluations.map(e => e.activity.checkpoint_id))).sort();

  // Filter evaluations based on selected filters
  const filteredEvaluations = evaluations.filter(evaluation => {
    const teamMatch = selectedTeam === "all" || evaluation.team.name === selectedTeam;
    const checkpointMatch = selectedCheckpoint === "all" || evaluation.activity.checkpoint_id.toString() === selectedCheckpoint;
    return teamMatch && checkpointMatch;
  });

  const hasActiveFilters = selectedTeam !== "all" || selectedCheckpoint !== "all";
  if (!evaluations || evaluations.length === 0) {
    return (
      <Card className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)]">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Activity className="w-5 h-5" />
            All Evaluations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[rgb(255,255,255,0.7)] text-center py-4">
            No evaluations found.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)]">
      <CardContent>
        {/* Filters */}
        <div className="mt-4 mb-4 p-3 bg-[rgb(255,255,255,0.05)] rounded-lg border border-[rgb(255,255,255,0.1)]">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-[rgb(255,255,255,0.6)]" />
            <span className="text-sm font-medium text-white">Filters</span>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setSelectedTeam("all");
                  setSelectedCheckpoint("all");
                }}
                className="ml-auto text-xs text-[rgb(255,255,255,0.6)] hover:text-white flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                Clear filters
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Team Filter */}
            <div>
              <label className="block text-xs text-[rgb(255,255,255,0.6)] mb-1">Team</label>
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="w-full p-2 bg-[rgb(255,255,255,0.1)] border border-[rgb(255,255,255,0.2)] rounded text-white text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500"
              >
                <option value="all" className="bg-gray-800">All Teams</option>
                {uniqueTeams.map(team => (
                  <option key={team} value={team} className="bg-gray-800">{team}</option>
                ))}
              </select>
            </div>
            
            {/* Checkpoint Filter */}
            <div>
              <label className="block text-xs text-[rgb(255,255,255,0.6)] mb-1">Checkpoint</label>
              <select
                value={selectedCheckpoint}
                onChange={(e) => setSelectedCheckpoint(e.target.value)}
                className="w-full p-2 bg-[rgb(255,255,255,0.1)] border border-[rgb(255,255,255,0.2)] rounded text-white text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500"
              >
                <option value="all" className="bg-gray-800">All Checkpoints</option>
                {uniqueCheckpoints.map(checkpoint => (
                  <option key={checkpoint} value={checkpoint.toString()} className="bg-gray-800">
                    Checkpoint {checkpoint}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          {hasActiveFilters && (
            <div className="mt-2 text-xs text-[rgb(255,255,255,0.6)]">
              Showing {filteredEvaluations.length} of {evaluations.length} evaluations
            </div>
          )}
        </div>

        <div className="space-y-3">
          {filteredEvaluations.map((evaluation) => {
            const IconComponent = activityTypeIcons[evaluation.activity.activity_type as keyof typeof activityTypeIcons] || Activity;
            
            return (
              <div
                key={evaluation.id}
                className="p-4 rounded-lg border border-[rgb(255,255,255,0.2)] bg-[rgb(255,255,255,0.05)]"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <IconComponent className="w-5 h-5 text-white flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <h4 className="font-semibold text-white text-base sm:text-sm truncate">{evaluation.activity.name}</h4>
                      <p className="text-sm text-[rgb(255,255,255,0.6)] mt-1">
                        Team: {evaluation.team.name} • Checkpoint {evaluation.activity.checkpoint_id}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <Badge 
                      variant="default"
                      className="bg-green-500/20 text-green-400 text-xs sm:text-sm w-fit"
                    >
                      Score: {evaluation.final_score}
                    </Badge>
                    <Badge variant="outline" className="text-white border-white/20 text-xs sm:text-sm w-fit">
                      {new Date(evaluation.completed_at).toLocaleDateString()}
                    </Badge>
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

export { AllEvaluations };

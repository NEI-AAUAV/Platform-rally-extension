import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle, Clock, Star, Trophy, Filter, X, ChevronDown, ChevronUp } from "lucide-react";

interface Evaluation {
  id: number;
  team_id: number;
  activity_id: number;
  final_score: number;
  is_completed: boolean;
  completed_at: string;
  result_data?: any;
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
  const [expandedEvaluations, setExpandedEvaluations] = useState<Set<number>>(new Set());
  
  const toggleExpand = (evaluationId: number) => {
    setExpandedEvaluations(prev => {
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
        <div className="mt-4 mb-4 p-2">
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
            const isExpanded = expandedEvaluations.has(evaluation.id);
            const hasDetails = evaluation.result_data || evaluation.extra_shots || evaluation.penalties;
            
            return (
              <div
                key={evaluation.id}
                className="p-4 rounded-lg border border-[rgb(255,255,255,0.2)] bg-[rgb(255,255,255,0.05)] hover:bg-[rgb(255,255,255,0.08)] transition-colors"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1 cursor-pointer" onClick={() => hasDetails && toggleExpand(evaluation.id)}>
                      <div className="flex items-center gap-2">
                        <IconComponent className="w-5 h-5 text-white flex-shrink-0 mt-0.5" />
                        {hasDetails && (
                          isExpanded ? 
                            <ChevronUp className="w-4 h-4 text-[rgb(255,255,255,0.5)]" /> :
                            <ChevronDown className="w-4 h-4 text-[rgb(255,255,255,0.5)]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-semibold text-white text-base sm:text-sm truncate">{evaluation.activity.name}</h4>
                        <p className="text-sm text-[rgb(255,255,255,0.6)] mt-1">
                          Team: {evaluation.team.name} • Checkpoint {evaluation.activity.checkpoint_id}
                          {evaluation.activity.description && (
                            <span className="block text-xs mt-1">{evaluation.activity.description}</span>
                          )}
                        </p>
                        {evaluation.team.num_members && (
                          <p className="text-xs text-[rgb(255,255,255,0.5)] mt-1">
                            Team Size: {evaluation.team.num_members} members
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <Badge 
                        variant="default"
                        className="bg-green-500/20 text-green-400 text-xs sm:text-sm w-fit"
                      >
                        Score: {evaluation.final_score?.toFixed(1) || '0'}
                      </Badge>
                      <div className="flex flex-col gap-0.5">
                        <Badge variant="outline" className="text-[rgb(255,255,255,0.6)] border-white/10 text-[10px] w-fit">
                          {new Date(evaluation.completed_at).toLocaleDateString()}
                        </Badge>
                        <Badge variant="outline" className="text-[rgb(255,255,255,0.6)] border-white/10 text-[10px] w-fit">
                          {new Date(evaluation.completed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </Badge>
                      </div>
                      {evaluation.extra_shots && evaluation.extra_shots > 0 && (
                        <Badge className="bg-blue-500/20 text-blue-400 text-xs sm:text-sm w-fit">
                          +{evaluation.extra_shots} shots
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  {isExpanded && hasDetails && (
                    <div className="mt-3 pt-3 border-t border-[rgb(255,255,255,0.2)] space-y-2">
                      {evaluation.result_data && Object.keys(evaluation.result_data).length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-[rgb(255,255,255,0.8)] mb-1">Result Data:</p>
                          <pre className="text-xs bg-[rgb(255,255,255,0.05)] p-2 rounded text-[rgb(255,255,255,0.7)] overflow-x-auto">
                            {JSON.stringify(evaluation.result_data, null, 2)}
                          </pre>
                        </div>
                      )}
                      
                      {(evaluation.time_score || evaluation.points_score || evaluation.boolean_score !== undefined) && (
                        <div className="flex flex-wrap gap-2">
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
                          {evaluation.boolean_score !== undefined && (
                            <Badge variant="outline" className="text-xs">
                              {evaluation.boolean_score ? 'Completed' : 'Failed'}
                            </Badge>
                          )}
                        </div>
                      )}
                      
                      {evaluation.penalties && Object.keys(evaluation.penalties).length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-red-400 mb-1">Penalties:</p>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(evaluation.penalties).map(([key, value]) => (
                              <Badge key={key} variant="outline" className="text-xs border-red-500/30 text-red-400">
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
    </Card>
  );
}

export { AllEvaluations };

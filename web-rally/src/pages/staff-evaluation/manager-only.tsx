import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Activity, CheckCircle, ChevronDown } from "lucide-react";
import { useUserStore } from "@/stores/useUserStore";
import { AssignedCheckpoints } from "./components/AssignedCheckpoints";
import { AllEvaluations } from "./components/AllEvaluations";
import { useNavigate } from "react-router-dom";
import { CheckPointService, ActivitiesService, TeamService, StaffEvaluationService } from "@/client";

export default function ManagerEvaluationPage() {
  const userStore = useUserStore();
  const navigate = useNavigate();
  const [showAllEvaluations, setShowAllEvaluations] = useState(false);


  // Get all checkpoints
  const { data: allCheckpoints } = useQuery({
    queryKey: ["allCheckpoints"],
    queryFn: async () => {
      return await CheckPointService.getCheckpointsApiRallyV1CheckpointGet();
    },
    enabled: !!userStore.token,
  });

  // Get all activities
  const { data: allActivities } = useQuery({
    queryKey: ["allActivities"],
    queryFn: async () => {
      return await ActivitiesService.getActivitiesApiRallyV1ActivitiesGet();
    },
    enabled: !!userStore.token,
  });

  // Get all teams
  const { data: allTeams } = useQuery({
    queryKey: ["allTeams"],
    queryFn: async () => {
      return await TeamService.getTeamsApiRallyV1TeamGet();
    },
    enabled: !!userStore.token,
  });

  // Get all evaluations using the dedicated endpoint that includes relationships
  const { data: allEvaluations, isLoading: evaluationsLoading } = useQuery({
    queryKey: ["allEvaluations"],
    queryFn: async () => {
      const response = await StaffEvaluationService.getAllEvaluationsApiRallyV1StaffAllEvaluationsGet();
      
      if (!response || !response.evaluations) return [];
      
      // Transform the results to match the AllEvaluations component interface
      const evaluations = response.evaluations.map((result: any) => ({
        id: result.id,
        team_id: result.team_id,
        activity_id: result.activity_id,
        final_score: result.final_score,
        is_completed: result.is_completed,
        completed_at: result.completed_at,
        result_data: result.result_data,
        extra_shots: result.extra_shots,
        penalties: result.penalties,
        time_score: result.time_score,
        points_score: result.points_score,
        boolean_score: result.boolean_score,
        team: {
          id: result.team?.id || result.team_id,
          name: result.team?.name || `Team ${result.team_id}`,
          num_members: result.team?.members?.length,
        },
        activity: {
          id: result.activity?.id || result.activity_id,
          name: result.activity?.name || `Activity ${result.activity_id}`,
          activity_type: result.activity?.activity_type || "GeneralActivity",
          checkpoint_id: result.activity?.checkpoint_id || 1,
          description: result.activity?.description,
        },
      }));
      
      return evaluations;
    },
    enabled: !!userStore.token,
  });

  const handleCheckpointClick = (checkpoint: any) => {
    navigate(`/staff-evaluation/checkpoint/${checkpoint.id}`);
  };

  return (
    <div className="p-2 sm:p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <Card className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)]">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="w-6 h-6" />
              Manager Evaluation Dashboard
            </CardTitle>
            <p className="text-sm text-[rgb(255,255,255,0.6)]">
              System-wide evaluation overview and management
            </p>
          </CardHeader>
        </Card>

        {/* All Evaluations Section */}
        <div className="relative">
          <button
            onClick={() => setShowAllEvaluations(!showAllEvaluations)}
            className="w-full p-3 sm:p-4 bg-[rgb(255,255,255,0.1)] border border-[rgb(255,255,255,0.2)] rounded-lg text-white flex items-center justify-between hover:bg-[rgb(255,255,255,0.15)] transition-colors"
          >
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              <span className="font-semibold">All Evaluations</span>
              <Badge variant="outline" className="text-white border-white/20">
                {evaluationsLoading ? "Loading..." : allEvaluations?.length || 0}
              </Badge>
            </div>
            <ChevronDown 
              className={`w-5 h-5 transition-transform ${showAllEvaluations ? 'rotate-180' : ''}`} 
            />
          </button>
          
          {showAllEvaluations && (
            <div className="mt-2">
              {evaluationsLoading ? (
                <Card className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)]">
                  <CardContent className="p-4 sm:p-6">
                    <p className="text-white/70 text-center">Loading evaluations...</p>
                  </CardContent>
                </Card>
              ) : (
                <AllEvaluations evaluations={allEvaluations || []} />
              )}
            </div>
          )}
        </div>

        {/* Assigned Checkpoints */}
        <AssignedCheckpoints
          checkpoints={allCheckpoints || []}
          activities={allActivities?.activities || []}
          teams={allTeams || []}
          onCheckpointClick={handleCheckpointClick}
        />

        {/* Teams Overview */}
        <Card className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)]">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Users className="w-5 h-5" />
              Teams Overview
            </CardTitle>
            <p className="text-sm text-[rgb(255,255,255,0.6)]">
              All teams in the rally
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {allTeams?.map((team: any) => (
                <div
                  key={team.id}
                  className="p-3 sm:p-4 rounded-lg border border-[rgb(255,255,255,0.2)] bg-[rgb(255,255,255,0.05)]"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-white">{team.name}</h4>
                    <Badge variant="outline" className="text-white border-white/20">
                      #{team.id}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-sm text-[rgb(255,255,255,0.7)]">
                    <p>Members: {team.num_members || 0}</p>
                    <p>Total Score: {team.total || 0}</p>
                    <p>Classification: {team.classification || 'N/A'}</p>
                    <p>Last Checkpoint: {team.last_checkpoint_number || 'None'}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
          <Card className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)]">
            <CardContent className="p-4 sm:p-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-white mb-2">
                  {allTeams?.length || 0}
                </div>
                <div className="text-sm text-[rgb(255,255,255,0.7)]">
                  Total Teams
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)]">
            <CardContent className="p-4 sm:p-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-white mb-2">
                  {allCheckpoints?.length || 0}
                </div>
                <div className="text-sm text-[rgb(255,255,255,0.7)]">
                  Checkpoints
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)]">
            <CardContent className="p-4 sm:p-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-white mb-2">
                  {allActivities?.activities?.length || 0}
                </div>
                <div className="text-sm text-[rgb(255,255,255,0.7)]">
                  Total Activities
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

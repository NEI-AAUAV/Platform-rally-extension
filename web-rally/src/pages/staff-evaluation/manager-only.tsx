import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Activity, CheckCircle, ChevronDown } from "lucide-react";
import { useUserStore } from "@/stores/useUserStore";
import { AssignedCheckpoints } from "./components/AssignedCheckpoints";
import { AllEvaluations, type Evaluation } from "./components/AllEvaluations";
import { useNavigate } from "react-router-dom";
import {
  CheckPointService,
  ActivitiesService,
  TeamService,
  StaffEvaluationService,
  type DetailedCheckPoint,
  type ActivityListResponse,
  type ListingTeam,
  type ActivityResultResponse,
  type ActivityResponse,
} from "@/client";
import { useThemedComponents } from "@/components/themes";

export default function ManagerEvaluationPage() {
  const userStore = useUserStore();
  const navigate = useNavigate();
  const [showAllEvaluations, setShowAllEvaluations] = useState(false);
  const { Card } = useThemedComponents();


  // Get all checkpoints
  const { data: allCheckpoints } = useQuery<DetailedCheckPoint[]>({
    queryKey: ["allCheckpoints"],
    queryFn: async () => {
      return CheckPointService.getCheckpointsApiRallyV1CheckpointGet();
    },
    enabled: !!userStore.token,
  });

  // Get all activities
  const { data: allActivities } = useQuery<ActivityListResponse>({
    queryKey: ["allActivities"],
    queryFn: async () => {
      return ActivitiesService.getActivitiesApiRallyV1ActivitiesGet();
    },
    enabled: !!userStore.token,
  });

  // Get all teams
  const { data: allTeams } = useQuery<ListingTeam[]>({
    queryKey: ["allTeams"],
    queryFn: async () => {
      return TeamService.getTeamsApiRallyV1TeamGet();
    },
    enabled: !!userStore.token,
  });

type EvaluationResponse = ActivityResultResponse & {
  team?: ListingTeam & { members?: Array<unknown> };
  activity?: ActivityResponse;
};

  // Get all evaluations using the dedicated endpoint that includes relationships
  const { data: allEvaluations, isLoading: evaluationsLoading } = useQuery<Evaluation[]>({
    queryKey: ["allEvaluations"],
    queryFn: async () => {
      const response = await StaffEvaluationService.getAllEvaluationsApiRallyV1StaffAllEvaluationsGet();
      
      if (!response || !response.evaluations) return [];
      
      // Transform the results to match the AllEvaluations component interface
      const evaluations = (response.evaluations as EvaluationResponse[]).map((result) => ({
        id: result.id,
        team_id: result.team_id,
        activity_id: result.activity_id,
        final_score: result.final_score ?? 0,
        is_completed: Boolean(result.is_completed),
        completed_at: result.completed_at ?? "",
        result_data: result.result_data ?? {},
        extra_shots: result.extra_shots ?? 0,
        penalties: result.penalties ?? {},
        time_score: result.time_score ?? undefined,
        points_score: result.points_score ?? undefined,
        boolean_score: result.boolean_score ?? undefined,
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

  const handleCheckpointClick = (checkpoint: DetailedCheckPoint) => {
    navigate(`/staff-evaluation/checkpoint/${checkpoint.id}`);
  };

  return (
    <div className="p-2 sm:p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <Card variant="default" padding="none">
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
          <Card
            variant="default"
            padding="sm"
            rounded="lg"
            hover
            onClick={() => setShowAllEvaluations(!showAllEvaluations)}
            className="cursor-pointer"
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
          </Card>
          
          {showAllEvaluations && (
            <div className="mt-2">
              {evaluationsLoading ? (
                <Card variant="default" padding="md">
                  <p className="text-white/70 text-center">Loading evaluations...</p>
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
        <Card variant="default" padding="none">
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
              {allTeams?.map((team) => (
                <Card
                  key={team.id}
                  variant="nested"
                  padding="sm"
                  rounded="lg"
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
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
          <Card variant="default" padding="md">
            <div className="text-center">
              <div className="text-2xl font-bold text-white mb-2">
                {allTeams?.length || 0}
              </div>
              <div className="text-sm text-[rgb(255,255,255,0.7)]">
                Total Teams
              </div>
            </div>
          </Card>

          <Card variant="default" padding="md">
            <div className="text-center">
              <div className="text-2xl font-bold text-white mb-2">
                {allCheckpoints?.length || 0}
              </div>
              <div className="text-sm text-[rgb(255,255,255,0.7)]">
                Checkpoints
              </div>
            </div>
          </Card>

          <Card variant="default" padding="md">
            <div className="text-center">
              <div className="text-2xl font-bold text-white mb-2">
                {allActivities?.activities?.length || 0}
              </div>
              <div className="text-sm text-[rgb(255,255,255,0.7)]">
                Total Activities
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

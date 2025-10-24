import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  Activity as ActivityIcon, 
  AlertCircle,
  ChevronDown,
  CheckCircle
} from "lucide-react";
import useUser from "@/hooks/useUser";
import { 
  AllEvaluations, 
  AssignedCheckpoints, 
  TeamsList, 
  TeamActivities, 
  EvaluationFormModal 
} from "./components";

interface Team {
  id: number;
  name: string;
  members: any[];
  checkpoint_id: number;
}

interface Activity {
  id: number;
  name: string;
  description?: string;
  activity_type: string;
  checkpoint_id: number;
  config: Record<string, any>;
  is_active: boolean;
  order: number;
  evaluation_status: "pending" | "completed";
  existing_result?: any;
}

export default function StaffEvaluation() {
  const { userStoreStuff, isRallyAdmin } = useUser();
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [showEvaluationForm, setShowEvaluationForm] = useState(false);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<any>(null);
  const [showTeamList, setShowTeamList] = useState(false);
  const [showEvaluationsDropdown, setShowEvaluationsDropdown] = useState(false);
  const [checkpointNotification, setCheckpointNotification] = useState<{teamId: number, checkpointId: number, message: string} | null>(null);
  const queryClient = useQueryClient();

  // Get staff member's assigned checkpoint
  const { data: myCheckpoint, isLoading: checkpointLoading } = useQuery({
    queryKey: ["myCheckpoint"],
    queryFn: async () => {
      const response = await fetch("/api/rally/v1/staff/my-checkpoint", {
        headers: {
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch checkpoint");
      return response.json();
    },
    enabled: !isRallyAdmin && !!userStoreStuff.token,
  });

  // Get teams at staff member's checkpoint
  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const response = await fetch("/api/rally/v1/staff/teams", {
        headers: {
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch teams");
      return response.json();
    },
    enabled: !isRallyAdmin && !!userStoreStuff.token,
  });

  // Get team activities for evaluation
  const { data: teamActivities } = useQuery({
    queryKey: ["teamActivities", selectedTeam?.id],
    queryFn: async () => {
      if (!selectedTeam) return [];
      const response = await fetch(`/api/rally/v1/staff/teams/${selectedTeam.id}/activities`, {
        headers: {
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch activities");
      return response.json();
    },
    enabled: !isRallyAdmin && !!userStoreStuff.token && !!selectedTeam,
  });

  // Manager queries
  const { data: allEvaluations } = useQuery({
    queryKey: ["allEvaluations"],
    queryFn: async () => {
      const response = await fetch("/api/rally/v1/staff/all-evaluations", {
        headers: {
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch evaluations");
      return response.json();
    },
    enabled: isRallyAdmin && !!userStoreStuff.token,
  });

  const { data: allCheckpoints } = useQuery({
    queryKey: ["allCheckpoints"],
    queryFn: async () => {
      const response = await fetch("/api/rally/v1/checkpoint/", {
        headers: {
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch checkpoints");
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: isRallyAdmin && !!userStoreStuff.token,
  });

  const { data: allTeams } = useQuery({
    queryKey: ["allTeams"],
    queryFn: async () => {
      const response = await fetch("/api/rally/v1/team/", {
        headers: {
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch teams");
      return response.json();
    },
    enabled: isRallyAdmin && !!userStoreStuff.token,
  });

  const { data: allActivities } = useQuery({
    queryKey: ["allActivities"],
    queryFn: async () => {
      const response = await fetch("/api/rally/v1/activities/", {
        headers: {
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch activities");
      return response.json();
    },
    enabled: isRallyAdmin && !!userStoreStuff.token,
  });

  // Staff evaluation mutations
  const { mutate: createResult, isPending: isCreating } = useMutation({
    mutationFn: async ({ teamId, activityId, resultData }: { teamId: number; activityId: number; resultData: any }) => {
      const url = `/api/rally/v1/staff/teams/${teamId}/activities/${activityId}/evaluate`;
      console.log("Staff createResult calling URL:", url, "with data:", resultData);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
        body: JSON.stringify(resultData),
      });
      if (!response.ok) throw new Error("Failed to create evaluation");
      return response.json();
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["teamActivities"] });
      
      // Check if team completed checkpoint and handle advancement
      if (selectedTeam && selectedActivity) {
        await checkCheckpointCompletion(selectedTeam.id, selectedActivity.checkpoint_id);
      }
      
      setShowEvaluationForm(false);
      setSelectedActivity(null);
    },
  });

  const { mutate: updateResult, isPending: isUpdating } = useMutation({
    mutationFn: async ({ teamId, activityId, resultId, resultData }: { teamId: number; activityId: number; resultId: number; resultData: any }) => {
      const response = await fetch(`/api/rally/v1/staff/teams/${teamId}/activities/${activityId}/evaluate/${resultId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
        body: JSON.stringify(resultData),
      });
      if (!response.ok) throw new Error("Failed to update evaluation");
      return response.json();
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["teamActivities"] });
      
      // Check if team completed checkpoint and handle advancement
      if (selectedTeam && selectedActivity) {
        await checkCheckpointCompletion(selectedTeam.id, selectedActivity.checkpoint_id);
      }
      
      setShowEvaluationForm(false);
      setSelectedActivity(null);
    },
  });

  // Manager evaluation mutations
  const { mutate: createManagerResult, isPending: isCreatingManager } = useMutation({
    mutationFn: async ({ teamId, activityId, resultData }: { teamId: number; activityId: number; resultData: any }) => {
      const url = `/api/rally/v1/staff/teams/${teamId}/activities/${activityId}/evaluate`;
      console.log("Manager createManagerResult calling URL:", url, "with data:", resultData);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
        body: JSON.stringify(resultData),
      });
      if (!response.ok) {
        const errorData = await response.json() as { detail?: string };
        throw new Error(errorData.detail || "Failed to create evaluation");
      }
      return response.json();
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["allEvaluations"] });
      queryClient.invalidateQueries({ queryKey: ["teamActivities"] });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      // Force refetch of allEvaluations to ensure immediate update
      queryClient.refetchQueries({ queryKey: ["allEvaluations"] });
      
      // Check if team completed checkpoint and handle advancement
      if (selectedTeam && selectedActivity) {
        await checkCheckpointCompletion(selectedTeam.id, selectedActivity.checkpoint_id);
      }
      
      setShowEvaluationForm(false);
      setSelectedActivity(null);
    },
  });

  const { mutate: updateManagerResult, isPending: isUpdatingManager } = useMutation({
    mutationFn: async ({ teamId, activityId, resultId, resultData }: { teamId: number; activityId: number; resultId: number; resultData: any }) => {
      const response = await fetch(`/api/rally/v1/staff/teams/${teamId}/activities/${activityId}/evaluate/${resultId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
        body: JSON.stringify(resultData),
      });
      if (!response.ok) throw new Error("Failed to update evaluation");
      return response.json();
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["allEvaluations"] });
      queryClient.invalidateQueries({ queryKey: ["teamActivities"] });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      // Force refetch of allEvaluations to ensure immediate update
      queryClient.refetchQueries({ queryKey: ["allEvaluations"] });
      
      // Check if team completed checkpoint and handle advancement
      if (selectedTeam && selectedActivity) {
        await checkCheckpointCompletion(selectedTeam.id, selectedActivity.checkpoint_id);
      }
      
      setShowEvaluationForm(false);
      setSelectedActivity(null);
    },
  });

  const handleEvaluateActivity = (activity: Activity) => {
    // Check if team has completed all activities at current checkpoint
    const currentCheckpointActivities = allActivities?.activities?.filter(
      (a: any) => a.checkpoint_id === activity.checkpoint_id
    ) || [];
    
    const teamEvaluations = allEvaluations?.evaluations?.filter(
      (e: any) => e.team_id === selectedTeam?.id && 
      currentCheckpointActivities.some((a: any) => a.id === e.activity_id)
    ) || [];
    
    const completedActivities = teamEvaluations.length;
    const totalActivities = currentCheckpointActivities.length;
    
    // If team hasn't completed all activities, show confirmation
    if (completedActivities < totalActivities) {
      const confirmMessage = `Team ${selectedTeam?.name} has only completed ${completedActivities} out of ${totalActivities} activities at this checkpoint. Do you want to proceed with the evaluation anyway?`;
      
      if (window.confirm(confirmMessage)) {
        setSelectedActivity(activity);
        setShowEvaluationForm(true);
      }
    } else {
      setSelectedActivity(activity);
      setShowEvaluationForm(true);
    }
  };

  const handleManagerEvaluateActivity = (team: any, activity: any) => {
    // Check if team has completed all activities at current checkpoint
    const currentCheckpointActivities = allActivities?.activities?.filter(
      (a: any) => a.checkpoint_id === activity.checkpoint_id
    ) || [];
    
    const teamEvaluations = allEvaluations?.evaluations?.filter(
      (e: any) => e.team_id === team.id && 
      currentCheckpointActivities.some((a: any) => a.id === e.activity_id)
    ) || [];
    
    const completedActivities = teamEvaluations.length;
    const totalActivities = currentCheckpointActivities.length;
    
    // If team hasn't completed all activities, show confirmation
    if (completedActivities < totalActivities) {
      const confirmMessage = `Team ${team.name} has only completed ${completedActivities} out of ${totalActivities} activities at this checkpoint. Do you want to proceed with the evaluation anyway?`;
      
      if (window.confirm(confirmMessage)) {
        setSelectedTeam(team);
        setSelectedActivity({
          ...activity,
          existing_result: allEvaluations?.evaluations?.find(
            (evaluation: any) => evaluation.team_id === team.id && evaluation.activity_id === activity.id
          )
        });
        setShowEvaluationForm(true);
      }
    } else {
      setSelectedTeam(team);
      setSelectedActivity({
        ...activity,
        existing_result: allEvaluations?.evaluations?.find(
          (evaluation: any) => evaluation.team_id === team.id && evaluation.activity_id === activity.id
        )
      });
      setShowEvaluationForm(true);
    }
  };

  const handleCheckpointClick = (checkpoint: any) => {
    setSelectedCheckpoint(checkpoint);
    setShowTeamList(true);
  };

  const handleTeamClick = (team: any) => {
    setSelectedTeam(team);
    setShowTeamList(false);
  };

  const handleBackToCheckpoints = () => {
    setSelectedCheckpoint(null);
    setShowTeamList(false);
    setSelectedTeam(null);
  };

  const handleBackToTeams = () => {
    setSelectedTeam(null);
  };

  // Function to check if team completed all activities at current checkpoint
  const checkCheckpointCompletion = async (teamId: number, checkpointId: number) => {
    try {
      // Get all activities at the current checkpoint
      const activitiesResponse = await fetch(`/api/rally/v1/activities/`, {
        headers: {
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
      });
      const activitiesData = await activitiesResponse.json() as { activities?: any[] };
      const checkpointActivities = activitiesData.activities?.filter((a: any) => a.checkpoint_id === checkpointId) || [];
      
      // Get all evaluations for this team
      const evaluationsResponse = await fetch(`/api/rally/v1/staff/all-evaluations`, {
        headers: {
          Authorization: `Bearer ${userStoreStuff.token}`,
        },
      });
      const evaluationsData = await evaluationsResponse.json() as { evaluations?: any[] };
      const teamEvaluations = evaluationsData.evaluations?.filter((e: any) => e.team_id === teamId) || [];
      
      // Check if team completed all activities at this checkpoint
      const completedActivityIds = teamEvaluations.map((e: any) => e.activity_id);
      const checkpointActivityIds = checkpointActivities.map((a: any) => a.id);
      const completedCheckpointActivities = checkpointActivityIds.filter((id: number) => completedActivityIds.includes(id));
      
      const isCheckpointComplete = completedCheckpointActivities.length === checkpointActivityIds.length;
      
      if (isCheckpointComplete && checkpointActivityIds.length > 0) {
        // Show notification that team completed checkpoint
        const message = `🎉 Team ${teamId} completed all ${checkpointActivityIds.length} activities at Checkpoint ${checkpointId}! They have been automatically advanced to the next checkpoint.`;
        console.log(message);
        
        // Set notification state
        setCheckpointNotification({
          teamId,
          checkpointId,
          message
        });
        
        // Auto-hide notification after 5 seconds
        setTimeout(() => {
          setCheckpointNotification(null);
        }, 5000);
        
        // Force refresh of all relevant data to show team advancement
        queryClient.invalidateQueries({ queryKey: ["allEvaluations"] });
        queryClient.invalidateQueries({ queryKey: ["teamActivities"] });
        queryClient.invalidateQueries({ queryKey: ["teams"] });
        queryClient.refetchQueries({ queryKey: ["allEvaluations"] });
        queryClient.refetchQueries({ queryKey: ["teams"] });
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error("Error checking checkpoint completion:", error);
      return false;
    }
  };

  const handleSubmitEvaluation = (resultData: any) => {
    console.log("handleSubmitEvaluation called with:", {
      resultData,
      selectedTeam: selectedTeam?.id,
      selectedActivity: selectedActivity?.id,
      isRallyAdmin,
      hasExistingResult: !!selectedActivity?.existing_result
    });
    
    if (isRallyAdmin) {
      // Manager evaluation
      if (selectedActivity?.existing_result) {
        console.log("Updating manager result with:", {
          teamId: selectedTeam!.id,
          activityId: selectedActivity!.id,
          resultId: selectedActivity.existing_result.id,
          resultData,
        });
        updateManagerResult({
          teamId: selectedTeam!.id,
          activityId: selectedActivity!.id,
          resultId: selectedActivity.existing_result.id,
          resultData,
        });
      } else {
        console.log("Creating manager result with:", {
          teamId: selectedTeam!.id,
          activityId: selectedActivity!.id,
          resultData,
        });
        createManagerResult({
          teamId: selectedTeam!.id,
          activityId: selectedActivity!.id,
          resultData,
        });
      }
    } else {
      // Staff evaluation
      if (selectedActivity?.existing_result) {
        console.log("Updating staff result with:", {
          teamId: selectedTeam!.id,
          activityId: selectedActivity!.id,
          resultId: selectedActivity.existing_result.id,
          resultData,
        });
        updateResult({
          teamId: selectedTeam!.id,
          activityId: selectedActivity!.id,
          resultId: selectedActivity.existing_result.id,
          resultData,
        });
      } else {
        console.log("Creating staff result with:", {
          teamId: selectedTeam!.id,
          activityId: selectedActivity!.id,
          resultData,
        });
        createResult({
          teamId: selectedTeam!.id,
          activityId: selectedActivity!.id,
          resultData,
        });
      }
    }
  };

  // Staff view
  if (!isRallyAdmin) {
    if (checkpointLoading || teamsLoading) {
      return (
        <div className="mt-16 space-y-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
            <p className="text-[rgb(255,255,255,0.7)] mt-2">Loading...</p>
          </div>
        </div>
      );
    }

    if (!myCheckpoint) {
      return (
        <div className="mt-16 space-y-6">
          <Alert className="bg-red-500/20 border-red-500/50">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-red-200">
              No checkpoint assigned to this staff member. Please contact an administrator.
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    return (
      <div className="mt-16 space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-4">Staff Evaluation</h1>
          <p className="text-[rgb(255,255,255,0.7)]">
            Evaluate teams at your assigned checkpoint: <strong>{myCheckpoint.name}</strong>
          </p>
        </div>

        {/* Checkpoint Completion Notification */}
        {checkpointNotification && (
          <div className="fixed top-4 right-4 z-50 max-w-md">
            <Card className="bg-green-600 border-green-500 text-white">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-green-200 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-green-100 mb-1">Checkpoint Completed!</h3>
                    <p className="text-green-200 text-sm">{checkpointNotification.message}</p>
                  </div>
                  <button
                    onClick={() => setCheckpointNotification(null)}
                    className="text-green-200 hover:text-white transition-colors"
                  >
                    ×
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Teams List */}
        <Card className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)]">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Users className="w-5 h-5" />
              Teams at {myCheckpoint.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {teams && teams.length > 0 ? (
              <div className="space-y-3">
                {teams.map((team: any) => (
                  <div
                    key={team.id}
                    className="p-4 rounded-lg border border-[rgb(255,255,255,0.2)] bg-[rgb(255,255,255,0.05)] cursor-pointer hover:bg-[rgb(255,255,255,0.1)] transition-colors"
                    onClick={() => setSelectedTeam(team)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-white">{team.name}</h3>
                        <p className="text-sm text-[rgb(255,255,255,0.6)]">
                          {team.num_members || 0} members
                        </p>
                      </div>
                      <Badge variant="outline" className="text-white border-white/20">
                        Team #{team.id}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[rgb(255,255,255,0.7)] text-center py-4">
                No teams found at this checkpoint.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Team Activities */}
        {selectedTeam && teamActivities && (
          <Card className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)]">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <ActivityIcon className="w-5 h-5" />
                {selectedTeam.name} - Activities
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {teamActivities.map((activity: any) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-[rgb(255,255,255,0.2)] bg-[rgb(255,255,255,0.05)]"
                  >
                    <div className="flex items-center gap-3">
                      <ActivityIcon className="w-5 h-5 text-white" />
                      <div>
                        <h4 className="font-semibold text-white">{activity.name}</h4>
                        <p className="text-sm text-[rgb(255,255,255,0.6)]">
                          {activity.description || "No description"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge 
                        variant={activity.evaluation_status === "completed" ? "default" : "secondary"}
                        className={
                          activity.evaluation_status === "completed" 
                            ? "bg-green-500/20 text-green-400" 
                            : "bg-yellow-500/20 text-yellow-400"
                        }
                      >
                        {activity.evaluation_status === "completed" ? "Completed" : "Pending"}
                      </Badge>
                      <button
                        onClick={() => handleEvaluateActivity(activity)}
                        disabled={isCreating || isUpdating}
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        {activity.evaluation_status === "completed" ? "Update" : "Evaluate"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Evaluation Form Modal */}
        <EvaluationFormModal
          isOpen={showEvaluationForm}
          activity={selectedActivity}
          team={selectedTeam}
          onSubmit={handleSubmitEvaluation}
          onCancel={() => {
            setShowEvaluationForm(false);
            setSelectedActivity(null);
          }}
          isSubmitting={isCreating || isUpdating}
        />
      </div>
    );
  }

  // Manager view
  return (
    <div className="mt-16 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-4">Manager Evaluation</h1>
        <p className="text-[rgb(255,255,255,0.7)]">
          Overview of all evaluations across all checkpoints
        </p>
      </div>

      {/* Checkpoint Completion Notification */}
      {checkpointNotification && (
        <div className="fixed top-4 right-4 z-50 max-w-md">
          <Card className="bg-green-600 border-green-500 text-white">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-200 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-green-100 mb-1">Checkpoint Completed!</h3>
                  <p className="text-green-200 text-sm">{checkpointNotification.message}</p>
                </div>
                <button
                  onClick={() => setCheckpointNotification(null)}
                  className="text-green-200 hover:text-white transition-colors"
                >
                  ×
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* All Evaluations Dropdown */}
      <div className="relative">
        <button
          onClick={() => setShowEvaluationsDropdown(!showEvaluationsDropdown)}
          className="w-full p-4 bg-[rgb(255,255,255,0.1)] border border-[rgb(255,255,255,0.2)] rounded-lg text-white flex items-center justify-between hover:bg-[rgb(255,255,255,0.15)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <ActivityIcon className="w-5 h-5" />
            <span className="font-semibold">All Evaluations</span>
            <Badge variant="outline" className="text-white border-white/20">
              {allEvaluations?.evaluations?.length || 0}
            </Badge>
          </div>
          <ChevronDown 
            className={`w-5 h-5 transition-transform ${showEvaluationsDropdown ? 'rotate-180' : ''}`} 
          />
        </button>
        
        {showEvaluationsDropdown && (
          <div className="mt-2">
            <AllEvaluations evaluations={allEvaluations?.evaluations || []} />
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

      {/* Teams List View */}
      {showTeamList && selectedCheckpoint && (
        <TeamsList
          checkpoint={selectedCheckpoint}
          teams={allTeams || []}
          activities={allActivities?.activities || []}
          evaluations={allEvaluations?.evaluations || []}
          onTeamClick={handleTeamClick}
          onBack={handleBackToCheckpoints}
        />
      )}

      {/* Team Activities View */}
      {selectedTeam && !showTeamList && (
        <TeamActivities
          team={selectedTeam}
          checkpoint={selectedCheckpoint}
          activities={allActivities?.activities || []}
          evaluations={allEvaluations?.evaluations || []}
          onActivityClick={handleManagerEvaluateActivity}
          onBack={handleBackToTeams}
          isSubmitting={isCreatingManager || isUpdatingManager}
        />
      )}

      {/* Evaluation Form Modal */}
      <EvaluationFormModal
        isOpen={showEvaluationForm}
        activity={selectedActivity}
        team={selectedTeam}
        onSubmit={handleSubmitEvaluation}
        onCancel={() => {
          setShowEvaluationForm(false);
          setSelectedActivity(null);
          setSelectedTeam(null);
        }}
        isSubmitting={isCreatingManager || isUpdatingManager}
      />
    </div>
  );
}
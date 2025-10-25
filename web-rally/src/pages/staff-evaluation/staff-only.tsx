import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { useUserStore } from "@/stores/useUserStore";
import UnifiedTeamEvaluation from "./components/UnifiedTeamEvaluation";

export default function StaffEvaluationPage() {
  const userStore = useUserStore();

  // Get staff's assigned checkpoint
  const { data: myCheckpoint } = useQuery({
    queryKey: ["myCheckpoint"],
    queryFn: async () => {
      const response = await fetch("/api/rally/v1/staff/my-checkpoint", {
        headers: {
          Authorization: `Bearer ${userStore.token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch checkpoint");
      return response.json();
    },
    enabled: !!userStore.token,
  });

  // Get all teams for staff evaluation (teams at current and previous checkpoints)
  const { data: allTeamsForStaff } = useQuery({
    queryKey: ["allTeamsForStaff"],
    queryFn: async () => {
      const response = await fetch("/api/rally/v1/staff/teams", {
        headers: {
          Authorization: `Bearer ${userStore.token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch teams");
      return response.json();
    },
    enabled: !!userStore.token && !!myCheckpoint,
  });

  // Get team activities for evaluation
  const { data: teamActivities, isLoading: teamActivitiesLoading } = useQuery({
    queryKey: ["teamActivities", selectedTeam?.id],
    queryFn: async () => {
      if (!selectedTeam) return [];
      
      // Try staff endpoint first, then fallback to general endpoint
      try {
        const response = await fetch(`/api/rally/v1/staff/teams/${selectedTeam.id}/activities`, {
          headers: {
            Authorization: `Bearer ${userStore.token}`,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          return Array.isArray(data.activities) ? data.activities : [];
        }
      } catch (error) {
        // Staff endpoint failed, trying general endpoint
      }
      
      // Fallback to general activities endpoint
      const response = await fetch(`/api/rally/v1/activities`, {
        headers: {
          Authorization: `Bearer ${userStore.token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch activities: ${response.status}`);
      }
      
      const data = await response.json();
      return Array.isArray(data.activities) ? data.activities : [];
    },
    enabled: !!selectedTeam && !!userStore.token,
  });

  // Evaluate activity mutation
  const evaluateActivityMutation = useMutation({
    mutationFn: async ({ teamId, activityId, resultData }: {
      teamId: number;
      activityId: number;
      resultData: any;
    }) => {
      const response = await fetch(`/api/rally/v1/staff/teams/${teamId}/activities/${activityId}/evaluate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userStore.token}`,
        },
        body: JSON.stringify(resultData),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }
      
      return response.json();
    },
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["teamActivities"] });
      queryClient.invalidateQueries({ queryKey: ["allTeamsForStaff"] });
    },
  });

  // Handle activity evaluation
  const handleEvaluateActivity = async (teamId: number, activityId: number, resultData: any) => {
    try {
      await evaluateActivityMutation.mutateAsync({
        teamId,
        activityId,
        resultData,
      });
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  if (!myCheckpoint) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-red-800 to-red-900 p-6">
        <div className="max-w-4xl mx-auto">
          <Card className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)]">
            <CardContent className="p-6">
              <div className="text-center text-white">
                <h2 className="text-xl font-semibold mb-2">No Checkpoint Assigned</h2>
                <p className="text-[rgb(255,255,255,0.7)]">
                  You haven't been assigned to a checkpoint yet. Please contact an administrator.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-900 via-red-800 to-red-900 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <Card className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)]">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="w-6 h-6" />
              Staff Evaluation - {myCheckpoint.name}
            </CardTitle>
            <p className="text-sm text-[rgb(255,255,255,0.6)]">
              Evaluate teams at your assigned checkpoint
            </p>
          </CardHeader>
        </Card>

        {/* Team Evaluation */}
        <UnifiedTeamEvaluation 
          teams={allTeamsForStaff || []}
          checkpointName={myCheckpoint.name}
          checkpointDescription={`Teams at your checkpoint (${myCheckpoint.name}) and previous checkpoints`}
          isManager={false}
        />
      </div>
    </div>
  );
}
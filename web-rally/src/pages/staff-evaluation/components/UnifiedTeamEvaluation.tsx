import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, ArrowLeft, Activity } from "lucide-react";
import { useUserStore } from "@/stores/useUserStore";
import { TeamActivitiesList } from "./TeamActivitiesList";

interface UnifiedTeamEvaluationProps {
  teams: any[];
  checkpointName?: string;
  checkpointDescription?: string;
  isManager?: boolean;
}

export default function UnifiedTeamEvaluation({ 
  teams, 
  checkpointName, 
  checkpointDescription,
  isManager = false 
}: UnifiedTeamEvaluationProps) {
  const userStore = useUserStore();
  const queryClient = useQueryClient();
  const [selectedTeam, setSelectedTeam] = useState<any>(null);
  const [showTeamList, setShowTeamList] = useState(true);

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
      queryClient.invalidateQueries({ queryKey: ["allEvaluations"] });
      queryClient.invalidateQueries({ queryKey: ["allTeams"] });
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

  return (
    <div className="space-y-6">
      {/* Team Activities View */}
      {selectedTeam && !showTeamList && (
        <div className="space-y-4">
          {/* Back Button */}
          <Button
            onClick={() => {
              setSelectedTeam(null);
              setShowTeamList(true);
            }}
            variant="outline"
            className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)] text-white hover:bg-[rgb(255,255,255,0.2)]"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Teams
          </Button>

          {/* Team Activities */}
          {teamActivitiesLoading ? (
            <Card className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)]">
              <CardContent className="p-6">
                <div className="text-center text-white">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
                  <p>Loading team activities...</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <TeamActivitiesList
              team={selectedTeam}
              activities={teamActivities || []}
              onEvaluate={handleEvaluateActivity}
              isEvaluating={evaluateActivityMutation.isPending}
            />
          )}
        </div>
      )}

      {/* Teams List */}
      {showTeamList && (
        <Card className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)]">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Users className="w-5 h-5" />
              Teams Available for Evaluation
              {checkpointName && (
                <Badge variant="outline" className="text-white border-white/20 ml-2">
                  {checkpointName}
                </Badge>
              )}
            </CardTitle>
            <p className="text-sm text-[rgb(255,255,255,0.6)]">
              {checkpointDescription || "Click on a team to evaluate their activities"}
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {teams?.map((team: any) => (
                <div
                  key={team.id}
                  className="p-4 rounded-lg border border-[rgb(255,255,255,0.2)] bg-[rgb(255,255,255,0.05)] cursor-pointer hover:bg-[rgb(255,255,255,0.1)] transition-colors active:bg-[rgb(255,255,255,0.15)]"
                  onClick={() => {
                    setSelectedTeam(team);
                    setShowTeamList(false);
                  }}
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
            
            {teams?.length === 0 && (
              <div className="text-center text-[rgb(255,255,255,0.7)] py-8">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No teams available for evaluation</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

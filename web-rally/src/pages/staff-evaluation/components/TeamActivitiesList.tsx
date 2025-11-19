import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, CheckCircle, Clock, Star, Trophy, Edit } from "lucide-react";
import ActivityForm from "@/components/forms/ActivityForm";
import type { ActivityResponse } from "@/client";
import type { Team, ActivityResultData } from "@/types/forms";

interface TeamActivitiesListProps {
  team: Team;
  activities: ActivityResponse[];
  onEvaluate: (teamId: number, activityId: number, resultData: ActivityResultData) => void;
  isEvaluating: boolean;
}

const activityTypeIcons = {
  TimeBasedActivity: Clock,
  ScoreBasedActivity: Star,
  BooleanActivity: CheckCircle,
  TeamVsActivity: Trophy,
  GeneralActivity: Activity,
};

const getActivityTypeIcon = (activityType: string) => {
  return activityTypeIcons[activityType as keyof typeof activityTypeIcons] || Activity;
};

export function TeamActivitiesList({ team, activities, onEvaluate, isEvaluating }: TeamActivitiesListProps) {
  const [selectedActivity, setSelectedActivity] = useState<ActivityResponse | null>(null);
  const [showEvaluationForm, setShowEvaluationForm] = useState(false);

  const handleEvaluateClick = (activity: ActivityResponse) => {
    setSelectedActivity(activity);
    setShowEvaluationForm(true);
  };

  const handleFormSubmit = (resultData: ActivityResultData) => {
    if (selectedActivity) {
      onEvaluate(team.id, selectedActivity.id, resultData);
    }
    setShowEvaluationForm(false);
    setSelectedActivity(null);
  };

  const handleFormCancel = () => {
    setShowEvaluationForm(false);
    setSelectedActivity(null);
  };

  if (showEvaluationForm && selectedActivity) {
    return (
      <div className="space-y-4">
        <Button
          onClick={handleFormCancel}
          variant="outline"
          className="mb-4"
        >
          ← Back to Activities
        </Button>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Evaluate: {selectedActivity.name}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Team: {team.name}
            </p>
          </CardHeader>
          <CardContent>
            <ActivityForm
              activity={selectedActivity}
              team={team}
              onSubmit={handleFormSubmit}
              isSubmitting={isEvaluating}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5" />
          {team.name} - Activities
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Click "Evaluate" or "Update" to evaluate each activity
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {activities.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No activities available for evaluation</p>
          </div>
        ) : (
          activities.map((activity) => {
            const IconComponent = getActivityTypeIcon(activity.activity_type);
            const isCompleted = activity.evaluation_status === "completed";
            
            return (
              <div
                key={activity.id}
                className="p-4 rounded-lg border flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <IconComponent className="w-5 h-5 text-gray-600" />
                  <div>
                    <h4 className="font-semibold">{activity.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      {activity.description}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      isCompleted
                        ? "text-green-600 border-green-600"
                        : "text-yellow-600 border-yellow-600"
                    }
                  >
                    {isCompleted ? "Completed" : "Pending"}
                  </Badge>
                  
                  <Button
                    onClick={() => handleEvaluateClick(activity)}
                    variant={isCompleted ? "outline" : "default"}
                    size="sm"
                    disabled={isEvaluating}
                  >
                    {isCompleted ? (
                      <>
                        <Edit className="w-4 h-4 mr-2" />
                        Update
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Evaluate
                      </>
                    )}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

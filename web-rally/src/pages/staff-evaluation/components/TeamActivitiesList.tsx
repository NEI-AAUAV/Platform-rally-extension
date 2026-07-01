import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Activity, CheckCircle, Clock, Star, Trophy, Edit, Camera } from "lucide-react";
import ActivityEvaluationForm from "@/components/forms/ActivityEvaluationForm";
import type { ActivityResponse } from "@/client";
import type { Team, ActivityResultData } from "@/types/forms";
import { cn } from "@/lib/utils";

type TeamActivitiesListProps = Readonly<{
  team: Team;
  activities: ActivityResponse[];
  onEvaluate: (teamId: number, activityId: number, resultData: ActivityResultData) => Promise<void>;
  isEvaluating: boolean;
}>;

const activityTypeIcons = {
  TimeBasedActivity: Clock,
  ScoreBasedActivity: Star,
  BooleanActivity: CheckCircle,
  TeamVsActivity: Trophy,
  GeneralActivity: Activity,
  DeferredJudgedActivity: Camera,
};

function getActivityTypeIcon(activityType: string) {
  return activityTypeIcons[activityType as keyof typeof activityTypeIcons] || Activity;
}

export function TeamActivitiesList({ team, activities, onEvaluate, isEvaluating }: TeamActivitiesListProps) {
  const [selectedActivity, setSelectedActivity] = useState<ActivityResponse | null>(null);
  const [showEvaluationForm, setShowEvaluationForm] = useState(false);

  const handleEvaluateClick = (activity: ActivityResponse) => {
    setSelectedActivity(activity);
    setShowEvaluationForm(true);
  };

  const handleFormSubmit = async (resultData: ActivityResultData) => {
    if (selectedActivity) {
      await onEvaluate(team.id, selectedActivity.id, resultData);
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
        <Button onClick={handleFormCancel} variant="outline" size="sm">
          ← Voltar às atividades
        </Button>

        <div className="rally-surface rally-elevate rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="rally-bg-accent-soft rally-accent grid h-9 w-9 shrink-0 place-items-center rounded-lg">
              <Activity className="h-4 w-4" />
            </span>
            <div>
              <p className="font-bold text-foreground">{selectedActivity.name}</p>
              <p className="text-xs text-muted-foreground">{team.name}</p>
            </div>
          </div>
          <ActivityEvaluationForm
            activity={{
              ...selectedActivity,
              evaluation_status: "pending" as const,
            }}
            team={team}
            onSubmit={handleFormSubmit}
            isSubmitting={isEvaluating}
            onCaptured={handleFormCancel}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-1">
        <span className="rally-bg-accent-soft rally-accent grid h-9 w-9 shrink-0 place-items-center rounded-lg">
          <Activity className="h-4 w-4" />
        </span>
        <div>
          <p className="font-bold text-foreground">{team.name}</p>
          <p className="text-xs text-muted-foreground">Atividades do posto</p>
        </div>
      </div>

      {activities.length === 0 ? (
        <div className="rally-surface rounded-xl p-8 text-center">
          <Activity className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Sem atividades para avaliar</p>
        </div>
      ) : (
        activities.map((activity) => {
          const IconComponent = getActivityTypeIcon(activity.activity_type);
          const isCompleted =
            "evaluation_status" in activity && activity.evaluation_status === "completed";

          return (
            <div
              key={activity.id}
              className={cn(
                "flex items-center gap-4 rounded-xl border p-4 transition-colors",
                isCompleted
                  ? "border-border bg-card opacity-80"
                  : "rally-border-accent rally-bg-accent-soft",
              )}
            >
              <span
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
                  isCompleted
                    ? "rally-bg-accent-soft rally-accent"
                    : "rally-bg-accent text-white",
                )}
              >
                <IconComponent className="h-4 w-4" />
              </span>

              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">{activity.name}</p>
                {activity.description && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {activity.description}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
                    isCompleted
                      ? "rally-bg-accent-soft rally-accent"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
                  )}
                >
                  {isCompleted ? "Avaliado" : "Pendente"}
                </span>

                <Button
                  onClick={() => handleEvaluateClick(activity)}
                  variant={isCompleted ? "outline" : "default"}
                  size="sm"
                  disabled={isEvaluating}
                  className={cn(!isCompleted && "rally-bg-accent text-white hover:opacity-90")}
                >
                  {isCompleted ? (
                    <>
                      <Edit className="mr-1.5 h-3.5 w-3.5" />
                      Atualizar
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                      Avaliar
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

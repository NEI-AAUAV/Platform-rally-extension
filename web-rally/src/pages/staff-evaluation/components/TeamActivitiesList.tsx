import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Activity, CheckCircle, Clock, Star, Trophy, Edit, Camera } from "lucide-react";
import ActivityEvaluationForm from "@/components/forms/ActivityEvaluationForm";
import type { Team, ActivityResultData } from "@/types/forms";
import type { TeamActivityWithStatus } from "./checkpointEvaluation.types";
import { cn } from "@/lib/utils";

type TeamActivitiesListProps = Readonly<{
  team: Team;
  activities: TeamActivityWithStatus[];
  /** Omitted when the caller may not record evaluations — the list becomes
   *  read-only rather than offering a button the server will refuse. */
  onEvaluate?: (
    teamId: number,
    activityId: number,
    resultData: ActivityResultData,
  ) => Promise<void>;
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

export function TeamActivitiesList({
  team,
  activities,
  onEvaluate,
  isEvaluating,
}: TeamActivitiesListProps) {
  const [selectedActivity, setSelectedActivity] = useState<TeamActivityWithStatus | null>(null);
  const [showEvaluationForm, setShowEvaluationForm] = useState(false);

  const handleEvaluateClick = (activity: TeamActivityWithStatus) => {
    setSelectedActivity(activity);
    setShowEvaluationForm(true);
  };

  const handleFormSubmit = async (resultData: ActivityResultData) => {
    if (selectedActivity && onEvaluate) {
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

        <div className="rally-surface p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-4">
            <span className="rally-bg-accent grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white">
              <Activity className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="rally-eyebrow">{team.name}</p>
              <p className="rally-display truncate text-3xl text-foreground">
                {selectedActivity.name}
              </p>
            </div>
          </div>
          <ActivityEvaluationForm
            activity={{
              ...selectedActivity,
              evaluation_status: selectedActivity.evaluation_status ?? "pending",
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
      <div className="mb-3 flex items-center gap-4">
        <span className="rally-bg-accent-soft rally-display grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-2xl text-foreground">
          {team.name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="rally-display truncate text-4xl text-foreground">{team.name}</p>
          <p className="text-sm text-muted-foreground">Atividades do posto</p>
        </div>
      </div>

      {activities.length === 0 ? (
        <div className="rally-surface p-10 text-center">
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
                "flex flex-wrap items-center gap-4 rounded-3xl border bg-card p-4 transition-colors sm:p-5",
                isCompleted
                  ? "border-border/70 dark:border-transparent"
                  : "rally-border-accent border-2",
              )}
            >
              <span
                className={cn(
                  "grid h-11 w-11 shrink-0 place-items-center rounded-2xl",
                  isCompleted
                    ? "rally-bg-accent-soft text-foreground"
                    : "rally-bg-accent text-white",
                )}
              >
                <IconComponent className="h-4 w-4" />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-foreground">{activity.name}</p>
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
                      ? "rally-bg-accent-soft text-foreground"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
                  )}
                >
                  {isCompleted ? "Avaliado" : "Pendente"}
                </span>

                {onEvaluate && (
                  <Button
                    onClick={() => handleEvaluateClick(activity)}
                    variant={isCompleted ? "outline" : "default"}
                    size="sm"
                    disabled={isEvaluating}
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
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

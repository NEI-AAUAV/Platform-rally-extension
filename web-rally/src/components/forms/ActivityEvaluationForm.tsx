import {
  TimeBasedForm,
  ScoreBasedForm,
  BooleanForm,
  GeneralForm,
  TeamVsForm,
  DeferredJudgedForm,
} from "./index";
import type { ActivityResponse, ActivityResultResponse } from "@/client";
import type { FormSubmitHandler, Team } from "@/types/forms";

interface ActivityWithStatus extends ActivityResponse {
  evaluation_status: "pending" | "completed";
  existing_result?: ActivityResultResponse | null;
}

/**
 * Props for ActivityEvaluationForm component
 */
interface ActivityEvaluationFormProps {
  /** Activity to evaluate with status information */
  readonly activity: ActivityWithStatus;
  /** Team being evaluated */
  readonly team: Team;
  /** Callback when form is submitted */
  readonly onSubmit: FormSubmitHandler;
  /** Whether the form is currently submitting */
  readonly isSubmitting: boolean;
  /** Called when a deferred-judged photo capture completes (no score yet, just upload) */
  readonly onCaptured?: () => void;
}

/**
 * Form component for evaluating team activities
 *
 * Renders the appropriate form based on activity type:
 * - TimeBasedActivity: Time input form
 * - ScoreBasedActivity: Score input form
 * - BooleanActivity: Yes/No form
 * - GeneralActivity: General evaluation form
 * - TeamVsActivity: Team vs team form
 *
 * Displays activity details and handles form submission with validation.
 *
 * @param props - ActivityEvaluationFormProps
 * @returns JSX form element
 *
 * @example
 * ```tsx
 * <ActivityEvaluationForm
 *   activity={activity}
 *   team={team}
 *   onSubmit={handleSubmit}
 *   isSubmitting={isLoading}
 * />
 * ```
 */
export default function ActivityEvaluationForm({
  activity,
  team,
  onSubmit,
  isSubmitting,
  onCaptured,
}: ActivityEvaluationFormProps) {
  const renderForm = () => {
    switch (activity.activity_type) {
      case "TimeBasedActivity":
        return (
          <TimeBasedForm
            existingResult={activity.existing_result ?? undefined}
            team={team}
            onSubmit={onSubmit}
            isSubmitting={isSubmitting}
          />
        );

      case "ScoreBasedActivity":
        return (
          <ScoreBasedForm
            existingResult={activity.existing_result ?? undefined}
            team={team}
            onSubmit={onSubmit}
            isSubmitting={isSubmitting}
          />
        );

      case "BooleanActivity":
        return (
          <BooleanForm
            existingResult={activity.existing_result ?? undefined}
            team={team}
            onSubmit={onSubmit}
            isSubmitting={isSubmitting}
          />
        );

      case "GeneralActivity":
        return (
          <GeneralForm
            existingResult={activity.existing_result ?? undefined}
            team={team}
            config={activity.config ?? {}}
            onSubmit={onSubmit}
            isSubmitting={isSubmitting}
          />
        );

      case "TeamVsActivity":
        return (
          <TeamVsForm
            existingResult={activity.existing_result ?? undefined}
            team={team}
            config={activity.config ?? {}}
            onSubmit={onSubmit}
            isSubmitting={isSubmitting}
          />
        );

      case "DeferredJudgedActivity":
        return (
          <DeferredJudgedForm
            activityId={activity.id}
            team={team}
            existingResult={activity.existing_result}
            onCaptured={onCaptured}
          />
        );

      default:
        return (
          <div className="py-8 text-center">
            <p className="text-muted-foreground">Unknown activity type: {activity.activity_type}</p>
            <p className="mt-2 text-sm text-muted-foreground">Please contact an administrator.</p>
          </div>
        );
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded border border-border bg-muted p-4">
        <h3 className="mb-2 font-semibold text-foreground">Activity Details</h3>
        <p className="text-muted-foreground">
          <strong>Type:</strong> {activity.activity_type}
        </p>
        <p className="text-muted-foreground">
          <strong>Team:</strong> {team.name}
        </p>
        {activity.description && (
          <p className="text-muted-foreground">
            <strong>Description:</strong> {activity.description}
          </p>
        )}
      </div>

      {renderForm()}
    </div>
  );
}

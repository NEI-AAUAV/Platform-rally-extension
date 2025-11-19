import { TimeBasedForm, ScoreBasedForm, BooleanForm, GeneralForm, TeamVsForm } from "./index";
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
  activity: ActivityWithStatus;
  /** Team being evaluated */
  team: Team;
  /** Callback when form is submitted */
  onSubmit: FormSubmitHandler;
  /** Whether the form is currently submitting */
  isSubmitting: boolean;
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
export default function ActivityEvaluationForm({ activity, team, onSubmit, isSubmitting }: ActivityEvaluationFormProps) {
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
            config={activity.config ?? undefined}
            onSubmit={onSubmit}
            isSubmitting={isSubmitting}
          />
        );
      
      case "TeamVsActivity":
        return (
          <TeamVsForm
            existingResult={activity.existing_result ?? undefined}
            team={team}
            onSubmit={onSubmit}
            isSubmitting={isSubmitting}
          />
        );
      
      default:
        return (
          <div className="text-center py-8">
            <p className="text-[rgb(255,255,255,0.7)]">
              Unknown activity type: {activity.activity_type}
            </p>
            <p className="text-[rgb(255,255,255,0.5)] text-sm mt-2">
              Please contact an administrator.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-[rgb(255,255,255,0.05)] border border-[rgb(255,255,255,0.1)] p-4 rounded">
        <h3 className="font-semibold mb-2 text-white">Activity Details</h3>
        <p className="text-[rgb(255,255,255,0.8)]"><strong>Type:</strong> {activity.activity_type}</p>
        <p className="text-[rgb(255,255,255,0.8)]"><strong>Team:</strong> {team.name}</p>
        {activity.description && (
          <p className="text-[rgb(255,255,255,0.8)]"><strong>Description:</strong> {activity.description}</p>
        )}
      </div>

      {renderForm()}
    </div>
  );
}

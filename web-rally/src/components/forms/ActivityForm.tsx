import { TimeBasedForm, ScoreBasedForm, BooleanForm, GeneralForm, TeamVsForm } from './index';

interface ActivityFormProps {
  activity: {
    id: number;
    name: string;
    description?: string;
    activity_type: string;
    config: Record<string, any>;
    is_active: boolean;
    order: number;
    evaluation_status: "pending" | "completed";
    existing_result?: any;
  };
  team: {
    id: number;
    name: string;
    members: any[];
    checkpoint_id: number;
  };
  onSubmit: (data: any) => void;
  isSubmitting: boolean;
}

export default function ActivityForm({ activity, team, onSubmit, isSubmitting }: ActivityFormProps) {
  const renderForm = () => {
    switch (activity.activity_type) {
      case "TimeBasedActivity":
        return (
          <TimeBasedForm
            existingResult={activity.existing_result}
            onSubmit={onSubmit}
            isSubmitting={isSubmitting}
          />
        );
      
      case "ScoreBasedActivity":
        return (
          <ScoreBasedForm
            existingResult={activity.existing_result}
            onSubmit={onSubmit}
            isSubmitting={isSubmitting}
          />
        );
      
      case "BooleanActivity":
        return (
          <BooleanForm
            existingResult={activity.existing_result}
            onSubmit={onSubmit}
            isSubmitting={isSubmitting}
          />
        );
      
      case "GeneralActivity":
        return (
          <GeneralForm
            existingResult={activity.existing_result}
            config={activity.config}
            onSubmit={onSubmit}
            isSubmitting={isSubmitting}
          />
        );
      
      case "TeamVsActivity":
        return (
          <TeamVsForm
            existingResult={activity.existing_result}
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

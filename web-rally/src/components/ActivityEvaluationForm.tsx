import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BloodyButton } from "@/components/themes/bloody";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { X, Clock, Star, CheckCircle, Trophy, Activity as ActivityIcon } from "lucide-react";

interface Activity {
  id: number;
  name: string;
  description?: string;
  activity_type: string;
  config: Record<string, any>;
  is_active: boolean;
  order: number;
  evaluation_status: "pending" | "completed";
  existing_result?: any;
}

interface Team {
  id: number;
  name: string;
  members: any[];
  checkpoint_id: number;
}

interface ActivityEvaluationFormProps {
  activity: Activity;
  team: Team;
  existingResult?: any;
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

// Schema for time-based activities
const timeBasedSchema = z.object({
  completion_time_seconds: z.number().min(0, "Time must be positive"),
  notes: z.string().optional(),
});

// Schema for score-based activities
const scoreBasedSchema = z.object({
  achieved_points: z.number().min(0, "Points must be positive"),
  notes: z.string().optional(),
});

// Schema for boolean activities
const booleanSchema = z.object({
  success: z.boolean(),
  notes: z.string().optional(),
});

// Schema for general activities
const generalSchema = z.object({
  assigned_points: z.number().min(0, "Points must be positive"),
  notes: z.string().optional(),
});

// Schema for team vs activities
const teamVsSchema = z.object({
  result: z.enum(["win", "lose", "draw"]),
  opponent_team_id: z.number().optional(),
  notes: z.string().optional(),
});

const activityTypeLabels = {
  TimeBasedActivity: "Baseada em Tempo",
  ScoreBasedActivity: "Baseada em Pontuação",
  BooleanActivity: "Sim/Não",
  TeamVsActivity: "Equipa vs Equipa",
  GeneralActivity: "Geral",
};

const activityTypeIcons = {
  TimeBasedActivity: Clock,
  ScoreBasedActivity: Star,
  BooleanActivity: CheckCircle,
  TeamVsActivity: Trophy,
  GeneralActivity: ActivityIcon,
};

export default function ActivityEvaluationForm({
  activity,
  team,
  existingResult,
  onSubmit,
  onCancel,
  isSubmitting,
}: ActivityEvaluationFormProps) {
  const [formData, setFormData] = useState<any>({});

  // Determine which schema to use based on activity type
  const getSchema = () => {
    switch (activity.activity_type) {
      case "TimeBasedActivity":
        return timeBasedSchema;
      case "ScoreBasedActivity":
        return scoreBasedSchema;
      case "BooleanActivity":
        return booleanSchema;
      case "GeneralActivity":
        return generalSchema;
      case "TeamVsActivity":
        return teamVsSchema;
      default:
        return generalSchema;
    }
  };

  const schema = getSchema();
  const IconComponent = activityTypeIcons[activity.activity_type as keyof typeof activityTypeIcons] || ActivityIcon;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: existingResult?.result_data || {},
  });

  const watchedValues = watch();

  useEffect(() => {
    setFormData(watchedValues);
  }, [watchedValues]);

  const handleFormSubmit = (data: any) => {
    const resultData = {
      activity_id: activity.id,
      team_id: team.id,
      result_data: data,
      extra_shots: 0,
      penalties: {},
    };
    onSubmit(resultData);
  };

  const renderFormFields = () => {
    switch (activity.activity_type) {
      case "TimeBasedActivity":
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="completion_time_seconds" className="text-white">
                Completion Time (seconds)
              </Label>
              <Input
                id="completion_time_seconds"
                type="number"
                step="0.1"
                min="0"
                {...register("completion_time_seconds", { valueAsNumber: true })}
                className="mt-1"
                placeholder="Enter completion time in seconds"
              />
              {errors.completion_time_seconds && (
                <p className="text-red-400 text-sm mt-1">
                  {errors.completion_time_seconds.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="notes" className="text-white">
                Notes (Optional)
              </Label>
              <Textarea
                id="notes"
                {...register("notes")}
                className="mt-1"
                placeholder="Add any additional notes..."
                rows={3}
              />
            </div>
          </div>
        );

      case "ScoreBasedActivity":
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="achieved_points" className="text-white">
                Achieved Points
              </Label>
              <Input
                id="achieved_points"
                type="number"
                min="0"
                {...register("achieved_points", { valueAsNumber: true })}
                className="mt-1"
                placeholder="Enter achieved points"
              />
              {errors.achieved_points && (
                <p className="text-red-400 text-sm mt-1">
                  {errors.achieved_points.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="notes" className="text-white">
                Notes (Optional)
              </Label>
              <Textarea
                id="notes"
                {...register("notes")}
                className="mt-1"
                placeholder="Add any additional notes..."
                rows={3}
              />
            </div>
          </div>
        );

      case "BooleanActivity":
        return (
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="success"
                checked={watchedValues.success || false}
                onCheckedChange={(checked) => setValue("success", checked)}
              />
              <Label htmlFor="success" className="text-white">
                Team succeeded in the activity
              </Label>
            </div>
            <div>
              <Label htmlFor="notes" className="text-white">
                Notes (Optional)
              </Label>
              <Textarea
                id="notes"
                {...register("notes")}
                className="mt-1"
                placeholder="Add any additional notes..."
                rows={3}
              />
            </div>
          </div>
        );

      case "GeneralActivity":
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="assigned_points" className="text-white">
                Assigned Points
              </Label>
              <Input
                id="assigned_points"
                type="number"
                min="0"
                max={activity.config.max_points || 100}
                {...register("assigned_points", { valueAsNumber: true })}
                className="mt-1"
                placeholder={`Enter points (0-${activity.config.max_points || 100})`}
              />
              {errors.assigned_points && (
                <p className="text-red-400 text-sm mt-1">
                  {errors.assigned_points.message}
                </p>
              )}
              <p className="text-[rgb(255,255,255,0.6)] text-sm mt-1">
                Range: {activity.config.min_points || 0} - {activity.config.max_points || 100} points
              </p>
            </div>
            <div>
              <Label htmlFor="notes" className="text-white">
                Notes (Optional)
              </Label>
              <Textarea
                id="notes"
                {...register("notes")}
                className="mt-1"
                placeholder="Add any additional notes..."
                rows={3}
              />
            </div>
          </div>
        );

      case "TeamVsActivity":
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="result" className="text-white">
                Match Result
              </Label>
              <select
                id="result"
                {...register("result")}
                className="mt-1 w-full p-2 rounded border border-[rgb(255,255,255,0.2)] bg-[rgb(255,255,255,0.1)] text-white"
              >
                <option value="win">Win</option>
                <option value="lose">Lose</option>
                <option value="draw">Draw</option>
              </select>
              {errors.result && (
                <p className="text-red-400 text-sm mt-1">
                  {errors.result.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="notes" className="text-white">
                Notes (Optional)
              </Label>
              <Textarea
                id="notes"
                {...register("notes")}
                className="mt-1"
                placeholder="Add any additional notes..."
                rows={3}
              />
            </div>
          </div>
        );

      default:
        return (
          <Alert className="bg-yellow-500/20 border-yellow-500/50">
            <AlertDescription className="text-yellow-200">
              Unknown activity type. Please contact an administrator.
            </AlertDescription>
          </Alert>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-2xl bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)] backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <IconComponent className="w-5 h-5" />
            Evaluate: {activity.name}
          </CardTitle>
          <button
            onClick={onCancel}
            className="text-[rgb(255,255,255,0.6)] hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="bg-[rgb(255,255,255,0.05)] p-4 rounded-lg">
              <h3 className="font-semibold text-white mb-2">Activity Details</h3>
              <p className="text-[rgb(255,255,255,0.7)] text-sm mb-2">
                <strong>Type:</strong> {activityTypeLabels[activity.activity_type as keyof typeof activityTypeLabels]}
              </p>
              <p className="text-[rgb(255,255,255,0.7)] text-sm mb-2">
                <strong>Team:</strong> {team.name}
              </p>
              {activity.description && (
                <p className="text-[rgb(255,255,255,0.7)] text-sm">
                  <strong>Description:</strong> {activity.description}
                </p>
              )}
            </div>

            <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
              {renderFormFields()}

              <div className="flex gap-3 pt-4">
                <BloodyButton
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  {isSubmitting ? "Saving..." : existingResult ? "Update Evaluation" : "Submit Evaluation"}
                </BloodyButton>
                <BloodyButton
                  type="button"
                  variant="neutral"
                  onClick={onCancel}
                  disabled={isSubmitting}
                >
                  Cancel
                </BloodyButton>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}








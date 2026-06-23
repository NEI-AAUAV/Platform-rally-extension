import type {
  ActivityResponse,
  ActivityResultResponse,
  ListingTeam,
} from "@/client";
import type { ActivityResultData } from "@/types/forms";

export type EvaluationSummary = {
  total_activities: number;
  completed_activities: number;
  pending_activities: number;
  completion_rate: number;
  has_incomplete: boolean;
  missing_activities: string[];
  checkpoint_mismatch?: boolean;
  team_checkpoint?: number | null;
  current_checkpoint?: number | null;
};

export type TeamActivityWithStatus = ActivityResponse & {
  evaluation_status?: "completed" | "pending";
  existing_result?: ActivityResultResponse | null;
};

export type TeamActivitiesResponse = {
  team?: ListingTeam;
  activities?: TeamActivityWithStatus[];
  evaluation_summary?: EvaluationSummary;
};

export type ActivityResultWithRelations = ActivityResultResponse & {
  activity?: ActivityResponse;
  team?: ListingTeam;
};

export type TeamEvaluationStatusMap = Record<number, boolean>;

export type EvaluatePayload = {
  teamId: number;
  activityId: number;
  resultData: ActivityResultData;
};

export const toEvaluationSummary = (
  summary?: Partial<EvaluationSummary> | null,
): EvaluationSummary => ({
  total_activities: summary?.total_activities ?? 0,
  completed_activities: summary?.completed_activities ?? 0,
  pending_activities: summary?.pending_activities ?? 0,
  completion_rate: summary?.completion_rate ?? 0,
  has_incomplete: summary?.has_incomplete ?? false,
  missing_activities: summary?.missing_activities ?? [],
  checkpoint_mismatch: summary?.checkpoint_mismatch,
  team_checkpoint: summary?.team_checkpoint ?? null,
  current_checkpoint: summary?.current_checkpoint ?? null,
});

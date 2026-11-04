import { ActivityType } from "@/types/activityTypes";

/** Portuguese label for each activity type, shared by every screen that names one. */
export const ACTIVITY_TYPE_LABELS: Readonly<Record<ActivityType, string>> = {
  [ActivityType.TIME_BASED]: "Baseada em Tempo",
  [ActivityType.SCORE_BASED]: "Baseada em Pontuação",
  [ActivityType.BOOLEAN]: "Sim/Não",
  [ActivityType.TEAM_VS]: "Equipa vs Equipa",
  [ActivityType.GENERAL]: "Geral",
  [ActivityType.DEFERRED_JUDGED]: "Avaliação Posterior (Fotos)",
};

/** Label for an activity type, falling back to the raw value for unknown types. */
export function activityTypeLabel(type: string): string {
  return ACTIVITY_TYPE_LABELS[type as ActivityType] ?? type;
}

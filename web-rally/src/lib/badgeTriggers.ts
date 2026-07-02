/** Frontend mirror of api-rally app/badges/triggers.py BadgeTrigger. */
export type BadgeTrigger =
  | "win_activity"
  | "first_complete_activity"
  | "first_complete_checkpoint";

export interface TriggerMeta {
  value: BadgeTrigger;
  label: string;
  help: string;
  /** Which optional criteria param this trigger accepts. */
  param: "activity" | "checkpoint";
}

/** Ordered list for the trigger picker + its param form. */
export const TRIGGERS: TriggerMeta[] = [
  {
    value: "win_activity",
    label: "Vencer atividade",
    help: "Atribuído à equipa que vence um confronto (por defeito TeamVs).",
    param: "activity",
  },
  {
    value: "first_complete_activity",
    label: "Primeiro a completar atividade",
    help: "Primeira equipa a concluir a atividade. Único vencedor.",
    param: "activity",
  },
  {
    value: "first_complete_checkpoint",
    label: "Primeiro a completar posto",
    help: "Primeira equipa a concluir todas as atividades de um posto. Único vencedor.",
    param: "checkpoint",
  },
];

export function triggerMeta(value: string | null | undefined): TriggerMeta | undefined {
  return TRIGGERS.find((t) => t.value === value);
}

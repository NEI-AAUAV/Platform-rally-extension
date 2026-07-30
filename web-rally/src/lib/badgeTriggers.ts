/** Frontend mirror of api-rally app/badges/triggers.py BadgeTrigger. */
export type BadgeTrigger =
  | "win_activity"
  | "first_complete_activity"
  | "first_complete_checkpoint"
  | "complete_n_activities"
  | "complete_all_checkpoints"
  | "score_threshold"
  | "fast_complete";

/** A numeric criteria field a trigger accepts (e.g. count, min_score). */
export interface NumberParam {
  /** Criteria key written into the badge's criteria JSON. */
  key: "count" | "min_score" | "max_seconds";
  label: string;
  placeholder: string;
  min: number;
}

export interface TriggerMeta {
  value: BadgeTrigger;
  label: string;
  help: string;
  /** Optional activity/checkpoint scope select this trigger accepts. */
  param?: "activity" | "checkpoint";
  /** Optional numeric criteria field this trigger accepts. */
  numberParam?: NumberParam;
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
  {
    value: "complete_n_activities",
    label: "Completar N atividades",
    help: "Atribuído quando a equipa conclui pelo menos N atividades. Várias equipas podem ganhar.",
    numberParam: {
      key: "count",
      label: "Número de atividades",
      placeholder: "ex: 5",
      min: 1,
    },
  },
  {
    value: "complete_all_checkpoints",
    label: "Completar todo o rally",
    help: "Atribuído quando a equipa conclui todas as atividades ativas de todos os postos.",
  },
  {
    value: "score_threshold",
    label: "Atingir pontuação",
    help: "Atribuído quando a pontuação total da equipa atinge o valor definido.",
    numberParam: {
      key: "min_score",
      label: "Pontuação mínima",
      placeholder: "ex: 100",
      min: 0,
    },
  },
  {
    value: "fast_complete",
    label: "Completar rápido",
    help: "Atribuído quando a equipa conclui uma atividade dentro do limite de tempo.",
    param: "activity",
    numberParam: {
      key: "max_seconds",
      label: "Tempo máximo (segundos)",
      placeholder: "ex: 120",
      min: 1,
    },
  },
];

export function triggerMeta(value: string | null | undefined): TriggerMeta | undefined {
  return TRIGGERS.find((t) => t.value === value);
}

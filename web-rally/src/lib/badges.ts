import { Crown, Swords, Zap, type LucideIcon } from "lucide-react";
import type { BadgeType } from "@/types/badge";

interface BadgeDisplay {
  label: string;
  description: string;
  Icon: LucideIcon;
}

/** Display metadata (PT) for each known badge type. */
const BADGE_DISPLAY: Record<BadgeType, BadgeDisplay> = {
  head_to_head_win: {
    label: "Duelo Vencido",
    description: "Venceu um confronto direto entre equipas.",
    Icon: Swords,
  },
  first_to_complete_activity: {
    label: "Primeiro na Prova",
    description: "Primeira equipa a completar uma prova.",
    Icon: Zap,
  },
  first_to_complete_checkpoint: {
    label: "Primeiro no Posto",
    description: "Primeira equipa a concluir todas as provas de um posto.",
    Icon: Crown,
  },
};

const FALLBACK: BadgeDisplay = {
  label: "Conquista",
  description: "Distinção atribuída à equipa.",
  Icon: Crown,
};

export function getBadgeDisplay(badgeType: string): BadgeDisplay {
  return BADGE_DISPLAY[badgeType as BadgeType] ?? FALLBACK;
}

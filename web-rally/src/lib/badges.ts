import type { BadgeType } from "@/types/badge";

interface BadgeDisplay {
  label: string;
  description: string;
  color: string;
  glyph: string;
}

const BADGE_DISPLAY: Record<BadgeType, BadgeDisplay> = {
  head_to_head_win: {
    label: "Duelo Vencido",
    description: "Venceu um confronto direto entre equipas.",
    color: "#6366f1",
    glyph: "⚔",
  },
  first_to_complete_activity: {
    label: "Primeiro na Prova",
    description: "Primeira equipa a completar uma prova.",
    color: "#f59e0b",
    glyph: "↯",
  },
  first_to_complete_checkpoint: {
    label: "Primeiro no Posto",
    description: "Primeira equipa a concluir todas as provas de um posto.",
    color: "#1fbf6b",
    glyph: "★",
  },
};

const FALLBACK: BadgeDisplay = {
  label: "Conquista",
  description: "Distinção atribuída à equipa.",
  color: "#8b5cf6",
  glyph: "◈",
};

export function getBadgeDisplay(badgeType: string): BadgeDisplay {
  return BADGE_DISPLAY[badgeType as BadgeType] ?? FALLBACK;
}

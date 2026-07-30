import type { BadgeDefinitionLite } from "@/client";

/** Resolved display props for one badge, derived from its DB definition. */
export interface BadgeDisplay {
  label: string;
  description: string;
  color: string;
  glyph: string;
  iconUrl: string | null;
}

/** Fallback visuals when a definition omits colour/glyph. */
export const BADGE_FALLBACK = {
  color: "#8b5cf6",
  glyph: "◈",
  description: "Distinção atribuída à equipa.",
} as const;

/** Map a DB badge definition to its showcase display props. */
export function getBadgeDisplay(defn: BadgeDefinitionLite): BadgeDisplay {
  return {
    label: defn.name,
    description: defn.description || BADGE_FALLBACK.description,
    color: defn.color || BADGE_FALLBACK.color,
    glyph: defn.glyph || BADGE_FALLBACK.glyph,
    iconUrl: defn.icon_url ?? null,
  };
}

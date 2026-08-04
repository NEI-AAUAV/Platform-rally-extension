/**
 * Event-type-aware terminology.
 *
 * The same app powers different competition formats (classic pub-crawl rally,
 * city peddy-paper, generic checkpoint games). Drinking mechanics are gated by
 * settings (penalty/bonus values), but the *nouns* shown to users should also
 * match the format. This maps each `event_type` to a small terminology set so
 * copy can stay format-appropriate without per-page conditionals.
 */
import type { EventType } from "@/types/event";

export interface EventTerms {
  /** A single stop on the route. */
  checkpoint: string;
  /** Plural of {@link EventTerms.checkpoint}. */
  checkpoints: string;
  /** A task performed at a checkpoint. */
  activity: string;
  /** Plural of {@link EventTerms.activity}. */
  activities: string;
  /** Generic name for the competition itself. */
  event: string;
  /**
   * Grammatical gender of {@link EventTerms.checkpoint}, so Portuguese copy can
   * agree with it ("próximo posto" vs "próxima tasca") instead of hardcoding
   * one gender or comparing against the noun itself.
   */
  checkpointGender: "m" | "f";
}

const TERMS: Record<EventType, EventTerms> = {
  rally_tascas: {
    checkpoint: "tasca",
    checkpoints: "tascas",
    activity: "prova",
    activities: "provas",
    event: "rally",
    checkpointGender: "f",
  },
  peddy_paper: {
    checkpoint: "posto",
    checkpoints: "postos",
    activity: "desafio",
    activities: "desafios",
    event: "peddy-paper",
    checkpointGender: "m",
  },
  generic: {
    checkpoint: "posto",
    checkpoints: "postos",
    activity: "prova",
    activities: "provas",
    event: "evento",
    checkpointGender: "m",
  },
  olympic: {
    checkpoint: "estação",
    checkpoints: "estações",
    activity: "prova",
    activities: "provas",
    event: "competição olímpica",
    checkpointGender: "f",
  },
};

const DEFAULT_EVENT_TYPE: EventType = "rally_tascas";

/** Resolve the terminology set for an event type (falls back to rally). */
export function getEventTerms(eventType?: string | null): EventTerms {
  if (eventType && eventType in TERMS) {
    return TERMS[eventType as EventType];
  }
  return TERMS[DEFAULT_EVENT_TYPE];
}

/** Capitalize the first letter (for terms used as standalone labels). */
export function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

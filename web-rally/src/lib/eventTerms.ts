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
}

const TERMS: Record<EventType, EventTerms> = {
  rally_tascas: {
    checkpoint: "tasca",
    checkpoints: "tascas",
    activity: "prova",
    activities: "provas",
    event: "rally",
  },
  peddy_paper: {
    checkpoint: "posto",
    checkpoints: "postos",
    activity: "desafio",
    activities: "desafios",
    event: "peddy-paper",
  },
  generic: {
    checkpoint: "posto",
    checkpoints: "postos",
    activity: "prova",
    activities: "provas",
    event: "evento",
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

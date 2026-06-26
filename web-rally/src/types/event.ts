/**
 * Rally event (edition) shapes. Hand-written to mirror api-rally
 * `app/schemas/activity.py` (RallyEvent*) until the generated client covers
 * the /events endpoints.
 */

export type EventType = "rally_tascas" | "peddy_paper" | "generic";

export interface RallyEvent {
  id: number;
  name: string;
  slug?: string | null;
  description?: string | null;
  event_type: EventType;
  is_active: boolean;
  is_current: boolean;
  start_time?: string | null;
  end_time?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RallyEventCreate {
  name: string;
  slug?: string | null;
  description?: string | null;
  event_type?: EventType;
  is_active?: boolean;
  is_current?: boolean;
  start_time?: string | null;
  end_time?: string | null;
}

export type RallyEventUpdate = Partial<RallyEventCreate>;

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  rally_tascas: "Rally Tascas",
  peddy_paper: "Peddy-paper",
  generic: "Genérico",
};

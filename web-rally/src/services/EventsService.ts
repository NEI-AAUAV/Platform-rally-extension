import { client } from "@/client/client.gen";
import type {
  CloneStructureResult,
  RallyEvent,
  RallyEventCreate,
  RallyEventUpdate,
} from "@/types/event";

/**
 * Rally event (edition) management. Hand-written (the /events endpoints are not
 * in the generated client yet) following the generated service shape so it can
 * be swapped for a regenerated service later. Mutations require admin/manager
 * scopes server-side.
 */
export class EventsService {
  /** All events (editions). */
  public static async listEvents(): Promise<Array<RallyEvent>> {
    const { data } = await client.get<Array<RallyEvent>>({
      url: "/api/rally/v1/events",
    });
    return data as Array<RallyEvent>;
  }

  /** The current (active) event. */
  public static async getCurrentEvent(): Promise<RallyEvent> {
    const { data } = await client.get<RallyEvent>({
      url: "/api/rally/v1/events/current",
    });
    return data as RallyEvent;
  }

  public static async createEvent(body: RallyEventCreate): Promise<RallyEvent> {
    const { data } = await client.post<RallyEvent>({
      url: "/api/rally/v1/events",
      body,
    });
    return data as RallyEvent;
  }

  public static async updateEvent(eventId: number, body: RallyEventUpdate): Promise<RallyEvent> {
    const { data } = await client.put<RallyEvent>({
      url: "/api/rally/v1/events/{event_id}",
      path: { event_id: eventId },
      body,
    });
    return data as RallyEvent;
  }

  /** Make the given event the current edition. */
  public static async setCurrentEvent(eventId: number): Promise<RallyEvent> {
    const { data } = await client.post<RallyEvent>({
      url: "/api/rally/v1/events/{event_id}/set-current",
      path: { event_id: eventId },
    });
    return data as RallyEvent;
  }

  /**
   * Seed an empty edition from a previous one: route, activities, badges,
   * rules and settings are copied as new rows. Teams and their results stay in
   * the source edition.
   */
  public static async cloneEventStructure(
    eventId: number,
    sourceEventId: number,
  ): Promise<CloneStructureResult> {
    const { data } = await client.post<CloneStructureResult>({
      url: "/api/rally/v1/events/{event_id}/clone-from/{source_event_id}",
      path: { event_id: eventId, source_event_id: sourceEventId },
    });
    return data as CloneStructureResult;
  }
}

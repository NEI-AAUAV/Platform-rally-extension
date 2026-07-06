import type { CancelablePromise } from "@/client";
import { OpenAPI } from "@/client/core/OpenAPI";
import { request as __request } from "@/client/core/request";
import type { RallyEvent, RallyEventCreate, RallyEventUpdate } from "@/types/event";

/**
 * Rally event (edition) management. Hand-written (the /events endpoints are not
 * in the generated client yet) following the generated service shape so it can
 * be swapped for a regenerated service later. Mutations require admin/manager
 * scopes server-side.
 */
export class EventsService {
  /** All events (editions). */
  public static listEvents(): CancelablePromise<Array<RallyEvent>> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/api/rally/v1/events",
    });
  }

  /** The current (active) event. */
  public static getCurrentEvent(): CancelablePromise<RallyEvent> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/api/rally/v1/events/current",
    });
  }

  public static createEvent(body: RallyEventCreate): CancelablePromise<RallyEvent> {
    return __request(OpenAPI, {
      method: "POST",
      url: "/api/rally/v1/events",
      body,
      mediaType: "application/json",
      errors: { 422: "Validation Error" },
    });
  }

  public static updateEvent(
    eventId: number,
    body: RallyEventUpdate,
  ): CancelablePromise<RallyEvent> {
    return __request(OpenAPI, {
      method: "PUT",
      url: "/api/rally/v1/events/{event_id}",
      path: { event_id: eventId },
      body,
      mediaType: "application/json",
      errors: { 422: "Validation Error" },
    });
  }

  /** Make the given event the current edition. */
  public static setCurrentEvent(eventId: number): CancelablePromise<RallyEvent> {
    return __request(OpenAPI, {
      method: "POST",
      url: "/api/rally/v1/events/{event_id}/set-current",
      path: { event_id: eventId },
      errors: { 422: "Validation Error" },
    });
  }
}

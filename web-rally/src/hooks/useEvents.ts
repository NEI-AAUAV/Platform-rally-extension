import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EventsService } from "@/services/EventsService";
import type { RallyEventCreate, RallyEventUpdate } from "@/types/event";

const EVENTS_KEY = ["events"] as const;

/** All rally editions. */
export function useEvents(enabled = true) {
  return useQuery({
    queryKey: EVENTS_KEY,
    queryFn: EventsService.listEvents,
    enabled,
    retry: false,
  });
}

/** Create / update / set-current mutations, invalidating the events + settings
 * caches so the shell (event name, accent, switcher) reflects the change. */
export function useEventMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: EVENTS_KEY });
    void qc.invalidateQueries({ queryKey: ["rallySettings"] });
    void qc.invalidateQueries({ queryKey: ["rallySettings-admin"] });
  };

  const create = useMutation({
    mutationFn: (body: RallyEventCreate) => EventsService.createEvent(body),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: RallyEventUpdate }) =>
      EventsService.updateEvent(id, body),
    onSuccess: invalidate,
  });

  const setCurrent = useMutation({
    mutationFn: (id: number) => EventsService.setCurrentEvent(id),
    onSuccess: invalidate,
  });

  return { create, update, setCurrent };
}

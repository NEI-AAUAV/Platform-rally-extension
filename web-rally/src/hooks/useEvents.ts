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
    qc.invalidateQueries({ queryKey: EVENTS_KEY });
    qc.invalidateQueries({ queryKey: ["rallySettings-public"] });
    qc.invalidateQueries({ queryKey: ["rallySettings-admin"] });
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
    onSuccess: () => {
      invalidate();
      // Switching the current event changes the server-side data every
      // other query implicitly scopes to (checkpoints, teams, activities,
      // scoreboard) — without this, those stay cached from the previous
      // event until their own staleTime/refetch trigger fires.
      qc.invalidateQueries({ queryKey: ["checkpoints"] });
      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: ["activities"] });
    },
  });

  return { create, update, setCurrent };
}

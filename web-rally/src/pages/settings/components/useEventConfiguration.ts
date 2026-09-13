import { useQuery } from "@tanstack/react-query";
import { eventConfigurationStatus, getCurrentEvent } from "@/client";

export const EVENT_CONFIGURATION_KEY = ["event-configuration-status", "current"] as const;

/** Shared React Query entrypoint: policy always comes from backend preflight. */
export function useEventConfiguration() {
  return useQuery({
    queryKey: EVENT_CONFIGURATION_KEY,
    queryFn: async () => {
      const { data: event } = await getCurrentEvent();
      if (!event) throw new Error("Evento atual indisponível");
      const { data } = await eventConfigurationStatus({ path: { event_id: event.id } });
      if (!data) throw new Error("Estado de configuração indisponível");
      return data;
    },
    staleTime: 15_000,
  });
}

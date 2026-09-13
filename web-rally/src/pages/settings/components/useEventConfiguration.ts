import { useContext } from "react";
import {
  QueryClient,
  QueryClientContext,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import {
  eventConfigurationStatus,
  getCurrentEvent,
  updateEventCapabilities,
} from "@/client";

export const EVENT_CONFIGURATION_ROOT_KEY = ["event-configuration-status"] as const;
export const EVENT_CONFIGURATION_KEY = [...EVENT_CONFIGURATION_ROOT_KEY, "current"] as const;

let _fallbackClient: QueryClient | undefined;
function getFallbackClient(): QueryClient | undefined {
  if (!_fallbackClient && typeof QueryClient === "function") {
    _fallbackClient = new QueryClient({
      defaultOptions: { queries: { enabled: false, retry: false } },
    });
  }
  return _fallbackClient;
}

/** Shared React Query entrypoint: policy always comes from backend preflight. */
export function useEventConfiguration() {
  const client = QueryClientContext ? useContext(QueryClientContext) : undefined;
  const target = client ?? getFallbackClient();
  return useQuery(
    {
      queryKey: EVENT_CONFIGURATION_KEY,
      queryFn: async () => {
        const { data: event } = await getCurrentEvent();
        if (!event) throw new Error("Evento atual indisponível");
        const { data } = await eventConfigurationStatus({ path: { event_id: event.id } });
        if (!data) throw new Error("Estado de configuração indisponível");
        return data;
      },
      staleTime: 15_000,
      enabled: !!client,
    },
    target
  );
}

export function useUpdateEventCapabilities() {
  const client = QueryClientContext ? useContext(QueryClientContext) : undefined;
  const target = client ?? getFallbackClient();

  return useMutation(
    {
      mutationFn: async (caps: { qr_arrival?: boolean; drinking_scoring?: boolean }) => {
        const { data: event } = await getCurrentEvent();
        if (!event) throw new Error("Evento atual indisponível");
        const { data } = await updateEventCapabilities({
          path: { event_id: event.id },
          body: caps,
        });
        if (!data) {
          throw new Error("Erro ao atualizar capacidades do evento");
        }
        return data;
      },
      onSuccess: () => {
        if (client) {
          client.invalidateQueries({ queryKey: EVENT_CONFIGURATION_ROOT_KEY });
          client.invalidateQueries({ queryKey: ["rally-settings"] });
        }
      },
    },
    target
  );
}

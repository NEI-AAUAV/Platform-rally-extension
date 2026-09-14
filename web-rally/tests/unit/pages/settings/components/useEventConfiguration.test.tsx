import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useEventConfiguration,
  useUpdateEventCapabilities,
} from "@/pages/settings/components/useEventConfiguration";
import { eventConfigurationStatus, getCurrentEvent, updateEventCapabilities } from "@/client";

vi.mock("@/client", () => ({
  eventConfigurationStatus: vi.fn(),
  getCurrentEvent: vi.fn(),
  updateEventCapabilities: vi.fn(),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useEventConfiguration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches configuration status for the current event", async () => {
    vi.mocked(getCurrentEvent).mockResolvedValue({ data: { id: "evt-1" } } as never);
    vi.mocked(eventConfigurationStatus).mockResolvedValue({
      data: { ready: true, issues: [], capabilities: {} },
    } as never);

    const wrapper = createWrapper();
    const { result } = renderHook(() => useEventConfiguration(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual({ ready: true, issues: [], capabilities: {} });
    expect(eventConfigurationStatus).toHaveBeenCalledWith({ path: { event_id: "evt-1" } });
  });

  it("throws when there is no current event", async () => {
    vi.mocked(getCurrentEvent).mockResolvedValue({ data: undefined } as never);

    const wrapper = createWrapper();
    const { result } = renderHook(() => useEventConfiguration(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error("Evento atual indisponível"));
  });

  it("throws when configuration status is missing", async () => {
    vi.mocked(getCurrentEvent).mockResolvedValue({ data: { id: "evt-1" } } as never);
    vi.mocked(eventConfigurationStatus).mockResolvedValue({ data: undefined } as never);

    const wrapper = createWrapper();
    const { result } = renderHook(() => useEventConfiguration(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error("Estado de configuração indisponível"));
  });
});

describe("useUpdateEventCapabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates capabilities for the current event and invalidates queries", async () => {
    vi.mocked(getCurrentEvent).mockResolvedValue({ data: { id: "evt-1" } } as never);
    vi.mocked(updateEventCapabilities).mockResolvedValue({
      data: { ready: true, issues: [], capabilities: {} },
    } as never);

    const wrapper = createWrapper();
    const { result } = renderHook(() => useUpdateEventCapabilities(), { wrapper });

    await result.current.mutateAsync({ qr_arrival: true });

    expect(updateEventCapabilities).toHaveBeenCalledWith({
      path: { event_id: "evt-1" },
      body: { qr_arrival: true },
    });
  });

  it("throws when there is no current event", async () => {
    vi.mocked(getCurrentEvent).mockResolvedValue({ data: undefined } as never);

    const wrapper = createWrapper();
    const { result } = renderHook(() => useUpdateEventCapabilities(), { wrapper });

    await expect(result.current.mutateAsync({ qr_arrival: true })).rejects.toThrow(
      "Evento atual indisponível",
    );
  });

  it("throws when the update response has no data", async () => {
    vi.mocked(getCurrentEvent).mockResolvedValue({ data: { id: "evt-1" } } as never);
    vi.mocked(updateEventCapabilities).mockResolvedValue({ data: undefined } as never);

    const wrapper = createWrapper();
    const { result } = renderHook(() => useUpdateEventCapabilities(), { wrapper });

    await expect(result.current.mutateAsync({ qr_arrival: true })).rejects.toThrow(
      "Erro ao atualizar capacidades do evento",
    );
  });
});

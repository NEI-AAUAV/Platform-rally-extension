import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEvents, useEventMutations } from "@/hooks/useEvents";
import { EventsService } from "@/services/EventsService";

vi.mock("@/services/EventsService", () => ({
  EventsService: {
    listEvents: vi.fn(),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    setCurrentEvent: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Wrapper, queryClient };
}

describe("useEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches all rally editions", async () => {
    vi.mocked(EventsService.listEvents).mockResolvedValueOnce([{ id: 1 }] as never);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useEvents(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 1 }]);
  });

  it("does not fetch when disabled", () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useEvents(false), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(EventsService.listEvents).not.toHaveBeenCalled();
  });

  it("surfaces an error without retrying", async () => {
    vi.mocked(EventsService.listEvents).mockRejectedValueOnce(new Error("network down"));
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useEvents(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(EventsService.listEvents).toHaveBeenCalledTimes(1);
  });
});

describe("useEventMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an event and invalidates events + settings caches", async () => {
    vi.mocked(EventsService.createEvent).mockResolvedValueOnce({ id: 1 } as never);
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useEventMutations(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.create.mutateAsync({ name: "Rally 2026" } as never);
    });

    expect(EventsService.createEvent).toHaveBeenCalledWith({ name: "Rally 2026" });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["events"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["rallySettings-public"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["rallySettings-admin"] });
  });

  it("updates an event by id", async () => {
    vi.mocked(EventsService.updateEvent).mockResolvedValueOnce({ id: 1 } as never);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useEventMutations(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.update.mutateAsync({ id: 1, body: { name: "Updated" } } as never);
    });

    expect(EventsService.updateEvent).toHaveBeenCalledWith(1, { name: "Updated" });
  });

  it("sets the current event", async () => {
    vi.mocked(EventsService.setCurrentEvent).mockResolvedValueOnce({ id: 2 } as never);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useEventMutations(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.setCurrent.mutateAsync(2);
    });

    expect(EventsService.setCurrentEvent).toHaveBeenCalledWith(2);
  });

  it("propagates errors from a failed create", async () => {
    vi.mocked(EventsService.createEvent).mockRejectedValueOnce(new Error("fail"));
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useEventMutations(), { wrapper: Wrapper });

    await act(async () => {
      await expect(result.current.create.mutateAsync({} as never)).rejects.toThrow("fail");
    });
  });
});

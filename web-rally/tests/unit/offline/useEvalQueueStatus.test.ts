import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useEvalQueueStatus } from "@/offline/useEvalQueueStatus";
import { list } from "@/offline/evalQueue";
import type { QueuedEval } from "@/offline/evalQueue";

vi.mock("@/offline/evalQueue", () => ({
  list: vi.fn(),
  QUEUE_CHANGED_EVENT: "rally-offline-queue-changed",
}));

function makeEval(overrides: Partial<QueuedEval> = {}): QueuedEval {
  return {
    idempotencyKey: "key-1",
    teamId: 1,
    activityId: 1,
    resultData: {} as never,
    status: "pending",
    createdAt: Date.now(),
    attempts: 0,
    ...overrides,
  };
}

describe("useEvalQueueStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(list).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads the queue on mount", async () => {
    vi.mocked(list).mockResolvedValueOnce([makeEval()]);
    const { result } = renderHook(() => useEvalQueueStatus());

    await waitFor(() => expect(result.current.items).toHaveLength(1));
  });

  it("computes pending and failed counts", async () => {
    vi.mocked(list).mockResolvedValueOnce([
      makeEval({ idempotencyKey: "a", status: "pending" }),
      makeEval({ idempotencyKey: "b", status: "pending" }),
      makeEval({ idempotencyKey: "c", status: "failed" }),
      makeEval({ idempotencyKey: "d", status: "synced" }),
    ]);
    const { result } = renderHook(() => useEvalQueueStatus());

    await waitFor(() => expect(result.current.items).toHaveLength(4));
    expect(result.current.pending).toBe(2);
    expect(result.current.failed).toBe(1);
  });

  it("returns zero counts for an empty queue", async () => {
    const { result } = renderHook(() => useEvalQueueStatus());

    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(result.current.pending).toBe(0);
    expect(result.current.failed).toBe(0);
  });

  it("refreshes on the online event", async () => {
    renderHook(() => useEvalQueueStatus());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

    vi.mocked(list).mockResolvedValueOnce([makeEval()]);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it("refreshes on the offline event", async () => {
    renderHook(() => useEvalQueueStatus());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it("refreshes on window focus", async () => {
    renderHook(() => useEvalQueueStatus());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it("exposes a manual refresh function", async () => {
    const { result } = renderHook(() => useEvalQueueStatus());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

    vi.mocked(list).mockResolvedValueOnce([makeEval()]);
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.items).toHaveLength(1);
  });

  it("refreshes on the polling interval", async () => {
    vi.useFakeTimers();
    renderHook(() => useEvalQueueStatus());

    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(1));

    vi.mocked(list).mockResolvedValueOnce([makeEval()]);
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it("removes event listeners and clears the interval on unmount", async () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const clearSpy = vi.spyOn(window, "clearInterval");
    const { unmount } = renderHook(() => useEvalQueueStatus());
    await waitFor(() => expect(list).toHaveBeenCalled());

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("online", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("offline", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("focus", expect.any(Function));
    expect(clearSpy).toHaveBeenCalled();
  });
});

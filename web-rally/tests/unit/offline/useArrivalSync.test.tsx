/**
 * The arrival queue itself is covered by src/offline/arrivalQueue.test.ts; this
 * covers the hook that drains it, which was previously at 0%. The behaviour
 * that matters in the field is the failure path: a replay that errors must
 * leave the arrival in the queue (marked failed) rather than dropping a team's
 * progress, and going offline must not drain anything at all.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// In-memory stand-in for idb-keyval (jsdom has no IndexedDB) — same approach as
// the arrivalQueue unit test.
const store = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  createStore: () => ({}),
  get: async (key: string) => store.get(key),
  set: async (key: string, val: unknown) => {
    store.set(key, val);
  },
}));

const arriveAtCheckpoint = vi.fn();
vi.mock("@/client", () => ({
  arriveAtCheckpoint: (...args: unknown[]) => arriveAtCheckpoint(...args),
}));

import { useArrivalSync } from "@/offline/useArrivalSync";
import {
  ARRIVAL_QUEUE_CHANGED_EVENT,
  enqueueArrival,
  listArrivals,
} from "@/offline/arrivalQueue";

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", {
    value: online,
    writable: true,
    configurable: true,
  });
}

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useArrivalSync", () => {
  beforeEach(() => {
    store.clear();
    arriveAtCheckpoint.mockReset();
    arriveAtCheckpoint.mockResolvedValue(undefined);
    setOnline(true);
  });

  it("drains a queued arrival on mount and replays the coordinates captured at the post", async () => {
    await enqueueArrival({ checkpointId: 7, latitude: 41.5, longitude: -8.2 });

    const { result } = renderHook(() => useArrivalSync(), { wrapper });

    await waitFor(() => expect(arriveAtCheckpoint).toHaveBeenCalledTimes(1));
    expect(arriveAtCheckpoint).toHaveBeenCalledWith({
      path: { checkpoint_id: 7 },
      body: { latitude: 41.5, longitude: -8.2 },
    });
    await waitFor(() => expect(result.current.queued).toHaveLength(0));
    expect(await listArrivals()).toHaveLength(0);
  });

  it("does not replay anything while offline, and keeps the arrival queued", async () => {
    setOnline(false);
    await enqueueArrival({ checkpointId: 3, latitude: 40.0, longitude: -8.0 });

    const { result } = renderHook(() => useArrivalSync(), { wrapper });

    await waitFor(() => expect(result.current.queued).toHaveLength(1));
    expect(arriveAtCheckpoint).not.toHaveBeenCalled();
    expect(result.current.queued[0]).toMatchObject({ checkpointId: 3, status: "pending" });
  });

  it("keeps a failed replay in the queue as failed instead of dropping it", async () => {
    arriveAtCheckpoint.mockRejectedValue(new Error("500"));
    await enqueueArrival({ checkpointId: 9, latitude: 41.1, longitude: -8.6 });

    const { result } = renderHook(() => useArrivalSync(), { wrapper });

    await waitFor(() => expect(arriveAtCheckpoint).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.queued).toHaveLength(1));
    expect(result.current.queued[0]).toMatchObject({ checkpointId: 9, status: "failed" });
  });

  it("retries the queue when connectivity returns", async () => {
    arriveAtCheckpoint.mockRejectedValueOnce(new Error("offline"));
    await enqueueArrival({ checkpointId: 4, latitude: 41.2, longitude: -8.4 });

    const { result } = renderHook(() => useArrivalSync(), { wrapper });
    await waitFor(() => expect(result.current.queued).toHaveLength(1));

    arriveAtCheckpoint.mockResolvedValue(undefined);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(result.current.queued).toHaveLength(0));
  });

  it("refreshes the visible queue when another tab changes it", async () => {
    setOnline(false);
    const { result } = renderHook(() => useArrivalSync(), { wrapper });
    await waitFor(() => expect(result.current.queued).toHaveLength(0));

    await enqueueArrival({ checkpointId: 11, latitude: 41.3, longitude: -8.5 });
    await act(async () => {
      window.dispatchEvent(new Event(ARRIVAL_QUEUE_CHANGED_EVENT));
    });

    await waitFor(() => expect(result.current.queued).toHaveLength(1));
  });

  it("drains when the PWA is brought back to the foreground", async () => {
    setOnline(false);
    await enqueueArrival({ checkpointId: 5, latitude: 41.4, longitude: -8.1 });

    const { result } = renderHook(() => useArrivalSync(), { wrapper });
    await waitFor(() => expect(result.current.queued).toHaveLength(1));

    // iOS kills backgrounded PWAs, so the process that queued the arrival may
    // never see an `online` event — visibility is the fallback trigger.
    setOnline(true);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(result.current.queued).toHaveLength(0));
    expect(arriveAtCheckpoint).toHaveBeenCalledTimes(1);
  });
});

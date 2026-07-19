import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import useRallyEventStream from "@/hooks/useRallyEventStream";

const { mockConfig } = vi.hoisted(() => ({ mockConfig: { EVENTS_ENABLED: true } }));
vi.mock("@/config", () => ({ default: mockConfig }));

type Listener = (event: MessageEvent) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onerror: ((this: EventSource, ev: Event) => void) | null = null;
  closed = false;
  private listeners: Record<string, Listener[]> = {};

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: Listener) {
    (this.listeners[type] ??= []).push(cb);
  }
  removeEventListener(type: string, cb: Listener) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((l) => l !== cb);
  }
  emit(type: string) {
    for (const cb of this.listeners[type] ?? []) cb(new MessageEvent(type));
  }
  close() {
    this.closed = true;
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  FakeEventSource.instances = [];
  mockConfig.EVENTS_ENABLED = true;
  vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useRallyEventStream", () => {
  it("opens the SSE connection to the raw events stream when enabled", () => {
    renderHook(() => useRallyEventStream([["teams"]]), { wrapper });
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]?.url).toBe("/api/rally/v1/events/stream");
  });

  it("does not connect when EVENTS_ENABLED is false", () => {
    mockConfig.EVENTS_ENABLED = false;
    renderHook(() => useRallyEventStream([["teams"]]), { wrapper });
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("invalidates all provided query keys on a rally activity_result event", () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const customWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    renderHook(() => useRallyEventStream([["teams"], ["checkpoints"]]), {
      wrapper: customWrapper,
    });
    FakeEventSource.instances[0]?.emit("rally.activity_result.created");

    expect(spy).toHaveBeenCalledWith({ queryKey: ["teams"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["checkpoints"] });
  });

  it("invalidates on team.score_updated and checkpoint_advanced events", () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const customWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    renderHook(() => useRallyEventStream([["teams"]]), { wrapper: customWrapper });
    FakeEventSource.instances[0]?.emit("rally.team.score_updated");
    FakeEventSource.instances[0]?.emit("rally.team.checkpoint_advanced");

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("closes the connection on an error event (backend disabled)", () => {
    renderHook(() => useRallyEventStream([["teams"]]), { wrapper });
    const source = FakeEventSource.instances[0];
    source?.onerror?.call(source as unknown as EventSource, new Event("error"));
    expect(source?.closed).toBe(true);
  });

  it("closes the connection on unmount", () => {
    const { unmount } = renderHook(() => useRallyEventStream([["teams"]]), { wrapper });
    const source = FakeEventSource.instances[0];
    unmount();
    expect(source?.closed).toBe(true);
  });

  it("is a no-op when EventSource is undefined", () => {
    vi.stubGlobal("EventSource", undefined);
    renderHook(() => useRallyEventStream([["teams"]]), { wrapper });
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});

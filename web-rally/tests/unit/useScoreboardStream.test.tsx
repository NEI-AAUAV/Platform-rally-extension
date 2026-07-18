import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import useScoreboardStream from "@/hooks/useScoreboardStream";

// Drive EVENTS_ENABLED per-test (hoisted so the mock factory can read it).
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

describe("useScoreboardStream", () => {
  it("opens the SSE connection when enabled", () => {
    renderHook(() => useScoreboardStream([["teams"]]), { wrapper });
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]?.url).toContain("/scoreboard/stream");
  });

  it("does not connect when disabled", () => {
    mockConfig.EVENTS_ENABLED = false;
    renderHook(() => useScoreboardStream([["teams"]]), { wrapper });
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("invalidates queries on a refresh event", () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const customWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    renderHook(() => useScoreboardStream([["teams"]]), { wrapper: customWrapper });
    FakeEventSource.instances[0]?.emit("refresh");

    expect(spy).toHaveBeenCalledWith({ queryKey: ["teams"] });
  });

  it("closes the connection on unmount", () => {
    const { unmount } = renderHook(() => useScoreboardStream([["teams"]]), { wrapper });
    const source = FakeEventSource.instances[0];
    unmount();
    expect(source?.closed).toBe(true);
  });

  it("does not connect when EventSource is unavailable in the environment", () => {
    vi.unstubAllGlobals();
    // @ts-expect-error simulate an environment without EventSource support
    delete globalThis.EventSource;
    renderHook(() => useScoreboardStream([["teams"]]), { wrapper });
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("closes the connection when the stream errors", () => {
    renderHook(() => useScoreboardStream([["teams"]]), { wrapper });
    const source = FakeEventSource.instances[0];
    source?.onerror?.(new Event("error"));
    expect(source?.closed).toBe(true);
  });

  it("uses the default queryKeys param when none is provided", () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const customWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    renderHook(() => useScoreboardStream(), { wrapper: customWrapper });
    FakeEventSource.instances[0]?.emit("refresh");

    expect(spy).toHaveBeenCalledWith({ queryKey: ["teams"] });
  });
});

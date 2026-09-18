import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useNextCheckpointState } from "@/pages/team-progress/useNextCheckpointState";
import type { DetailedCheckPoint } from "@/client";

const {
  mockUseCheckpointMedia,
  mockUseRallySettings,
  mockUseEventTerms,
  mockUseArrivalSync,
  mockUseCheckpointHints,
} = vi.hoisted(() => ({
  mockUseCheckpointMedia: vi.fn(),
  mockUseRallySettings: vi.fn(),
  mockUseEventTerms: vi.fn(),
  mockUseArrivalSync: vi.fn(),
  mockUseCheckpointHints: vi.fn(),
}));

vi.mock("@/offline/arrivalQueue", () => ({ enqueueArrival: vi.fn() }));
vi.mock("@/offline/useArrivalSync", () => ({ useArrivalSync: () => mockUseArrivalSync() }));
vi.mock("@/hooks/useEventTerms", () => ({ default: () => mockUseEventTerms() }));
vi.mock("@/hooks/useCheckpointMedia", () => ({
  useCheckpointMedia: (...args: unknown[]) => mockUseCheckpointMedia(...args),
}));
vi.mock("@/hooks/useRallySettings", () => ({ default: () => mockUseRallySettings() }));
vi.mock("@/hooks/useCheckpointHints", () => ({
  default: (...args: unknown[]) => mockUseCheckpointHints(...args),
}));
vi.mock("@/client", () => ({ arriveAtCheckpoint: vi.fn() }));

const hintState = (overrides: Record<string, unknown> = {}) => ({
  revealed: [],
  remaining: 0,
  nextCost: 0,
  totalSpentInEvent: 0,
  isLoading: false,
  reveal: { mutate: vi.fn(), isPending: false, isError: false, error: null },
  giveUp: { mutate: vi.fn(), isPending: false, isError: false, error: null },
  ...overrides,
});

const terms = {
  checkpoint: "posto",
  checkpoints: "postos",
  activity: "desafio",
  activities: "desafios",
  event: "peddy-paper",
  checkpointGender: "m" as const,
};

function checkpoint(overrides: Partial<DetailedCheckPoint> = {}): DetailedCheckPoint {
  return {
    id: 1,
    name: "Posto 1",
    latitude: 41.1,
    longitude: -8.6,
    arrival_radius_m: 50,
    ...overrides,
  } as DetailedCheckPoint;
}

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useNextCheckpointState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCheckpointMedia.mockReturnValue({ photos: [], funFacts: [] });
    mockUseArrivalSync.mockReturnValue({ queued: [], syncNow: vi.fn() });
    mockUseCheckpointHints.mockReturnValue(hintState());
    mockUseEventTerms.mockReturnValue(terms);
  });

  it("allows GPS check-in for a normal rally checkpoint with coordinates", () => {
    mockUseRallySettings.mockReturnValue({ settings: { gps_checkin_enabled: true } });
    const { result } = renderHook(() => useNextCheckpointState(checkpoint()), {
      wrapper: createWrapper(),
    });
    expect(result.current.access.canCheckin).toBe(true);
  });

  it("allows GPS check-in on a redacted post even without coordinates", () => {
    mockUseRallySettings.mockReturnValue({ settings: { gps_checkin_enabled: true } });
    const { result } = renderHook(
      () =>
        useNextCheckpointState(
          checkpoint({ latitude: null, longitude: null, is_redacted: true }),
        ),
      { wrapper: createWrapper() },
    );
    expect(result.current.access.canCheckin).toBe(true);
  });

  it("hides check-in when the checkpoint has no geofence radius", () => {
    mockUseRallySettings.mockReturnValue({ settings: { gps_checkin_enabled: true } });
    const { result } = renderHook(
      () => useNextCheckpointState(checkpoint({ arrival_radius_m: 0 })),
      { wrapper: createWrapper() },
    );
    expect(result.current.access.canCheckin).toBe(false);
  });

  it("hides check-in when GPS check-in is disabled for the event", () => {
    mockUseRallySettings.mockReturnValue({ settings: { gps_checkin_enabled: false } });
    const { result } = renderHook(() => useNextCheckpointState(checkpoint()), {
      wrapper: createWrapper(),
    });
    expect(result.current.access.canCheckin).toBe(false);
  });

  it("reports settingsUnavailable when the settings fetch failed", () => {
    mockUseRallySettings.mockReturnValue({ settings: undefined, error: new Error("boom") });
    const { result } = renderHook(() => useNextCheckpointState(checkpoint()), {
      wrapper: createWrapper(),
    });
    expect(result.current.access.settingsUnavailable).toBe(true);
  });

  it("respects the checkpoint's own opening hours", () => {
    mockUseRallySettings.mockReturnValue({
      settings: { gps_checkin_enabled: true, checkpoint_hours_enabled: true },
    });
    const future = new Date(Date.now() + 3600_000).toISOString();
    const { result } = renderHook(
      () => useNextCheckpointState(checkpoint({ available_from: future })),
      { wrapper: createWrapper() },
    );
    expect(result.current.access.openingNotice).not.toBeNull();
    expect(result.current.access.canCheckin).toBe(false);
  });

  it("offers give-up only once the hint ladder is spent, on a redacted post", () => {
    mockUseRallySettings.mockReturnValue({ settings: { skip_enabled: true } });
    mockUseCheckpointHints.mockReturnValue(hintState({ revealed: [{ indication_id: 1, hint: "x", cost: 0 }], remaining: 0 }));
    const { result } = renderHook(
      () => useNextCheckpointState(checkpoint({ is_redacted: true })),
      { wrapper: createWrapper() },
    );
    expect(result.current.access.canGiveUp).toBe(true);
  });

  it("does not offer give-up while hints remain", () => {
    mockUseRallySettings.mockReturnValue({ settings: { skip_enabled: true } });
    mockUseCheckpointHints.mockReturnValue(hintState({ remaining: 3 }));
    const { result } = renderHook(
      () => useNextCheckpointState(checkpoint({ is_redacted: true })),
      { wrapper: createWrapper() },
    );
    expect(result.current.access.canGiveUp).toBe(false);
  });

  it("does not offer give-up on a non-redacted (guided) checkpoint", () => {
    mockUseRallySettings.mockReturnValue({ settings: { skip_enabled: true } });
    const { result } = renderHook(() => useNextCheckpointState(checkpoint()), {
      wrapper: createWrapper(),
    });
    expect(result.current.access.canGiveUp).toBe(false);
  });

  describe("persistent status", () => {
    beforeEach(() => {
      mockUseRallySettings.mockReturnValue({
        settings: { gps_checkin_enabled: true, skip_enabled: true },
      });
    });

    it("reports pending status with no arrival/completion flags", () => {
      const { result } = renderHook(
        () =>
          useNextCheckpointState(checkpoint(), {
            checkpoint_id: 1,
            status: "pending",
          } as unknown as never),
        { wrapper: createWrapper() },
      );
      expect(result.current.persistent.status).toBe("pending");
      expect(result.current.persistent.hasArrived).toBe(false);
      expect(result.current.persistent.isCompleted).toBe(false);
      expect(result.current.persistent.isSkipped).toBe(false);
    });

    it("reports arrived status and disables check-in", () => {
      const { result } = renderHook(
        () =>
          useNextCheckpointState(checkpoint(), {
            checkpoint_id: 1,
            status: "arrived",
          } as unknown as never),
        { wrapper: createWrapper() },
      );
      expect(result.current.persistent.status).toBe("arrived");
      expect(result.current.persistent.hasArrived).toBe(true);
      expect(result.current.persistent.isCompleted).toBe(false);
      expect(result.current.persistent.isSkipped).toBe(false);
      expect(result.current.access.canCheckin).toBe(false);
    });

    it("reports completed status and locks all interactive access", () => {
      const { result } = renderHook(
        () =>
          useNextCheckpointState(checkpoint(), {
            checkpoint_id: 1,
            status: "completed",
          } as unknown as never),
        { wrapper: createWrapper() },
      );
      expect(result.current.persistent.isCompleted).toBe(true);
      expect(result.current.persistent.hasArrived).toBe(true);
      expect(result.current.access.canCheckin).toBe(false);
      expect(result.current.access.canGiveUp).toBe(false);
      expect(result.current.access.proximityEnabled).toBe(false);
    });

    it("reports skipped status and locks all interactive access", () => {
      const { result } = renderHook(
        () =>
          useNextCheckpointState(checkpoint({ is_redacted: true }), {
            checkpoint_id: 1,
            status: "skipped",
          } as unknown as never),
        { wrapper: createWrapper() },
      );
      expect(result.current.persistent.isSkipped).toBe(true);
      expect(result.current.access.canCheckin).toBe(false);
      expect(result.current.access.canGiveUp).toBe(false);
      expect(result.current.access.proximityEnabled).toBe(false);
    });
  });
});

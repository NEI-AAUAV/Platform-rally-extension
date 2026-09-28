import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DetailedCheckPoint, CheckpointProgress } from "@/client";
import { useCheckpointArrivalAvailability } from "@/pages/team-progress/useCheckpointArrivalAvailability";

const { mockUseRallySettings } = vi.hoisted(() => ({
  mockUseRallySettings: vi.fn(),
}));

vi.mock("@/hooks/useRallySettings", () => ({ default: () => mockUseRallySettings() }));

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

function progress(overrides: Partial<CheckpointProgress> = {}): CheckpointProgress {
  return { checkpoint_id: 1, status: "pending", ...overrides } as CheckpointProgress;
}

describe("useCheckpointArrivalAvailability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides check-in when GPS check-in is disabled for the event", () => {
    mockUseRallySettings.mockReturnValue({ settings: { gps_checkin_enabled: false } });
    const { result } = renderHook(() => useCheckpointArrivalAvailability(checkpoint()));
    expect(result.current.canCheckin).toBe(false);
  });

  it("hides check-in when the checkpoint has no valid arrival radius", () => {
    mockUseRallySettings.mockReturnValue({ settings: { gps_checkin_enabled: true } });
    const { result } = renderHook(() =>
      useCheckpointArrivalAvailability(checkpoint({ arrival_radius_m: 0 })),
    );
    expect(result.current.canCheckin).toBe(false);
  });

  it("hides check-in while the checkpoint is not yet open", () => {
    mockUseRallySettings.mockReturnValue({
      settings: { gps_checkin_enabled: true, checkpoint_hours_enabled: true },
    });
    const future = new Date(Date.now() + 3600_000).toISOString();
    const { result } = renderHook(() =>
      useCheckpointArrivalAvailability(checkpoint({ available_from: future })),
    );
    expect(result.current.canCheckin).toBe(false);
    expect(result.current.openingNotice).not.toBeNull();
  });

  it("hides check-in when the team has not yet departed the previous stage", () => {
    mockUseRallySettings.mockReturnValue({ settings: { gps_checkin_enabled: true } });
    const { result } = renderHook(() =>
      useCheckpointArrivalAvailability(checkpoint(), undefined, "Ainda não partiu"),
    );
    expect(result.current.canCheckin).toBe(false);
    expect(result.current.openingNotice).toBe("Ainda não partiu");
  });

  it("hides check-in once the team has arrived but not been scored", () => {
    mockUseRallySettings.mockReturnValue({ settings: { gps_checkin_enabled: true } });
    const { result } = renderHook(() =>
      useCheckpointArrivalAvailability(checkpoint(), progress({ status: "arrived" })),
    );
    expect(result.current.canCheckin).toBe(false);
    expect(result.current.hasArrived).toBe(true);
    expect(result.current.terminal).toBe(false);
  });

  it("hides check-in once the checkpoint is completed", () => {
    mockUseRallySettings.mockReturnValue({ settings: { gps_checkin_enabled: true } });
    const { result } = renderHook(() =>
      useCheckpointArrivalAvailability(checkpoint(), progress({ status: "completed" })),
    );
    expect(result.current.canCheckin).toBe(false);
    expect(result.current.terminal).toBe(true);
  });

  it("hides check-in once the checkpoint is skipped", () => {
    mockUseRallySettings.mockReturnValue({ settings: { gps_checkin_enabled: true } });
    const { result } = renderHook(() =>
      useCheckpointArrivalAvailability(checkpoint(), progress({ status: "skipped" })),
    );
    expect(result.current.canCheckin).toBe(false);
    expect(result.current.terminal).toBe(true);
  });

  it("allows GPS check-in for a valid free-choice pending checkpoint", () => {
    mockUseRallySettings.mockReturnValue({
      settings: { gps_checkin_enabled: true, checkpoint_hours_enabled: true },
    });
    const { result } = renderHook(() =>
      useCheckpointArrivalAvailability(checkpoint(), progress({ status: "pending" }), null),
    );
    expect(result.current.canCheckin).toBe(true);
    expect(result.current.terminal).toBe(false);
    expect(result.current.hasArrived).toBe(false);
  });
});

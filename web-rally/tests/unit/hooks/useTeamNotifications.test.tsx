import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { DetailedTeam } from "@/client";

const h = vi.hoisted(() => ({
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useAppToast: () => h,
}));

// useEventTerms pulls from useRallySettings (React Query), which needs a
// QueryClientProvider this test doesn't set up.
vi.mock("@/hooks/useEventTerms", () => ({
  default: () => ({
    checkpoint: "posto",
    checkpoints: "postos",
    activity: "desafio",
    activities: "desafios",
    event: "peddy-paper",
    checkpointGender: "m",
  }),
}));

import useTeamNotifications from "@/hooks/useTeamNotifications";

function makeTeam(over: Partial<DetailedTeam>): DetailedTeam {
  return { classification: 1, resolved_checkpoint_orders: [], ...over } as DetailedTeam;
}

describe("useTeamNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when team is undefined", () => {
    renderHook(() => useTeamNotifications(undefined));
    expect(h.success).not.toHaveBeenCalled();
    expect(h.info).not.toHaveBeenCalled();
  });

  it("does not announce on the first observation (seeds the baseline)", () => {
    const { rerender } = renderHook(({ team }) => useTeamNotifications(team), {
      initialProps: { team: makeTeam({ classification: 3, resolved_checkpoint_orders: [1] }) },
    });
    expect(h.success).not.toHaveBeenCalled();
    expect(h.info).not.toHaveBeenCalled();
    rerender({ team: makeTeam({ classification: 3, resolved_checkpoint_orders: [1] }) });
    expect(h.success).not.toHaveBeenCalled();
  });

  it("announces when a checkpoint resolves", () => {
    const { rerender } = renderHook(({ team }) => useTeamNotifications(team), {
      initialProps: { team: makeTeam({ classification: 3, resolved_checkpoint_orders: [1] }) },
    });
    rerender({ team: makeTeam({ classification: 3, resolved_checkpoint_orders: [1, 2] }) });
    expect(h.success).toHaveBeenCalledWith("posto 2 resolvido!");
  });

  it("announces free-order resolution out of sequence (not a sequential prefix)", () => {
    const { rerender } = renderHook(({ team }) => useTeamNotifications(team), {
      initialProps: { team: makeTeam({ classification: 3, resolved_checkpoint_orders: [3] }) },
    });
    rerender({ team: makeTeam({ classification: 3, resolved_checkpoint_orders: [3, 4] }) });
    expect(h.success).toHaveBeenCalledWith("posto 4 resolvido!");
  });

  it("summarizes multiple simultaneously-resolved checkpoints instead of an avalanche of toasts", () => {
    const { rerender } = renderHook(({ team }) => useTeamNotifications(team), {
      initialProps: { team: makeTeam({ classification: 3, resolved_checkpoint_orders: [] }) },
    });
    rerender({ team: makeTeam({ classification: 3, resolved_checkpoint_orders: [1, 2, 3] }) });
    expect(h.success).toHaveBeenCalledTimes(1);
    expect(h.success).toHaveBeenCalledWith("3 postos resolvidos!");
  });

  it("announces when rank improves (lower number)", () => {
    const { rerender } = renderHook(({ team }) => useTeamNotifications(team), {
      initialProps: { team: makeTeam({ classification: 5, resolved_checkpoint_orders: [1] }) },
    });
    rerender({ team: makeTeam({ classification: 3, resolved_checkpoint_orders: [1] }) });
    expect(h.info).toHaveBeenCalledWith("Subiste para 3º lugar!");
  });

  it("does not announce a climb from the unranked sentinel (-1)", () => {
    const { rerender } = renderHook(({ team }) => useTeamNotifications(team), {
      initialProps: { team: makeTeam({ classification: -1, resolved_checkpoint_orders: [1] }) },
    });
    rerender({ team: makeTeam({ classification: 2, resolved_checkpoint_orders: [1] }) });
    expect(h.info).not.toHaveBeenCalled();
  });

  it("does not announce when rank worsens", () => {
    const { rerender } = renderHook(({ team }) => useTeamNotifications(team), {
      initialProps: { team: makeTeam({ classification: 2, resolved_checkpoint_orders: [1] }) },
    });
    rerender({ team: makeTeam({ classification: 4, resolved_checkpoint_orders: [1] }) });
    expect(h.info).not.toHaveBeenCalled();
  });

  it("does not announce a climb when the new rank becomes the unranked sentinel", () => {
    const { rerender } = renderHook(({ team }) => useTeamNotifications(team), {
      initialProps: { team: makeTeam({ classification: 3, resolved_checkpoint_orders: [1] }) },
    });
    rerender({ team: makeTeam({ classification: -1, resolved_checkpoint_orders: [1] }) });
    expect(h.info).not.toHaveBeenCalled();
  });

  it("treats a missing resolved_checkpoint_orders as empty", () => {
    const { rerender } = renderHook(({ team }) => useTeamNotifications(team), {
      initialProps: {
        team: makeTeam({ classification: 3, resolved_checkpoint_orders: undefined }),
      },
    });
    rerender({ team: makeTeam({ classification: 3, resolved_checkpoint_orders: [1] }) });
    expect(h.success).toHaveBeenCalledWith("posto 1 resolvido!");
  });
});

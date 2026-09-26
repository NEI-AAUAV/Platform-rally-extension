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

function makeTeam(over: Partial<DetailedTeam> & { id?: number }): DetailedTeam {
  return { id: 1, classification: 1, resolved_checkpoint_orders: [], ...over } as DetailedTeam;
}

describe("useTeamNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when team is undefined", () => {
    renderHook(() => useTeamNotifications(undefined, null));
    expect(h.success).not.toHaveBeenCalled();
    expect(h.info).not.toHaveBeenCalled();
  });

  it("does not announce on the first observation (seeds the baseline)", () => {
    const { rerender } = renderHook(({ team, rank }) => useTeamNotifications(team, rank), {
      initialProps: { team: makeTeam({ resolved_checkpoint_orders: [1] }), rank: 3 },
    });
    expect(h.success).not.toHaveBeenCalled();
    expect(h.info).not.toHaveBeenCalled();
    rerender({ team: makeTeam({ resolved_checkpoint_orders: [1] }), rank: 3 });
    expect(h.success).not.toHaveBeenCalled();
  });

  it("announces when a checkpoint resolves", () => {
    const { rerender } = renderHook(({ team, rank }) => useTeamNotifications(team, rank), {
      initialProps: { team: makeTeam({ resolved_checkpoint_orders: [1] }), rank: 3 },
    });
    rerender({ team: makeTeam({ resolved_checkpoint_orders: [1, 2] }), rank: 3 });
    expect(h.success).toHaveBeenCalledWith("posto 2 resolvido!");
  });

  it("announces free-order resolution out of sequence (not a sequential prefix)", () => {
    const { rerender } = renderHook(({ team, rank }) => useTeamNotifications(team, rank), {
      initialProps: { team: makeTeam({ resolved_checkpoint_orders: [3] }), rank: 3 },
    });
    rerender({ team: makeTeam({ resolved_checkpoint_orders: [3, 4] }), rank: 3 });
    expect(h.success).toHaveBeenCalledWith("posto 4 resolvido!");
  });

  it("summarizes multiple simultaneously-resolved checkpoints instead of an avalanche of toasts", () => {
    const { rerender } = renderHook(({ team, rank }) => useTeamNotifications(team, rank), {
      initialProps: { team: makeTeam({ resolved_checkpoint_orders: [] }), rank: 3 },
    });
    rerender({ team: makeTeam({ resolved_checkpoint_orders: [1, 2, 3] }), rank: 3 });
    expect(h.success).toHaveBeenCalledTimes(1);
    expect(h.success).toHaveBeenCalledWith("3 postos resolvidos!");
  });

  it("announces when rank improves (lower number)", () => {
    const { rerender } = renderHook(({ team, rank }) => useTeamNotifications(team, rank), {
      initialProps: { team: makeTeam({ resolved_checkpoint_orders: [1] }), rank: 5 },
    });
    rerender({ team: makeTeam({ resolved_checkpoint_orders: [1] }), rank: 3 });
    expect(h.info).toHaveBeenCalledWith("Subiste para 3º lugar!");
  });

  it("does not announce a climb from an unranked (null) baseline", () => {
    const { rerender } = renderHook(({ team, rank }) => useTeamNotifications(team, rank), {
      initialProps: { team: makeTeam({ resolved_checkpoint_orders: [1] }), rank: null },
    });
    rerender({ team: makeTeam({ resolved_checkpoint_orders: [1] }), rank: 2 });
    expect(h.info).not.toHaveBeenCalled();
  });

  it("does not announce when rank worsens", () => {
    const { rerender } = renderHook(({ team, rank }) => useTeamNotifications(team, rank), {
      initialProps: { team: makeTeam({ resolved_checkpoint_orders: [1] }), rank: 2 },
    });
    rerender({ team: makeTeam({ resolved_checkpoint_orders: [1] }), rank: 4 });
    expect(h.info).not.toHaveBeenCalled();
  });

  it("does not announce a climb when the new rank becomes unranked (null)", () => {
    const { rerender } = renderHook(({ team, rank }) => useTeamNotifications(team, rank), {
      initialProps: { team: makeTeam({ resolved_checkpoint_orders: [1] }), rank: 3 },
    });
    rerender({ team: makeTeam({ resolved_checkpoint_orders: [1] }), rank: null });
    expect(h.info).not.toHaveBeenCalled();
  });

  it("treats a tie (same rank) as no climb", () => {
    const { rerender } = renderHook(({ team, rank }) => useTeamNotifications(team, rank), {
      initialProps: { team: makeTeam({ resolved_checkpoint_orders: [1] }), rank: 2 },
    });
    rerender({ team: makeTeam({ resolved_checkpoint_orders: [1] }), rank: 2 });
    expect(h.info).not.toHaveBeenCalled();
  });

  it("treats a missing resolved_checkpoint_orders as empty", () => {
    const { rerender } = renderHook(({ team, rank }) => useTeamNotifications(team, rank), {
      initialProps: {
        team: makeTeam({ resolved_checkpoint_orders: undefined }),
        rank: 3,
      },
    });
    rerender({ team: makeTeam({ resolved_checkpoint_orders: [1] }), rank: 3 });
    expect(h.success).toHaveBeenCalledWith("posto 1 resolvido!");
  });

  it("resets the baseline when the team id changes (session/login switch)", () => {
    // Team A is deep into its route with a good rank; Team B (a different
    // session) starts fresh. Without a reset, B's first render would diff
    // against A's leftover baseline and fire bogus notifications.
    const { rerender } = renderHook(({ team, rank }) => useTeamNotifications(team, rank), {
      initialProps: { team: makeTeam({ id: 1, resolved_checkpoint_orders: [1, 2, 3] }), rank: 2 },
    });
    rerender({ team: makeTeam({ id: 2, resolved_checkpoint_orders: [] }), rank: 8 });
    expect(h.success).not.toHaveBeenCalled();
    expect(h.info).not.toHaveBeenCalled();

    // Now Team B progresses/improves for real — it should notify normally.
    rerender({ team: makeTeam({ id: 2, resolved_checkpoint_orders: [1] }), rank: 5 });
    expect(h.success).toHaveBeenCalledWith("posto 1 resolvido!");
    expect(h.info).toHaveBeenCalledWith("Subiste para 5º lugar!");
  });
});

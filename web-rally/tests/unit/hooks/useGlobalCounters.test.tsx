/**
 * One endpoint serves both kinds of global rule, so each hook must return only
 * its own. Without the rule_type filter, every bonus rule an admin created
 * would have shown up in the staff form as a deduction.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useGlobalPenaltyCounters } from "@/hooks/useGlobalPenaltyCounters";
import { useGlobalBonusCounters } from "@/hooks/useGlobalBonusCounters";
import { listDynamicRules } from "@/client";

vi.mock("@/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/client")>();
  return { ...actual, listDynamicRules: vi.fn() };
});

const RULES = [
  { id: 1, name: "Atraso", rule_type: "penalty_counter", points: 10, is_active: true },
  { id: 2, name: "Criatividade", rule_type: "bonus_counter", points: 3, is_active: true },
  { id: 3, name: "Inativa", rule_type: "bonus_counter", points: 4, is_active: false },
  { id: 4, name: "Antiga", rule_type: "penalty_counter", points: 2, is_active: false },
];

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("global counter hooks", () => {
  beforeEach(() => {
    vi.mocked(listDynamicRules).mockResolvedValue({ data: RULES } as never);
  });

  it("returns only active penalty rules, keyed g_<id>", async () => {
    const { result } = renderHook(() => useGlobalPenaltyCounters(), { wrapper });

    await waitFor(() => expect(result.current.globalPenaltyCounters).toHaveLength(1));
    expect(result.current.globalPenaltyCounters[0]).toEqual({
      key: "g_1",
      label: "Atraso",
      points: 10,
    });
  });

  it("returns only active bonus rules, keyed gb_<id>", async () => {
    const { result } = renderHook(() => useGlobalBonusCounters(), { wrapper });

    await waitFor(() => expect(result.current.globalBonusCounters).toHaveLength(1));
    expect(result.current.globalBonusCounters[0]).toEqual({
      key: "gb_2",
      label: "Criatividade",
      points: 3,
    });
  });

  it("never lets a bonus rule reach the penalty list, or vice versa", async () => {
    const penalties = renderHook(() => useGlobalPenaltyCounters(), { wrapper });
    const bonuses = renderHook(() => useGlobalBonusCounters(), { wrapper });

    await waitFor(() => expect(penalties.result.current.globalPenaltyCounters).toHaveLength(1));
    await waitFor(() => expect(bonuses.result.current.globalBonusCounters).toHaveLength(1));

    const penaltyKeys = penalties.result.current.globalPenaltyCounters.map((c) => c.key);
    const bonusKeys = bonuses.result.current.globalBonusCounters.map((c) => c.key);
    expect(penaltyKeys).not.toContain("gb_2");
    expect(bonusKeys).not.toContain("g_1");
  });

  it("tolerates an empty response", async () => {
    vi.mocked(listDynamicRules).mockResolvedValue({ data: undefined } as never);
    const { result } = renderHook(() => useGlobalBonusCounters(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.globalBonusCounters).toEqual([]);
  });
});

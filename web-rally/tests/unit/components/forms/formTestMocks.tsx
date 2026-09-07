/**
 * Shared module mocks for the activity-form test files.
 *
 * Every form test needs the same four stubs (theme button, the two global
 * counter hooks, toasts) plus a settings hook it can steer per test. Keeping
 * them here lets each test file register them with a one-line `vi.mock`
 * factory instead of repeating the same thirty-line preamble.
 *
 * The factories are async so a test file can `vi.mock(..., () =>
 * import("./formTestMocks").then(...))`: `vi.mock` is hoisted above the
 * imports, so the module has to be pulled in from inside the factory rather
 * than referenced from the file scope.
 */
import type { ComponentProps } from "react";
import { vi } from "vitest";
import type { Team } from "@/types/forms";

/** Steer the settings a form sees: `mockUseRallySettings.mockReturnValue(...)`. */
export const mockUseRallySettings = vi.fn();

export const mockToast = { error: vi.fn(), success: vi.fn() };

export const bloodyMock = {
  BloodyButton: (props: ComponentProps<"button">) => <button {...props} />,
};

export const globalPenaltyCountersMock = {
  useGlobalPenaltyCounters: () => ({ globalPenaltyCounters: [], isLoading: false }),
  default: () => ({ globalPenaltyCounters: [], isLoading: false }),
  globalCounterKey: (id: number) => `g_${id}`,
};

export const globalBonusCountersMock = {
  useGlobalBonusCounters: () => ({ globalBonusCounters: [], isLoading: false }),
  default: () => ({ globalBonusCounters: [], isLoading: false }),
  globalBonusKey: (id: number) => `gb_${id}`,
};

export const rallySettingsMock = { default: () => mockUseRallySettings() };

export const toastMock = { useAppToast: () => mockToast };

export const mockTeam = { id: 1, name: "Team A", num_members: 4 } as unknown as Team;

/** A pub-crawl event: drinking mechanics on, with prices configured. */
export function drinkingSettings(perMember = 1) {
  return {
    settings: {
      raw_settings: {
        extra_shots_penalty_per_member: perMember,
        penalty_values: { vomit: 50, not_drinking: 20 },
      },
    },
  };
}

/** A peddy-paper event: no shots, no drinking penalties, whatever the prices. */
export function peddyPaperSettings() {
  return { settings: { ...drinkingSettings().settings, event_type: "peddy_paper" } };
}

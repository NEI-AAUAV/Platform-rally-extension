/**
 * Shared module mocks for the activity-form test files.
 *
 * Every form test needs the same stubs — the theme button, the two global
 * counter hooks, toasts — plus a settings hook it can steer per test. The
 * `vi.mock` calls live here rather than in each test file: importing this
 * module registers them, so a test file's whole preamble is one import.
 *
 * That works because `vi.mock` registers against the module graph, not the
 * calling file, and this module is evaluated before the component under test
 * as long as the import comes first. The mocked hooks are only ever imported
 * by the components, never by the test bodies, so there is no ordering hazard.
 */
import type { ComponentProps } from "react";
import { screen } from "@testing-library/react";
import { expect, vi } from "vitest";
import type { Team } from "@/types/forms";

/** Steer the settings a form sees: `mockUseRallySettings.mockReturnValue(...)`. */
export const mockUseRallySettings = vi.fn();

export const mockToast = {
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};

vi.mock("@/components/themes/bloody", () => ({
  BloodyButton: (props: ComponentProps<"button">) => <button {...props} />,
}));

vi.mock("@/hooks/useGlobalPenaltyCounters", () => ({
  useGlobalPenaltyCounters: () => ({ globalPenaltyCounters: [], isLoading: false }),
  default: () => ({ globalPenaltyCounters: [], isLoading: false }),
  globalCounterKey: (id: number) => `g_${id}`,
}));

vi.mock("@/hooks/useGlobalBonusCounters", () => ({
  useGlobalBonusCounters: () => ({ globalBonusCounters: [], isLoading: false }),
  default: () => ({ globalBonusCounters: [], isLoading: false }),
  globalBonusKey: (id: number) => `gb_${id}`,
}));

vi.mock("@/hooks/useRallySettings", () => ({ default: () => mockUseRallySettings() }));

vi.mock("@/hooks/use-toast", () => ({ useAppToast: () => mockToast }));

export const mockTeam = { id: 1, name: "Team A", num_members: 4 } as unknown as Team;

/** An event with the drinking mechanics priced at zero. */
export function noDrinkingSettings() {
  return {
    settings: { raw_settings: { extra_shots_penalty_per_member: 0, penalty_values: {} } },
  };
}

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

/**
 * Assert a form shows none of the drinking mechanics — what every activity
 * form must do in a peddy-paper event, where the server prices extra shots
 * and drinking penalties at zero.
 */
export function expectNoDrinkingFields() {
  expect(screen.queryByLabelText("Shots extra")).not.toBeInTheDocument();
  expect(screen.queryByText("Penalizações")).not.toBeInTheDocument();
}

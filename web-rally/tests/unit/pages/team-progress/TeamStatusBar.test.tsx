import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import TeamStatusBar from "@/pages/team-progress/TeamStatusBar";
import type { PrivilegedDetailedTeam } from "@/client";

// useEventTerms pulls from useRallySettings (React Query), which needs a
// QueryClientProvider this test doesn't set up.
vi.mock("@/hooks/useEventTerms", () => ({
  default: () => ({
    checkpoint: "tasca",
    checkpoints: "postos",
    activity: "desafio",
    activities: "desafios",
    event: "rally",
    checkpointGender: "f",
  }),
}));

const baseTeam = {
  name: "Team Alpha",
  access_code: "ABC123",
  total: 150,
} as PrivilegedDetailedTeam;

describe("TeamStatusBar", () => {
  it("renders name, initials and progress", () => {
    render(
      <TeamStatusBar
        team={baseTeam}
        showScore
        showRanking
        rank={2}
        resolvedCount={3}
        totalCount={5}
      />,
    );
    expect(screen.getByRole("heading", { name: "Team Alpha" })).toBeInTheDocument();
    expect(screen.getByText("TA")).toBeInTheDocument();
    expect(screen.getByText("3/5 postos")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3");
  });

  it("does not print the access code (it lives in the Equipa view)", () => {
    render(
      <TeamStatusBar
        team={baseTeam}
        showScore
        showRanking
        rank={2}
        resolvedCount={0}
        totalCount={5}
      />,
    );
    expect(screen.queryByText(/ABC123/)).not.toBeInTheDocument();
  });

  it("shows ranking and score when enabled", () => {
    render(
      <TeamStatusBar
        team={baseTeam}
        showScore
        showRanking
        rank={2}
        resolvedCount={0}
        totalCount={5}
      />,
    );
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
  });

  it("shows a dash while the rank is unknown", () => {
    render(
      <TeamStatusBar
        team={baseTeam}
        showScore={false}
        showRanking
        rank={null}
        resolvedCount={0}
        totalCount={5}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("hides ranking and score when disabled", () => {
    render(
      <TeamStatusBar
        team={baseTeam}
        showScore={false}
        showRanking={false}
        rank={2}
        resolvedCount={0}
        totalCount={5}
      />,
    );
    expect(screen.queryByText("#2")).not.toBeInTheDocument();
    expect(screen.queryByText("150")).not.toBeInTheDocument();
  });

  it("shows the final time for a finished team", () => {
    render(
      <TeamStatusBar
        team={
          {
            ...baseTeam,
            started_at: "2026-01-01T10:00:00Z",
            finished_at: "2026-01-01T11:00:00Z",
            elapsed_seconds: 3600,
          } as PrivilegedDetailedTeam
        }
        showScore
        showRanking
        rank={1}
        resolvedCount={5}
        totalCount={5}
      />,
    );
    expect(screen.getByText(/Tempo final/)).toBeInTheDocument();
  });
});

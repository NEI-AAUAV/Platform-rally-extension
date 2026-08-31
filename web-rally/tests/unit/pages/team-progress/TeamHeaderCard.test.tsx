import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import TeamHeaderCard from "@/pages/team-progress/TeamHeaderCard";
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
  classification: 2,
  total: 150,
} as PrivilegedDetailedTeam;

describe("TeamHeaderCard", () => {
  it("renders team name, initials, and access code", () => {
    render(
      <TeamHeaderCard
        team={baseTeam}
        showScore
        showRanking
        rank={2}
        completedCount={3}
        totalCount={5}
      />,
    );
    expect(screen.getByText("Team Alpha")).toBeInTheDocument();
    expect(screen.getByText("TA")).toBeInTheDocument();
    expect(screen.getByText("Código: ABC123")).toBeInTheDocument();
    expect(screen.getByText("3/5")).toBeInTheDocument();
  });

  it("shows ranking and score when enabled", () => {
    render(
      <TeamHeaderCard
        team={baseTeam}
        showScore
        showRanking
        rank={2}
        completedCount={0}
        totalCount={5}
      />,
    );
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
  });

  it("hides ranking and score when disabled", () => {
    render(
      <TeamHeaderCard
        team={baseTeam}
        showScore={false}
        showRanking={false}
        rank={2}
        completedCount={0}
        totalCount={5}
      />,
    );
    expect(screen.queryByText("#2")).not.toBeInTheDocument();
    expect(screen.queryByText("Pontos")).not.toBeInTheDocument();
  });

  it("does not render access code when absent", () => {
    const teamNoCode = { ...baseTeam, access_code: undefined } as unknown as PrivilegedDetailedTeam;
    render(
      <TeamHeaderCard
        team={teamNoCode}
        showScore
        showRanking
        rank={2}
        completedCount={0}
        totalCount={5}
      />,
    );
    expect(screen.queryByText(/Código:/)).not.toBeInTheDocument();
  });
});

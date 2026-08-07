import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import RouteFinishedCard from "@/pages/team-progress/RouteFinishedCard";

const { mockUseEventTerms } = vi.hoisted(() => ({ mockUseEventTerms: vi.fn() }));

vi.mock("@/hooks/useEventTerms", () => ({ default: () => mockUseEventTerms() }));

describe("RouteFinishedCard", () => {
  beforeEach(() => {
    mockUseEventTerms.mockReturnValue({
      checkpoint: "posto",
      checkpoints: "postos",
      activity: "desafio",
      activities: "desafios",
      event: "peddy-paper",
      checkpointGender: "m",
    });
  });

  it("says the route is over", () => {
    render(<RouteFinishedCard completedCount={5} totalCount={5} showScore={false} total={120} />);

    // Without this the card that carried the whole game just disappears.
    expect(screen.getByText("Chegaram ao fim!")).toBeInTheDocument();
    expect(screen.getByText(/5 de 5 postos/)).toBeInTheDocument();
  });

  it("shows the score when the event reveals scores", () => {
    render(<RouteFinishedCard completedCount={5} totalCount={5} showScore total={120} />);

    expect(screen.getByText("120")).toBeInTheDocument();
  });

  it("hides the score when the event does not", () => {
    render(<RouteFinishedCard completedCount={5} totalCount={5} showScore={false} total={120} />);

    expect(screen.queryByText("120")).not.toBeInTheDocument();
  });

  it("uses the event's own terminology", () => {
    mockUseEventTerms.mockReturnValue({
      checkpoint: "tasca",
      checkpoints: "tascas",
      activity: "prova",
      activities: "provas",
      event: "rally",
      checkpointGender: "f",
    });

    render(<RouteFinishedCard completedCount={3} totalCount={4} showScore={false} total={0} />);

    expect(screen.getByText(/3 de 4 tascas/)).toBeInTheDocument();
  });

  it("warns that the standings are not final", () => {
    render(<RouteFinishedCard completedCount={5} totalCount={5} showScore total={120} />);

    // A team that gave up on a post, or is waiting on a judgement, would
    // otherwise read this as their final position.
    expect(screen.getByText(/só fecha quando o staff terminar/)).toBeInTheDocument();
  });
});

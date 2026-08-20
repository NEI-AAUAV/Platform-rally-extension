import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import CheckpointDetailsPanel from "@/pages/admin/components/checkpoints/CheckpointDetailsPanel";

vi.mock("@/pages/admin/components/checkpoints/CheckpointMediaManager", () => ({
  default: ({ checkpointId }: { checkpointId: number }) => (
    <div data-testid="media-manager">media-{checkpointId}</div>
  ),
}));

vi.mock("@/pages/admin/components/checkpoints/CheckpointGuideIndicationsManager", () => ({
  default: ({ checkpointId }: { checkpointId: number }) => (
    <div data-testid="guide-manager">guide-{checkpointId}</div>
  ),
}));

vi.mock("@/pages/admin/components/checkpoints/CheckpointActivitiesManager", () => ({
  default: ({ checkpointId }: { checkpointId: number }) => (
    <div data-testid="activities-manager">activities-{checkpointId}</div>
  ),
}));

describe("CheckpointDetailsPanel", () => {
  it("shows a disabled hint when there is no checkpoint yet", () => {
    render(<CheckpointDetailsPanel checkpointId={null} />);
    expect(
      screen.getByText(/Começar a preencher/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("media-manager")).not.toBeInTheDocument();
  });

  it("renders activities, media and guide-hint managers once a checkpoint exists", () => {
    render(<CheckpointDetailsPanel checkpointId={5} />);
    expect(screen.getByTestId("activities-manager")).toHaveTextContent("activities-5");
    expect(screen.getByTestId("media-manager")).toHaveTextContent("media-5");
    expect(screen.getByTestId("guide-manager")).toHaveTextContent("guide-5");
  });

  it("names the checkpoint it is attached to, so it stays clear after the form resets", () => {
    render(<CheckpointDetailsPanel checkpointId={5} checkpointName="Posto 1" />);
    expect(screen.getByText("Posto 1")).toBeInTheDocument();
  });
});

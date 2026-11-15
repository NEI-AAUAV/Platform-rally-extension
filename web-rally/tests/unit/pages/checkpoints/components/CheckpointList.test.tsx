import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import CheckpointList from "@/pages/checkpoints/components/CheckpointList";

vi.mock("@/hooks/useCheckpointMedia", () => ({
  useCheckpointMedia: () => ({ photos: [], funFacts: [] }),
}));

vi.mock("@/hooks/useEventTerms", () => ({
  default: () => ({ checkpoint: "tasca", checkpoints: "tascas", checkpointGender: "f" }),
}));

vi.mock("@/components/shared", () => ({
  Spinner: () => <div data-testid="spinner" />,
  CheckpointDiscovery: () => <div>Discovery</div>,
  EmptyState: ({ title, description }: { title: string; description: string }) => (
    <div>
      {title} - {description}
    </div>
  ),
}));

describe("CheckpointList", () => {
  it("appends the upcoming placeholder when posts are withheld", () => {
    render(
      <CheckpointList
        checkpoints={[{ id: 1, name: "Meia-Lua", order: 1 }]}
        selectedCheckpoint={null}
        onSelectCheckpoint={vi.fn()}
        hasHiddenCheckpoints
      />,
    );
    expect(screen.getByText("Meia-Lua")).toBeInTheDocument();
    expect(screen.getByText("Mais tascas por revelar")).toBeInTheDocument();
    expect(
      screen.getByText("As restantes tascas revelam-se à medida que o percurso decorre."),
    ).toBeInTheDocument();
  });

  it("omits the upcoming placeholder by default", () => {
    render(
      <CheckpointList
        checkpoints={[{ id: 1, name: "Meia-Lua", order: 1 }]}
        selectedCheckpoint={null}
        onSelectCheckpoint={vi.fn()}
      />,
    );
    expect(screen.queryByText("Mais tascas por revelar")).not.toBeInTheDocument();
  });

  it("shows the placeholder instead of the empty state when everything is withheld", () => {
    render(
      <CheckpointList
        checkpoints={[]}
        selectedCheckpoint={null}
        onSelectCheckpoint={vi.fn()}
        hasHiddenCheckpoints
      />,
    );
    expect(screen.queryByText(/Nenhum posto disponível/)).not.toBeInTheDocument();
    expect(screen.getByText("Mais tascas por revelar")).toBeInTheDocument();
  });

  it("renders empty state when no checkpoints", () => {
    render(
      <CheckpointList checkpoints={[]} selectedCheckpoint={null} onSelectCheckpoint={vi.fn()} />,
    );
    expect(screen.getByText(/Nenhum posto disponível/)).toBeInTheDocument();
  });

  it("renders a card per checkpoint and marks the selected one", () => {
    const checkpoints = [
      { id: 1, name: "Checkpoint A", order: 1 },
      { id: 2, name: "Checkpoint B", order: 2 },
    ];
    render(
      <CheckpointList
        checkpoints={checkpoints}
        selectedCheckpoint={checkpoints[1] ?? null}
        onSelectCheckpoint={vi.fn()}
      />,
    );
    expect(screen.getByText("Checkpoint A")).toBeInTheDocument();
    expect(screen.getByText("Checkpoint B")).toBeInTheDocument();
    expect(screen.getByLabelText("Selecionar posto Checkpoint B")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

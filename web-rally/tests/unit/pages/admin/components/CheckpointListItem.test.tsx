import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CheckpointListItem from "@/pages/admin/components/checkpoints/CheckpointListItem";

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

const checkpoint = {
  id: 1,
  name: "Checkpoint A",
  description: "Some description",
  order: 1,
  latitude: null,
  longitude: null,
  arrival_radius_m: null,
} as any;

const baseProps = {
  checkpoint,
  isDragging: false,
  isDeleting: false,
  onDragStart: vi.fn(),
  onDragOver: vi.fn(),
  onDrop: vi.fn(),
  onDragEnd: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
};

describe("CheckpointListItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders checkpoint name, order and description", () => {
    render(
      <ul>
        <CheckpointListItem {...baseProps} />
      </ul>,
    );
    expect(screen.getByText("Checkpoint A")).toBeInTheDocument();
    expect(screen.getByText("Some description")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders coordinates when latitude/longitude present", () => {
    render(
      <ul>
        <CheckpointListItem
          {...baseProps}
          checkpoint={{ ...checkpoint, latitude: 38.7, longitude: -9.1, arrival_radius_m: 25 }}
        />
      </ul>,
    );
    expect(screen.getByText(/38.7, -9.1/)).toBeInTheDocument();
    expect(screen.getByText(/raio 25m/)).toBeInTheDocument();
  });

  it("applies dragging style when isDragging is true", () => {
    const { container } = render(
      <ul>
        <CheckpointListItem {...baseProps} isDragging />
      </ul>,
    );
    expect(container.querySelector(".opacity-50")).toBeInTheDocument();
  });

  it("calls onEdit when edit button clicked", () => {
    render(
      <ul>
        <CheckpointListItem {...baseProps} />
      </ul>,
    );
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[1]!);
    expect(baseProps.onEdit).toHaveBeenCalledWith(checkpoint);
  });

  it("calls onDelete when delete button clicked", () => {
    render(
      <ul>
        <CheckpointListItem {...baseProps} />
      </ul>,
    );
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[2]!);
    expect(baseProps.onDelete).toHaveBeenCalledWith(1);
  });

  it("disables delete button when isDeleting is true", () => {
    render(
      <ul>
        <CheckpointListItem {...baseProps} isDeleting />
      </ul>,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons[2]).toBeDisabled();
  });

  it("toggles media/guide managers on click of the photos button", () => {
    render(
      <ul>
        <CheckpointListItem {...baseProps} />
      </ul>,
    );
    expect(screen.queryByTestId("media-manager")).not.toBeInTheDocument();
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]!);
    expect(screen.getByTestId("media-manager")).toBeInTheDocument();
    expect(screen.getByTestId("guide-manager")).toBeInTheDocument();
    fireEvent.click(buttons[0]!);
    expect(screen.queryByTestId("media-manager")).not.toBeInTheDocument();
  });

  it("also renders the activities manager once expanded", () => {
    render(
      <ul>
        <CheckpointListItem {...baseProps} />
      </ul>,
    );
    fireEvent.click(screen.getAllByRole("button")[0]!);
    expect(screen.getByTestId("activities-manager")).toBeInTheDocument();
  });

  it("opens straight away when forceExpanded, and can still be closed", () => {
    render(
      <ul>
        <CheckpointListItem {...baseProps} forceExpanded />
      </ul>,
    );
    expect(screen.getByTestId("media-manager")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button")[0]!);
    expect(screen.queryByTestId("media-manager")).not.toBeInTheDocument();
  });

  it("calls drag handlers", () => {
    render(
      <ul>
        <CheckpointListItem {...baseProps} />
      </ul>,
    );
    const li = screen.getByLabelText("Checkpoint Checkpoint A, ordem 1");
    fireEvent.dragStart(li);
    fireEvent.dragOver(li);
    fireEvent.drop(li);
    fireEvent.dragEnd(li);
    expect(baseProps.onDragStart).toHaveBeenCalled();
    expect(baseProps.onDragOver).toHaveBeenCalled();
    expect(baseProps.onDrop).toHaveBeenCalled();
    expect(baseProps.onDragEnd).toHaveBeenCalled();
  });

  it("marks a draft as invisible to teams", () => {
    render(
      <ul>
        <CheckpointListItem
          {...baseProps}
          checkpoint={{ ...checkpoint, is_draft: true, is_placeholder: true }}
        />
      </ul>,
    );

    expect(screen.getByText("Rascunho — invisível para as equipas")).toBeInTheDocument();
    expect(screen.getByText("Nome provisório")).toBeInTheDocument();
  });

  it("lists what the post still lacks", () => {
    render(
      <ul>
        <CheckpointListItem
          {...baseProps}
          checkpoint={{ ...checkpoint, missing: ["clue", "staff"] }}
        />
      </ul>,
    );

    expect(screen.getByText("sem pista")).toBeInTheDocument();
    expect(screen.getByText("sem staff")).toBeInTheDocument();
  });

  it("shows no readiness list for a complete post", () => {
    render(
      <ul>
        <CheckpointListItem {...baseProps} checkpoint={{ ...checkpoint, missing: [] }} />
      </ul>,
    );

    expect(screen.queryByText("sem pista")).not.toBeInTheDocument();
  });

  it("shows the stage name when the post has one", () => {
    const stages = [
      {
        id: 5,
        name: "Universidade",
        order: 1,
        order_matters: true,
        required_count: null,
        checkpoint_ids: [],
      },
    ];

    render(
      <ul>
        <CheckpointListItem
          {...baseProps}
          checkpoint={{ ...checkpoint, stage_id: 5 }}
          stages={stages as any}
        />
      </ul>,
    );

    expect(screen.getByText(/Universidade/)).toBeInTheDocument();
  });

  it("shows no stage line when the post has none", () => {
    render(
      <ul>
        <CheckpointListItem
          {...baseProps}
          checkpoint={{ ...checkpoint, stage_id: null }}
          stages={[]}
        />
      </ul>,
    );

    expect(screen.queryByText(/🧭/)).not.toBeInTheDocument();
  });

  it("shows the opening window", () => {
    render(
      <ul>
        <CheckpointListItem
          {...baseProps}
          checkpoint={{
            ...checkpoint,
            available_from: "2026-08-09T22:00:00Z",
            available_until: "2026-08-10T02:00:00Z",
          }}
        />
      </ul>,
    );

    expect(screen.getByText(/🕒/)).toBeInTheDocument();
  });

  it("flags a window that is not open right now", () => {
    render(
      <ul>
        <CheckpointListItem
          {...baseProps}
          checkpoint={{ ...checkpoint, available_from: "2099-01-01T22:00:00Z" }}
        />
      </ul>,
    );

    expect(screen.getByText(/🕒/)).toHaveClass("text-amber-600");
  });
});

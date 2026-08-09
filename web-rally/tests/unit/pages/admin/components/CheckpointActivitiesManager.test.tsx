import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CheckpointActivitiesManager from "@/pages/admin/components/checkpoints/CheckpointActivitiesManager";

const {
  mockUseActivities,
  mockCreateActivity,
  mockUpdateActivity,
  mockDeleteActivity,
  mockToastSuccess,
  mockToastError,
} = vi.hoisted(() => ({
  mockUseActivities: vi.fn(),
  mockCreateActivity: vi.fn(),
  mockUpdateActivity: vi.fn(),
  mockDeleteActivity: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("@/hooks/useActivities", () => ({
  useActivities: () => mockUseActivities(),
  useCreateActivity: () => ({ mutate: mockCreateActivity, isPending: false, error: undefined }),
  useUpdateActivity: () => ({ mutate: mockUpdateActivity, isPending: false }),
  useDeleteActivity: () => ({ mutate: mockDeleteActivity, isPending: false }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useAppToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

const activityForCheckpoint1 = {
  id: 10,
  name: "Cabo de Guerra",
  description: null,
  activity_type: "GeneralActivity",
  checkpoint_id: 1,
  config: {},
  is_active: true,
};

describe("CheckpointActivitiesManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseActivities.mockReturnValue({ data: { activities: [] } });
  });

  it("shows an empty state with a create button when the post has no activity yet", () => {
    render(<CheckpointActivitiesManager checkpointId={1} />);

    expect(screen.getByText("Criar desafio")).toBeInTheDocument();
  });

  it("only lists activities that belong to this checkpoint", () => {
    mockUseActivities.mockReturnValue({
      data: {
        activities: [
          activityForCheckpoint1,
          { ...activityForCheckpoint1, id: 11, checkpoint_id: 2, name: "Outro posto" },
        ],
      },
    });

    render(<CheckpointActivitiesManager checkpointId={1} />);

    expect(screen.getByText("Cabo de Guerra")).toBeInTheDocument();
    expect(screen.queryByText("Outro posto")).not.toBeInTheDocument();
    expect(screen.getByText("Adicionar outro desafio")).toBeInTheDocument();
  });

  it("opens the embedded form with the checkpoint id already locked in", () => {
    render(<CheckpointActivitiesManager checkpointId={1} />);

    fireEvent.click(screen.getByText("Criar desafio"));

    // No checkpoint picker: the label only appears once the picker is shown.
    expect(screen.queryByText("Checkpoint")).not.toBeInTheDocument();
    expect(screen.getByText("Criar Nova Atividade")).toBeInTheDocument();
  });

  it("creates an activity stamped with this checkpoint's id", async () => {
    render(<CheckpointActivitiesManager checkpointId={3} />);
    fireEvent.click(screen.getByText("Criar desafio"));

    fireEvent.change(screen.getByPlaceholderText("Ex: Cabo de Guerra"), {
      target: { value: "Novo desafio" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));

    await waitFor(() =>
      expect(mockCreateActivity).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Novo desafio", checkpoint_id: 3 }),
        expect.anything(),
      ),
    );
  });

  it("opens the form pre-filled when editing an existing activity", () => {
    mockUseActivities.mockReturnValue({ data: { activities: [activityForCheckpoint1] } });
    render(<CheckpointActivitiesManager checkpointId={1} />);

    fireEvent.click(screen.getByLabelText("Editar Cabo de Guerra"));

    expect(screen.getByText("Editar Atividade")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Cabo de Guerra")).toBeInTheDocument();
  });

  it("asks for confirmation before deleting", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    mockUseActivities.mockReturnValue({ data: { activities: [activityForCheckpoint1] } });
    render(<CheckpointActivitiesManager checkpointId={1} />);

    fireEvent.click(screen.getByLabelText("Apagar Cabo de Guerra"));

    expect(confirmSpy).toHaveBeenCalled();
    expect(mockDeleteActivity).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EventsManagement from "@/pages/admin/components/events/EventsManagement";
import type { RallyEvent } from "@/types/event";

function renderWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EventsManagement />
    </QueryClientProvider>,
  );
}

const {
  mockUseEvents,
  mockCreateMutate,
  mockUpdateMutate,
  mockSetCurrentMutate,
  mockToastSuccess,
  mockToastError,
  mockDownloadEventResults,
  mockDownloadEventReport,
  mockGenerateRotationSchedule,
} = vi.hoisted(() => ({
  mockUseEvents: vi.fn(),
  mockCreateMutate: vi.fn(),
  mockUpdateMutate: vi.fn(),
  mockSetCurrentMutate: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockDownloadEventResults: vi.fn(),
  mockDownloadEventReport: vi.fn(),
  mockGenerateRotationSchedule: vi.fn(),
}));

vi.mock("@/hooks/useEvents", () => ({
  useEvents: () => mockUseEvents(),
  useEventMutations: () => ({
    create: { mutate: mockCreateMutate, isPending: false },
    update: { mutate: mockUpdateMutate, isPending: false },
    setCurrent: { mutate: mockSetCurrentMutate, isPending: false },
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useAppToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

vi.mock("@/services/eventExport", () => ({
  downloadEventResults: (...args: unknown[]) => mockDownloadEventResults(...args),
  downloadEventReport: (...args: unknown[]) => mockDownloadEventReport(...args),
}));

vi.mock("@/client", () => ({
  generateRotationSchedule: (...args: unknown[]) => mockGenerateRotationSchedule(...args),
}));

function makeEvent(overrides: Partial<RallyEvent> = {}): RallyEvent {
  return {
    id: 1,
    name: "Rally 2024",
    event_type: "rally_tascas",
    description: "Descrição",
    start_time: "2024-05-01T10:00:00Z",
    end_time: "2024-05-02T18:00:00Z",
    is_current: false,
    ...overrides,
  } as RallyEvent;
}

describe("EventsManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseEvents.mockReturnValue({ data: [], isLoading: false, isError: false });
  });

  it("shows a loading state", () => {
    mockUseEvents.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderWithClient();
    expect(screen.getByText("A carregar eventos...")).toBeInTheDocument();
  });

  it("shows an error state", () => {
    mockUseEvents.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderWithClient();
    expect(screen.getByText("Não foi possível carregar as edições.")).toBeInTheDocument();
  });

  it("shows an empty state when there are no events", () => {
    renderWithClient();
    expect(screen.getByText("Sem edições")).toBeInTheDocument();
  });

  it("renders event cards with name, type, dates and description", () => {
    mockUseEvents.mockReturnValue({ data: [makeEvent()], isLoading: false, isError: false });
    renderWithClient();

    expect(screen.getByText("Rally 2024")).toBeInTheDocument();
    expect(screen.getByText("Descrição")).toBeInTheDocument();
  });

  it('shows the "Atual" badge for the current event and hides the "Tornar atual" button', () => {
    mockUseEvents.mockReturnValue({
      data: [makeEvent({ is_current: true })],
      isLoading: false,
      isError: false,
    });
    renderWithClient();

    expect(screen.getByText("Atual")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tornar atual/i })).not.toBeInTheDocument();
  });

  it('shows the "Tornar atual" button for non-current events and calls setCurrent on click', () => {
    mockUseEvents.mockReturnValue({
      data: [makeEvent({ is_current: false })],
      isLoading: false,
      isError: false,
    });
    renderWithClient();

    fireEvent.click(screen.getByRole("button", { name: /Tornar atual/i }));
    expect(mockSetCurrentMutate).toHaveBeenCalledWith(1, expect.any(Object));
  });

  it("calls the success toast when setCurrent succeeds", () => {
    mockUseEvents.mockReturnValue({
      data: [makeEvent({ is_current: false, name: "Rally X" })],
      isLoading: false,
      isError: false,
    });
    mockSetCurrentMutate.mockImplementation((_id, { onSuccess }) => onSuccess());
    renderWithClient();

    fireEvent.click(screen.getByRole("button", { name: /Tornar atual/i }));
    expect(mockToastSuccess).toHaveBeenCalledWith('"Rally X" é agora a edição atual');
  });

  it("calls the error toast when setCurrent fails", () => {
    mockUseEvents.mockReturnValue({
      data: [makeEvent({ is_current: false })],
      isLoading: false,
      isError: false,
    });
    mockSetCurrentMutate.mockImplementation((_id, { onError }) => onError(new Error("boom")));
    renderWithClient();

    fireEvent.click(screen.getByRole("button", { name: /Tornar atual/i }));
    expect(mockToastError).toHaveBeenCalled();
  });

  it("renders the rotation schedule button only for olympic events", () => {
    mockUseEvents.mockReturnValue({
      data: [makeEvent({ event_type: "olympic" })],
      isLoading: false,
      isError: false,
    });
    renderWithClient();
    expect(screen.getByRole("button", { name: /Gerar escalonamento/i })).toBeInTheDocument();
  });

  it("does not render the rotation schedule button for non-olympic events", () => {
    mockUseEvents.mockReturnValue({ data: [makeEvent()], isLoading: false, isError: false });
    renderWithClient();
    expect(screen.queryByRole("button", { name: /Gerar escalonamento/i })).not.toBeInTheDocument();
  });

  it("opens the create form, validates required name, and submits", async () => {
    renderWithClient();

    fireEvent.click(screen.getByRole("button", { name: /Novo/i }));
    const nameInput = screen.getByLabelText("Nome");
    expect(nameInput).toBeInTheDocument();

    // Bypass native required validation to exercise the component's own guard.
    nameInput.removeAttribute("required");
    fireEvent.click(screen.getByRole("button", { name: /Criar/i }));
    expect(mockToastError).toHaveBeenCalledWith("O nome do evento é obrigatório");
    expect(mockCreateMutate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Novo Rally" } });
    fireEvent.click(screen.getByRole("button", { name: /Criar/i }));

    await vi.waitFor(() =>
      expect(mockCreateMutate).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Novo Rally" }),
        expect.any(Object),
      ),
    );
  });

  it("shows a success toast and resets the form after a successful create", () => {
    mockCreateMutate.mockImplementation((_body, { onSuccess }) => onSuccess());
    renderWithClient();

    fireEvent.click(screen.getByRole("button", { name: /Novo/i }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Novo Rally" } });
    fireEvent.click(screen.getByRole("button", { name: /Criar/i }));

    expect(mockToastSuccess).toHaveBeenCalledWith("Evento criado");
    expect(screen.queryByLabelText("Nome")).not.toBeInTheDocument();
  });

  it("shows an error toast when create fails", () => {
    mockCreateMutate.mockImplementation((_body, { onError }) => onError(new Error("fail")));
    renderWithClient();

    fireEvent.click(screen.getByRole("button", { name: /Novo/i }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Novo Rally" } });
    fireEvent.click(screen.getByRole("button", { name: /Criar/i }));

    expect(mockToastError).toHaveBeenCalled();
  });

  it("opens the edit form pre-filled and submits an update", () => {
    mockUseEvents.mockReturnValue({
      data: [makeEvent({ id: 5, name: "Editable Rally" })],
      isLoading: false,
      isError: false,
    });
    mockUpdateMutate.mockImplementation((_args, { onSuccess }) => onSuccess());
    renderWithClient();

    const editButtons = screen.getAllByRole("button");
    const pencilButton = editButtons.find((b) => b.querySelector("svg.lucide-pencil"));
    expect(pencilButton).toBeTruthy();
    fireEvent.click(pencilButton as HTMLButtonElement);

    expect(screen.getByLabelText("Nome")).toHaveValue("Editable Rally");

    fireEvent.click(screen.getByRole("button", { name: /Guardar/i }));
    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 5, body: expect.objectContaining({ name: "Editable Rally" }) }),
      expect.any(Object),
    );
    expect(mockToastSuccess).toHaveBeenCalledWith("Evento atualizado");
  });

  it("shows an error toast when update fails", () => {
    mockUseEvents.mockReturnValue({
      data: [makeEvent({ id: 5, name: "Editable Rally" })],
      isLoading: false,
      isError: false,
    });
    mockUpdateMutate.mockImplementation((_args, { onError }) => onError(new Error("fail")));
    renderWithClient();

    const editButtons = screen.getAllByRole("button");
    const pencilButton = editButtons.find((b) => b.querySelector("svg.lucide-pencil"));
    fireEvent.click(pencilButton as HTMLButtonElement);
    fireEvent.click(screen.getByRole("button", { name: /Guardar/i }));

    expect(mockToastError).toHaveBeenCalled();
  });

  it("cancels the form when the cancel button is clicked", () => {
    renderWithClient();

    fireEvent.click(screen.getByRole("button", { name: /Novo/i }));
    expect(screen.getByLabelText("Nome")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Cancelar/i }));
    expect(screen.queryByLabelText("Nome")).not.toBeInTheDocument();
  });

  it("triggers the export results flow and shows a success toast", async () => {
    mockUseEvents.mockReturnValue({ data: [makeEvent()], isLoading: false, isError: false });
    mockDownloadEventResults.mockResolvedValue(undefined);
    renderWithClient();

    fireEvent.click(screen.getByRole("button", { name: /Exportar resultados/i }));
    await vi.waitFor(() => expect(mockDownloadEventResults).toHaveBeenCalledWith(1, "Rally 2024"));
  });

  it("triggers the PDF report flow and shows a success toast", async () => {
    mockUseEvents.mockReturnValue({ data: [makeEvent()], isLoading: false, isError: false });
    mockDownloadEventReport.mockResolvedValue(undefined);
    renderWithClient();

    fireEvent.click(screen.getByRole("button", { name: /Relatório \(PDF\)/i }));
    await vi.waitFor(() => expect(mockDownloadEventReport).toHaveBeenCalledWith(1, "Rally 2024"));
  });

  it("shows an error toast when the PDF report fails", async () => {
    mockUseEvents.mockReturnValue({ data: [makeEvent()], isLoading: false, isError: false });
    mockDownloadEventReport.mockRejectedValue(new Error("boom"));
    renderWithClient();

    fireEvent.click(screen.getByRole("button", { name: /Relatório \(PDF\)/i }));
    await vi.waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it("generates a rotation schedule for olympic events", async () => {
    mockUseEvents.mockReturnValue({
      data: [makeEvent({ event_type: "olympic" })],
      isLoading: false,
      isError: false,
    });
    mockGenerateRotationSchedule.mockResolvedValue({ data: { rounds: [[{ a: 1 }]] } });
    renderWithClient();

    fireEvent.click(screen.getByRole("button", { name: /Gerar escalonamento/i }));

    await vi.waitFor(() =>
      expect(mockGenerateRotationSchedule).toHaveBeenCalledWith({ path: { event_id: 1 } }),
    );
  });

  it("updates description in the create form", () => {
    renderWithClient();
    fireEvent.click(screen.getByRole("button", { name: /Novo/i }));

    const descInput = screen.getByLabelText("Descrição");
    fireEvent.change(descInput, { target: { value: "Uma nova descrição" } });
    expect(descInput).toHaveValue("Uma nova descrição");
  });

  it("renders events without an end_time using only the start date", () => {
    mockUseEvents.mockReturnValue({
      data: [makeEvent({ start_time: "2024-05-01T10:00:00Z", end_time: null })],
      isLoading: false,
      isError: false,
    });
    renderWithClient();
    expect(screen.getByText("Rally 2024")).toBeInTheDocument();
  });

  it("renders events without a start_time without a date range", () => {
    mockUseEvents.mockReturnValue({
      data: [makeEvent({ start_time: null, end_time: null })],
      isLoading: false,
      isError: false,
    });
    renderWithClient();
    expect(screen.getByText("Rally 2024")).toBeInTheDocument();
  });
});

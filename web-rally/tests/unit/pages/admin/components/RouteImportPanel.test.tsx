import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import RouteImportPanel from "@/pages/admin/components/checkpoints/RouteImportPanel";

const { mockImportRoute, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockImportRoute: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("@/client", () => ({
  importRoute: (...args: unknown[]) => mockImportRoute(...args),
}));

vi.mock("@/hooks/use-toast", () => ({
  useAppToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const PASTE = "Aristides\tFalar de desportos\tUma bola\tGirar 5x";

function renderPanel(onImported = vi.fn()) {
  render(<RouteImportPanel onImported={onImported} />, { wrapper });
  return onImported;
}

function typeRoute(text = PASTE) {
  fireEvent.change(screen.getByLabelText("Tabela da rota"), { target: { value: text } });
}

describe("RouteImportPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockImportRoute.mockResolvedValue({
      data: {
        created: 0,
        rows: [
          {
            name: "Aristides",
            staff_script: "Falar de desportos",
            clue: "Uma bola",
            challenge_brief: "Girar 5x",
            is_placeholder: false,
          },
        ],
      },
    });
  });

  it("disables both actions until something is pasted", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: "Pré-visualizar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Criar rascunhos" })).toBeDisabled();
  });

  it("previews without creating anything", async () => {
    renderPanel();
    typeRoute();

    fireEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

    await waitFor(() =>
      expect(mockImportRoute).toHaveBeenCalledWith({ body: { text: PASTE, dry_run: true } }),
    );
    expect(await screen.findByText("Aristides")).toBeInTheDocument();
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it("creates the drafts and tells the list to refresh", async () => {
    mockImportRoute.mockResolvedValue({ data: { created: 3, rows: [] } });
    const onImported = renderPanel();
    typeRoute();

    fireEvent.click(screen.getByRole("button", { name: "Criar rascunhos" }));

    await waitFor(() =>
      expect(mockImportRoute).toHaveBeenCalledWith({ body: { text: PASTE, dry_run: false } }),
    );
    await waitFor(() => expect(onImported).toHaveBeenCalled());
    expect(mockToastSuccess).toHaveBeenCalledWith("3 postos criados como rascunho");
    expect(screen.getByLabelText("Tabela da rota")).toHaveValue("");
  });

  it("says so when nothing in the text looked like a post", async () => {
    mockImportRoute.mockResolvedValue({ data: { created: 0, rows: [] } });
    renderPanel();
    typeRoute("   \n  ");
    // Whitespace-only leaves the buttons disabled, so paste real text first.
    typeRoute("lixo");

    fireEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

    expect(await screen.findByText("Nenhum posto reconhecido no texto.")).toBeInTheDocument();
  });

  it("shows an error toast when the import fails", async () => {
    mockImportRoute.mockRejectedValue(new Error("boom"));
    renderPanel();
    typeRoute();

    fireEvent.click(screen.getByRole("button", { name: "Criar rascunhos" }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it("dashes the cells the planning document left undecided", async () => {
    mockImportRoute.mockResolvedValue({
      data: {
        created: 0,
        rows: [
          {
            name: "Bar 1",
            staff_script: null,
            clue: null,
            challenge_brief: null,
            is_placeholder: true,
          },
        ],
      },
    });
    renderPanel();
    typeRoute("Bar 1");

    fireEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

    expect(await screen.findByText("(provisório)")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3);
  });
});

import { render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PostosPreview } from "@/pages/home/PostosPreview";

const { mockGetCheckpoints, mockGetCheckpointsCount, mockSettings, mockScopes } = vi.hoisted(
  () => ({
    mockGetCheckpoints: vi.fn(),
    mockGetCheckpointsCount: vi.fn(),
    mockSettings: vi.fn(),
    mockScopes: vi.fn(),
  }),
);

vi.mock("@/client", () => ({
  getCheckpoints: (...args: unknown[]) => mockGetCheckpoints(...args),
  getCheckpointsCount: (...args: unknown[]) => mockGetCheckpointsCount(...args),
}));

vi.mock("@/hooks/useRallySettings", () => ({
  default: () => ({ settings: mockSettings() }),
}));

vi.mock("@/hooks/useEventTerms", () => ({
  default: () => ({ checkpoint: "tasca", checkpoints: "tascas", checkpointGender: "f" }),
}));

vi.mock("@/stores/useUserStore", () => ({
  useUserStore: (selector: (state: unknown) => unknown) => selector({ scopes: mockScopes() }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("PostosPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings.mockReturnValue({ show_route_mode: "complete" });
    mockScopes.mockReturnValue(undefined);
    mockGetCheckpointsCount.mockResolvedValue({ data: 0 });
  });

  describe("focused route", () => {
    const oneOpen = { data: [{ id: 1, name: "Meia-Lua", order: 1 }] };

    beforeEach(() => {
      mockSettings.mockReturnValue({ show_route_mode: "focused" });
      mockGetCheckpoints.mockResolvedValue(oneOpen);
      mockGetCheckpointsCount.mockResolvedValue({ data: 5 });
    });

    it("adds a '?' card for the posts still to be revealed", async () => {
      renderWithClient(<PostosPreview enabled />);
      const card = await screen.findByRole("listitem", { name: "Mais tascas por revelar" });
      expect(card).toHaveTextContent("?");
      expect(card).toHaveTextContent(
        "As restantes tascas revelam-se à medida que o percurso decorre.",
      );
    });

    it("omits the card once every post is listed", async () => {
      mockGetCheckpointsCount.mockResolvedValue({ data: 1 });
      renderWithClient(<PostosPreview enabled />);
      expect(await screen.findByText("Meia-Lua")).toBeInTheDocument();
      await waitFor(() => expect(mockGetCheckpointsCount).toHaveBeenCalled());
      expect(screen.queryByText("Mais tascas por revelar")).not.toBeInTheDocument();
    });

    it("omits the card for staff", async () => {
      mockScopes.mockReturnValue(["rally-staff"]);
      renderWithClient(<PostosPreview enabled />);
      expect(await screen.findByText("Meia-Lua")).toBeInTheDocument();
      expect(mockGetCheckpointsCount).not.toHaveBeenCalled();
      expect(screen.queryByText("Mais tascas por revelar")).not.toBeInTheDocument();
    });
  });

  it("does not ask for the total on a complete route", async () => {
    mockGetCheckpoints.mockResolvedValue({ data: [{ id: 1, name: "Meia-Lua", order: 1 }] });
    renderWithClient(<PostosPreview enabled />);
    expect(await screen.findByText("Meia-Lua")).toBeInTheDocument();
    expect(mockGetCheckpointsCount).not.toHaveBeenCalled();
  });

  it("renders nothing when disabled", () => {
    const { container } = renderWithClient(<PostosPreview enabled={false} />);
    expect(container.firstChild).toBeNull();
    expect(mockGetCheckpoints).not.toHaveBeenCalled();
  });

  it("renders nothing when there are no checkpoints", async () => {
    mockGetCheckpoints.mockResolvedValue({ data: [] });
    const { container } = renderWithClient(<PostosPreview enabled />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("renders ordered checkpoints up to the preview limit", async () => {
    mockGetCheckpoints.mockResolvedValue({
      data: [
        { id: 3, name: "Third", order: 3, description: "desc-3" },
        { id: 1, name: "First", order: 1, description: "desc-1" },
        { id: 2, name: "Second", order: 2 },
      ],
    });
    renderWithClient(<PostosPreview enabled />);

    expect(await screen.findByText("First")).toBeInTheDocument();
    const items = screen.getAllByText(/First|Second|Third/);
    expect(items).toHaveLength(3);

    const firstDesc = screen.getByText("desc-1");
    expect(firstDesc).toBeInTheDocument();
    expect(screen.getByText("desc-3")).toBeInTheDocument();
  });

  it('shows a "+N postos" indicator when checkpoints exceed the preview limit', async () => {
    const checkpoints = Array.from({ length: 9 }, (_, i) => ({
      id: i + 1,
      name: `CP ${i + 1}`,
      order: i + 1,
    }));
    mockGetCheckpoints.mockResolvedValue({ data: checkpoints });
    renderWithClient(<PostosPreview enabled />);

    expect(await screen.findByText("+3 postos")).toBeInTheDocument();
    expect(screen.getByText("CP 1")).toBeInTheDocument();
    expect(screen.getByText("CP 6")).toBeInTheDocument();
    expect(screen.queryByText("CP 7")).not.toBeInTheDocument();
  });

  it('links to /checkpoints with "Ver mapa"', async () => {
    mockGetCheckpoints.mockResolvedValue({ data: [{ id: 1, name: "CP", order: 1 }] });
    renderWithClient(<PostosPreview enabled />);

    const link = await screen.findByText("Ver mapa");
    expect(link.closest("a")).toHaveAttribute("href", "/checkpoints");
  });

  it("does not render description when absent", async () => {
    mockGetCheckpoints.mockResolvedValue({ data: [{ id: 1, name: "CP no desc", order: 1 }] });
    renderWithClient(<PostosPreview enabled />);

    expect(await screen.findByText("CP no desc")).toBeInTheDocument();
  });
});

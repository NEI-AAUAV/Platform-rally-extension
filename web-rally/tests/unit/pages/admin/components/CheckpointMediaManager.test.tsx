import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CheckpointMediaManager from "@/pages/admin/components/checkpoints/CheckpointMediaManager";

const {
  mockListCheckpointMedia,
  mockCreateCheckpointMedia,
  mockDeleteCheckpointMedia,
  mockReorderCheckpointMedia,
  mockToast,
} = vi.hoisted(() => ({
  mockListCheckpointMedia: vi.fn(),
  mockCreateCheckpointMedia: vi.fn(),
  mockDeleteCheckpointMedia: vi.fn(),
  mockReorderCheckpointMedia: vi.fn(),
  mockToast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/client", () => ({
  listCheckpointMedia: (...args: unknown[]) => mockListCheckpointMedia(...args),
  createCheckpointMedia: (...args: unknown[]) => mockCreateCheckpointMedia(...args),
  deleteCheckpointMedia: (...args: unknown[]) => mockDeleteCheckpointMedia(...args),
  reorderCheckpointMedia: (...args: unknown[]) => mockReorderCheckpointMedia(...args),
}));

vi.mock("@/hooks/use-toast", () => ({
  useAppToast: () => mockToast,
}));

vi.mock("@/components/themes/bloody", () => ({
  BloodyButton: (props: React.ComponentProps<"button">) => <button {...props} />,
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const mediaItem = (overrides: Partial<any> = {}) => ({
  id: 1,
  checkpoint_id: 1,
  kind: "photo",
  caption: null,
  order: 0,
  title: null,
  content_url: null,
  content_text: null,
  image_url: "https://x/1.png",
  ...overrides,
});

describe("CheckpointMediaManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCheckpointMedia.mockResolvedValue({ data: {} });
    mockDeleteCheckpointMedia.mockResolvedValue({ data: {} });
    mockReorderCheckpointMedia.mockResolvedValue({ data: [] });
  });

  it("shows loading state while fetching media", () => {
    mockListCheckpointMedia.mockReturnValue(new Promise(() => {}));
    renderWithClient(<CheckpointMediaManager checkpointId={1} />);
    expect(screen.getByText("A carregar…")).toBeInTheDocument();
  });

  it("shows the photo kind selected by default when empty", async () => {
    mockListCheckpointMedia.mockResolvedValue({ data: [] });
    const { container } = renderWithClient(<CheckpointMediaManager checkpointId={1} />);
    await screen.findByText("(0)");
    expect(container.querySelector('input[type="file"]')).toBeInTheDocument();
  });

  it("renders photo and fun fact rows with their counts", async () => {
    mockListCheckpointMedia.mockResolvedValue({
      data: [
        mediaItem({ id: 1, caption: "Nice spot" }),
        mediaItem({ id: 2, kind: "fun_fact", caption: "Built in 1890", image_url: null }),
      ],
    });
    renderWithClient(<CheckpointMediaManager checkpointId={5} />);
    expect(await screen.findByText("Nice spot")).toBeInTheDocument();
    expect(screen.getByText("Built in 1890")).toBeInTheDocument();
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("uploads a photo when a file is selected", async () => {
    mockListCheckpointMedia.mockResolvedValue({ data: [] });
    const { container } = renderWithClient(<CheckpointMediaManager checkpointId={3} />);
    await screen.findByText("(0)");

    const file = new File(["data"], "photo.png", { type: "image/png" });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByText("Adicionar"));

    await waitFor(() =>
      expect(mockCreateCheckpointMedia).toHaveBeenCalledWith({
        path: { checkpoint_id: 3 },
        body: {
          kind: "photo",
          caption: null,
          title: null,
          content_url: null,
          content_text: null,
          image: file,
        },
      }),
    );
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith("Adicionado!"));
  });

  it("shows error toast when adding media fails", async () => {
    mockListCheckpointMedia.mockResolvedValue({ data: [] });
    mockCreateCheckpointMedia.mockRejectedValue(new Error("boom"));
    renderWithClient(<CheckpointMediaManager checkpointId={3} />);
    await screen.findByText("(0)");

    fireEvent.click(screen.getByText("Adicionar"));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
  });

  it("adds a fun fact after switching kind", async () => {
    mockListCheckpointMedia.mockResolvedValue({ data: [] });
    renderWithClient(<CheckpointMediaManager checkpointId={7} />);
    await screen.findByText("(0)");

    fireEvent.click(screen.getByText("Curiosidade"));
    const input = screen.getByPlaceholderText("Ex: Este edifício foi construído em 1890…");
    fireEvent.change(input, { target: { value: "Fun fact here" } });
    fireEvent.click(screen.getByText("Adicionar"));

    await waitFor(() =>
      expect(mockCreateCheckpointMedia).toHaveBeenCalledWith({
        path: { checkpoint_id: 7 },
        body: {
          kind: "fun_fact",
          caption: "Fun fact here",
          title: null,
          content_url: null,
          content_text: null,
          image: null,
        },
      }),
    );
  });

  it("adds a QR attachment after switching kind", async () => {
    mockListCheckpointMedia.mockResolvedValue({ data: [] });
    renderWithClient(<CheckpointMediaManager checkpointId={7} />);
    await screen.findByText("(0)");

    fireEvent.click(screen.getByText("QR code"));
    const input = screen.getByPlaceholderText("URL ou texto a codificar no QR");
    fireEvent.change(input, { target: { value: "https://example.com/riddle" } });
    fireEvent.click(screen.getByText("Adicionar"));

    await waitFor(() =>
      expect(mockCreateCheckpointMedia).toHaveBeenCalledWith({
        path: { checkpoint_id: 7 },
        body: {
          kind: "qr",
          caption: null,
          title: null,
          content_url: null,
          content_text: "https://example.com/riddle",
          image: null,
        },
      }),
    );
  });

  it("adds a Spotify attachment with a title", async () => {
    mockListCheckpointMedia.mockResolvedValue({ data: [] });
    renderWithClient(<CheckpointMediaManager checkpointId={7} />);
    await screen.findByText("(0)");

    fireEvent.click(screen.getByText("Spotify"));
    fireEvent.change(screen.getByPlaceholderText("https://open.spotify.com/track/…"), {
      target: { value: "https://open.spotify.com/track/abc123" },
    });
    fireEvent.change(screen.getByPlaceholderText("Título (opcional)"), {
      target: { value: "Ouve isto" },
    });
    fireEvent.click(screen.getByText("Adicionar"));

    await waitFor(() =>
      expect(mockCreateCheckpointMedia).toHaveBeenCalledWith({
        path: { checkpoint_id: 7 },
        body: {
          kind: "spotify",
          caption: null,
          title: "Ouve isto",
          content_url: "https://open.spotify.com/track/abc123",
          content_text: null,
          image: null,
        },
      }),
    );
  });

  it("deletes a media item when the remove button is clicked", async () => {
    mockListCheckpointMedia.mockResolvedValue({ data: [mediaItem({ id: 9 })] });
    renderWithClient(<CheckpointMediaManager checkpointId={2} />);
    const removeBtn = await screen.findByLabelText("Remover foto");
    fireEvent.click(removeBtn);
    await waitFor(() =>
      expect(mockDeleteCheckpointMedia).toHaveBeenCalledWith({ path: { media_id: 9 } }),
    );
  });

  it("shows error toast when delete fails", async () => {
    mockListCheckpointMedia.mockResolvedValue({ data: [mediaItem({ id: 9 })] });
    mockDeleteCheckpointMedia.mockRejectedValue(new Error("fail"));
    renderWithClient(<CheckpointMediaManager checkpointId={2} />);
    const removeBtn = await screen.findByLabelText("Remover foto");
    fireEvent.click(removeBtn);
    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
  });

  it("reorders items with the up/down arrows", async () => {
    mockListCheckpointMedia.mockResolvedValue({
      data: [mediaItem({ id: 1 }), mediaItem({ id: 2, caption: "Second" })],
    });
    renderWithClient(<CheckpointMediaManager checkpointId={2} />);
    await screen.findByText("(2)");

    const downButtons = screen.getAllByLabelText("Mover para baixo");
    fireEvent.click(downButtons[0]!);

    await waitFor(() =>
      expect(mockReorderCheckpointMedia).toHaveBeenCalledWith({
        path: { checkpoint_id: 2 },
        body: [2, 1],
      }),
    );
  });

  it("includes photo caption when uploading", async () => {
    mockListCheckpointMedia.mockResolvedValue({ data: [] });
    const { container } = renderWithClient(<CheckpointMediaManager checkpointId={4} />);
    await screen.findByText("(0)");

    fireEvent.change(screen.getByPlaceholderText("Legenda (opcional)"), {
      target: { value: "Sunset view" },
    });
    const file = new File(["data"], "photo.png", { type: "image/png" });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByText("Adicionar"));

    await waitFor(() =>
      expect(mockCreateCheckpointMedia).toHaveBeenCalledWith({
        path: { checkpoint_id: 4 },
        body: {
          kind: "photo",
          caption: "Sunset view",
          title: null,
          content_url: null,
          content_text: null,
          image: file,
        },
      }),
    );
  });
});

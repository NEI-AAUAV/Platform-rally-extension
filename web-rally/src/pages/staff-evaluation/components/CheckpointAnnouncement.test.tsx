import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CheckpointAnnouncement from "./CheckpointAnnouncement";

const mockPushCheckpointAnnouncement = vi.fn();
vi.mock("@/client", () => ({
  pushCheckpointAnnouncement: (...args: unknown[]) => mockPushCheckpointAnnouncement(...args),
}));

function renderWithClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CheckpointAnnouncement />
    </QueryClientProvider>,
  );
}

describe("CheckpointAnnouncement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts collapsed behind a button, no title/checkpoint field to fill in", () => {
    renderWithClient();
    expect(
      screen.getByRole("button", { name: /Avisar equipas sobre este posto/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("sends the announcement body only, no title — the server stamps the checkpoint name", async () => {
    const user = userEvent.setup();
    mockPushCheckpointAnnouncement.mockResolvedValue({ data: { sent: 3 } });
    renderWithClient();

    await user.click(screen.getByRole("button", { name: /Avisar equipas sobre este posto/ }));
    await user.type(
      screen.getByPlaceholderText(/Fila grande/),
      "Fila grande, contem 15 min de espera.",
    );
    await user.click(screen.getByRole("button", { name: /Enviar aviso/ }));

    await waitFor(() =>
      expect(mockPushCheckpointAnnouncement).toHaveBeenCalledWith({
        body: { body: "Fila grande, contem 15 min de espera." },
      }),
    );
    expect(await screen.findByText("Enviado a 3 dispositivo(s).")).toBeInTheDocument();
  });

  it("shows an error message when the announcement fails", async () => {
    const user = userEvent.setup();
    mockPushCheckpointAnnouncement.mockRejectedValue(new Error("boom"));
    renderWithClient();

    await user.click(screen.getByRole("button", { name: /Avisar equipas sobre este posto/ }));
    await user.type(screen.getByPlaceholderText(/Fila grande/), "Aviso qualquer");
    await user.click(screen.getByRole("button", { name: /Enviar aviso/ }));

    expect(await screen.findByText("boom")).toBeInTheDocument();
  });
});

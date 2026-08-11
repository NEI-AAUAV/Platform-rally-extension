import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import BroadcastTab from "./BroadcastTab";

const mockPushBroadcast = vi.fn();
vi.mock("@/client", () => ({
  pushBroadcast: (...args: unknown[]) => mockPushBroadcast(...args),
}));

function renderWithClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BroadcastTab />
    </QueryClientProvider>,
  );
}

describe("BroadcastTab", () => {
  beforeEach(() => vi.clearAllMocks());

  it("disables send until both title and message are filled in", async () => {
    renderWithClient();
    expect(screen.getByRole("button", { name: /Enviar a todas as equipas/ })).toBeDisabled();
  });

  it("sends the announcement and shows how many devices received it", async () => {
    const user = userEvent.setup();
    mockPushBroadcast.mockResolvedValue({ data: { sent: 5 } });
    renderWithClient();

    await user.type(screen.getByPlaceholderText("Ex: Atenção equipas!"), "Chuva a chegar");
    await user.type(
      screen.getByPlaceholderText(/Vai começar a chover/),
      "Abrigem-se no posto mais próximo",
    );
    await user.click(screen.getByRole("button", { name: /Enviar a todas as equipas/ }));

    await waitFor(() =>
      expect(mockPushBroadcast).toHaveBeenCalledWith({
        body: { title: "Chuva a chegar", body: "Abrigem-se no posto mais próximo", url: null },
      }),
    );
    expect(await screen.findByText("Enviado a 5 dispositivo(s).")).toBeInTheDocument();
  });

  it("shows an error message when the broadcast fails", async () => {
    const user = userEvent.setup();
    mockPushBroadcast.mockRejectedValue(new Error("boom"));
    renderWithClient();

    await user.type(screen.getByPlaceholderText("Ex: Atenção equipas!"), "Título");
    await user.type(screen.getByPlaceholderText(/Vai começar a chover/), "Mensagem");
    await user.click(screen.getByRole("button", { name: /Enviar a todas as equipas/ }));

    expect(await screen.findByText("boom")).toBeInTheDocument();
  });
});

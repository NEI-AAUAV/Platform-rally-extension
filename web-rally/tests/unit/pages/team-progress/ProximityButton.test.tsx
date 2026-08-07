import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProximityButton from "@/pages/team-progress/ProximityButton";

const { mockReadProximity } = vi.hoisted(() => ({ mockReadProximity: vi.fn() }));

vi.mock("@/client", () => ({
  readCheckpointProximity: (...args: unknown[]) => mockReadProximity(...args),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

function mockGeolocation(impl: (ok: PositionCallback, fail: PositionErrorCallback) => void) {
  Object.defineProperty(globalThis.navigator, "geolocation", {
    value: { getCurrentPosition: impl },
    configurable: true,
  });
}

const at = (latitude: number, longitude: number) =>
  ({ coords: { latitude, longitude } }) as GeolocationPosition;

describe("ProximityButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGeolocation((ok) => ok(at(40.64, -8.65)));
    mockReadProximity.mockResolvedValue({
      data: { checkpoint_id: 3, band: "menos de 500m", is_within_radius: false, direction: null },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis.navigator, "geolocation");
  });

  it("reports the band the server returned", async () => {
    render(<ProximityButton checkpointId={3} />, { wrapper: createWrapper() });
    await userEvent.click(screen.getByRole("button", { name: /Verificar distância/ }));

    expect(await screen.findByText("menos de 500m")).toBeInTheDocument();
    expect(mockReadProximity).toHaveBeenCalledWith({
      path: { checkpoint_id: 3 },
      body: { latitude: 40.64, longitude: -8.65 },
    });
  });

  it("shows the compass sector only when the server sends one", async () => {
    mockReadProximity.mockResolvedValue({
      data: { checkpoint_id: 3, band: "menos de 100m", is_within_radius: true, direction: "NE" },
    });

    render(<ProximityButton checkpointId={3} />, { wrapper: createWrapper() });
    await userEvent.click(screen.getByRole("button", { name: /Verificar distância/ }));

    expect(await screen.findByText("NE")).toBeInTheDocument();
    expect(screen.getByText(/dentro do raio/)).toBeInTheDocument();
  });

  it("does not invent a direction when the server withholds it", async () => {
    render(<ProximityButton checkpointId={3} />, { wrapper: createWrapper() });
    await userEvent.click(screen.getByRole("button", { name: /Verificar distância/ }));

    await screen.findByText("menos de 500m");
    // The compass is gated server-side; the client must not fill the gap.
    expect(screen.queryByText(/^(N|NE|E|SE|S|SO|O|NO)$/)).not.toBeInTheDocument();
  });

  it("never displays a metre count", async () => {
    render(<ProximityButton checkpointId={3} />, { wrapper: createWrapper() });
    await userEvent.click(screen.getByRole("button", { name: /Verificar distância/ }));

    await screen.findByText("menos de 500m");
    // Only the band's own wording; no precise distance anywhere.
    expect(document.body.textContent).not.toMatch(/\d+\s?m\b(?!enos)/);
  });

  it("reports a denied location", async () => {
    mockGeolocation((_ok, fail) =>
      fail({ message: "User denied Geolocation" } as GeolocationPositionError),
    );

    render(<ProximityButton checkpointId={3} />, { wrapper: createWrapper() });
    await userEvent.click(screen.getByRole("button", { name: /Verificar distância/ }));

    expect(await screen.findByText(/Sem acesso à localização/)).toBeInTheDocument();
    expect(mockReadProximity).not.toHaveBeenCalled();
  });

  it("reports a rejected request", async () => {
    mockReadProximity.mockRejectedValue(new Error("Too many proximity checks"));

    render(<ProximityButton checkpointId={3} />, { wrapper: createWrapper() });
    await userEvent.click(screen.getByRole("button", { name: /Verificar distância/ }));

    expect(await screen.findByText(/Too many proximity checks/)).toBeInTheDocument();
  });

  it("says so when the browser has no geolocation at all", async () => {
    Reflect.deleteProperty(globalThis.navigator, "geolocation");

    render(<ProximityButton checkpointId={3} />, { wrapper: createWrapper() });
    await userEvent.click(screen.getByRole("button", { name: /Verificar distância/ }));

    await waitFor(() => expect(screen.getByText(/não suportada pelo browser/)).toBeInTheDocument());
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NextCheckpointCard from "@/pages/team-progress/NextCheckpointCard";
import { arriveAtCheckpoint } from "@/client";
import type { DetailedCheckPoint } from "@/client";

const {
  mockUseCheckpointMedia,
  mockUseRallySettings,
  mockUseEventTerms,
  mockEnqueueArrival,
  mockUseArrivalSync,
} = vi.hoisted(() => ({
  mockUseCheckpointMedia: vi.fn(),
  mockUseRallySettings: vi.fn(),
  mockUseEventTerms: vi.fn(),
  mockEnqueueArrival: vi.fn(),
  mockUseArrivalSync: vi.fn(),
}));

vi.mock("@/offline/arrivalQueue", () => ({
  enqueueArrival: (...args: unknown[]) => mockEnqueueArrival(...args),
}));

vi.mock("@/offline/useArrivalSync", () => ({
  useArrivalSync: () => mockUseArrivalSync(),
}));

vi.mock("@/hooks/useEventTerms", () => ({
  default: () => mockUseEventTerms(),
}));

vi.mock("@/hooks/useCheckpointMedia", () => ({
  useCheckpointMedia: (...args: unknown[]) => mockUseCheckpointMedia(...args),
}));

vi.mock("@/hooks/useRallySettings", () => ({
  default: () => mockUseRallySettings(),
}));

vi.mock("@/client", () => ({
  arriveAtCheckpoint: vi.fn(),
}));

vi.mock("@/components/shared", () => ({
  CheckpointDiscovery: () => <div data-testid="discovery" />,
}));

const checkpoint = {
  id: 1,
  name: "Posto 1",
  latitude: 41.1,
  longitude: -8.6,
  arrival_radius_m: 50,
  description: "Um posto",
} as DetailedCheckPoint;

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("team-progress NextCheckpointCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCheckpointMedia.mockReturnValue({ photos: [], funFacts: [] });
    mockUseRallySettings.mockReturnValue({ settings: { gps_checkin_enabled: true } });
    mockUseArrivalSync.mockReturnValue({ queued: [], syncNow: vi.fn() });
    mockUseEventTerms.mockReturnValue({
      checkpoint: "posto",
      checkpoints: "postos",
      activity: "desafio",
      activities: "desafios",
      event: "peddy-paper",
      checkpointGender: "m",
    });
  });

  it("renders checkpoint name and coordinates when showMap is true", () => {
    render(<NextCheckpointCard checkpoint={checkpoint} showMap />, { wrapper: createWrapper() });
    expect(screen.getByText(/Próximo Posto — Posto 1/)).toBeInTheDocument();
    expect(screen.getByText(/41\.100000/)).toBeInTheDocument();
  });

  it("agrees with the event terminology's gender in the heading", () => {
    mockUseEventTerms.mockReturnValue({
      checkpoint: "tasca",
      checkpoints: "tascas",
      activity: "prova",
      activities: "provas",
      event: "rally",
      checkpointGender: "f",
    });
    render(<NextCheckpointCard checkpoint={checkpoint} showMap />, { wrapper: createWrapper() });
    expect(screen.getByText(/Próxima Tasca — Posto 1/)).toBeInTheDocument();
  });

  it("hides coordinates when showMap is false", () => {
    render(<NextCheckpointCard checkpoint={checkpoint} showMap={false} />, {
      wrapper: createWrapper(),
    });
    expect(screen.queryByText(/41\.100000/)).not.toBeInTheDocument();
  });

  it("shows discovery section when description is present", () => {
    render(<NextCheckpointCard checkpoint={checkpoint} showMap />, { wrapper: createWrapper() });
    expect(screen.getByTestId("discovery")).toBeInTheDocument();
  });

  it("does not render checkin button when checkpoint has no coordinates", () => {
    const cpNoCoords = { ...checkpoint, latitude: null, longitude: null } as DetailedCheckPoint;
    render(<NextCheckpointCard checkpoint={cpNoCoords} showMap />, { wrapper: createWrapper() });
    expect(screen.queryByRole("button", { name: /Check-in GPS/ })).not.toBeInTheDocument();
  });

  it("explains itself and offers a retry when the event settings could not be loaded", async () => {
    // Every condition behind the check-in button reads the settings, so a
    // failed settings fetch removes the button. The hook gives up after two
    // retries and does not retry on mount, so without this the team is left
    // standing at the post looking at a card that offers nothing and says
    // nothing — and only a page reload brings the button back.
    const refetch = vi.fn();
    mockUseRallySettings.mockReturnValue({
      settings: undefined,
      error: new Error("500"),
      refetch,
    });
    render(<NextCheckpointCard checkpoint={checkpoint} showMap />, { wrapper: createWrapper() });

    expect(screen.queryByRole("button", { name: /^Check-in GPS$/ })).not.toBeInTheDocument();
    expect(screen.getByText(/não foi possível carregar as definições/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("says nothing about settings while they are merely still loading", () => {
    // No data and no error is the first render of every visit; a notice there
    // would flash on a page that is about to work perfectly well.
    mockUseRallySettings.mockReturnValue({ settings: undefined, refetch: vi.fn() });
    render(<NextCheckpointCard checkpoint={checkpoint} showMap />, { wrapper: createWrapper() });
    expect(screen.queryByText(/não foi possível carregar as definições/i)).not.toBeInTheDocument();
  });

  it("does not render the checkin button when GPS check-in is disabled for the event", () => {
    mockUseRallySettings.mockReturnValue({ settings: { gps_checkin_enabled: false } });
    render(<NextCheckpointCard checkpoint={checkpoint} showMap />, { wrapper: createWrapper() });
    expect(screen.queryByRole("button", { name: /Check-in GPS/ })).not.toBeInTheDocument();
  });

  it("shows an error when geolocation is unsupported", async () => {
    const originalGeo = navigator.geolocation;
    // @ts-expect-error - simulate unsupported browser
    delete navigator.geolocation;
    const user = userEvent.setup();
    render(<NextCheckpointCard checkpoint={checkpoint} showMap />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("button", { name: /Check-in GPS/ }));
    expect(screen.getByText("Geolocalização não suportada pelo browser.")).toBeInTheDocument();

    Object.defineProperty(navigator, "geolocation", { value: originalGeo, configurable: true });
  });

  it("handles a successful check-in and shows the auto-completed message", async () => {
    vi.mocked(arriveAtCheckpoint).mockResolvedValue({
      data: { auto_completed: true, already_registered: false, distance_m: 10 },
    } as never);
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 41.1, longitude: -8.6 } }),
    );
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });

    const user = userEvent.setup();
    render(<NextCheckpointCard checkpoint={checkpoint} showMap />, { wrapper: createWrapper() });
    await user.click(screen.getByRole("button", { name: /Check-in GPS/ }));

    await vi.waitFor(() => expect(screen.getByText(/Posto concluído/)).toBeInTheDocument());
  });

  it("handles already-registered check-in response", async () => {
    vi.mocked(arriveAtCheckpoint).mockResolvedValue({
      data: { auto_completed: false, already_registered: true, distance_m: 12.4 },
    } as never);
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 41.1, longitude: -8.6 } }),
    );
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });

    const user = userEvent.setup();
    render(<NextCheckpointCard checkpoint={checkpoint} showMap />, { wrapper: createWrapper() });
    await user.click(screen.getByRole("button", { name: /Check-in GPS/ }));

    await vi.waitFor(() =>
      expect(screen.getByText(/Já registado. Distância: 12 m\./)).toBeInTheDocument(),
    );
  });

  it('translates a "too far" error into a friendly message', async () => {
    // The server reports a coarse band, never the exact metre count — an exact
    // distance would let a team trilaterate a post hidden by focused route mode.
    vi.mocked(arriveAtCheckpoint).mockRejectedValue({
      body: { detail: "Too far from checkpoint: menos de 500m (max 50m)" },
    });
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 41.1, longitude: -8.6 } }),
    );
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });

    const user = userEvent.setup();
    render(<NextCheckpointCard checkpoint={checkpoint} showMap />, { wrapper: createWrapper() });
    await user.click(screen.getByRole("button", { name: /Check-in GPS/ }));

    await vi.waitFor(() =>
      expect(
        screen.getByText(
          /Ainda não estás perto o suficiente: menos de 500m \(tens de estar a menos de 50 m\)/,
        ),
      ).toBeInTheDocument(),
    );
  });

  it('falls back to a generic nudge when the "too far" detail does not parse', async () => {
    vi.mocked(arriveAtCheckpoint).mockRejectedValue({
      body: { detail: "Too far from checkpoint" },
    });
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 41.1, longitude: -8.6 } }),
    );
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });

    const user = userEvent.setup();
    render(<NextCheckpointCard checkpoint={checkpoint} showMap />, { wrapper: createWrapper() });
    await user.click(screen.getByRole("button", { name: /Check-in GPS/ }));

    await vi.waitFor(() =>
      expect(
        screen.getByText("Ainda não estás perto o suficiente. Aproxima-te e tenta outra vez."),
      ).toBeInTheDocument(),
    );
  });

  it("queues the check-in when the request never reaches the server", async () => {
    // No detail body => the server never answered. Keep the captured position
    // so the team is credited for where they actually stood.
    vi.mocked(arriveAtCheckpoint).mockRejectedValue(new Error("Failed to fetch"));
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 41.15, longitude: -8.61 } }),
    );
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });

    const user = userEvent.setup();
    render(<NextCheckpointCard checkpoint={checkpoint} showMap />, { wrapper: createWrapper() });
    await user.click(screen.getByRole("button", { name: /Check-in GPS/ }));

    await vi.waitFor(() =>
      expect(mockEnqueueArrival).toHaveBeenCalledWith({
        checkpointId: 1,
        latitude: 41.15,
        longitude: -8.61,
      }),
    );
    expect(screen.getByText(/Check-in guardado/)).toBeInTheDocument();
  });

  it("does not queue a check-in the server actively rejected", async () => {
    vi.mocked(arriveAtCheckpoint).mockRejectedValue({
      body: { detail: "Too far from checkpoint: menos de 500m (max 50m)" },
    });
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 41.1, longitude: -8.6 } }),
    );
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });

    const user = userEvent.setup();
    render(<NextCheckpointCard checkpoint={checkpoint} showMap />, { wrapper: createWrapper() });
    await user.click(screen.getByRole("button", { name: /Check-in GPS/ }));

    await vi.waitFor(() => expect(screen.getByText(/menos de 500m/)).toBeInTheDocument());
    expect(mockEnqueueArrival).not.toHaveBeenCalled();
  });

  it("flags a leftover queued arrival from an earlier session", () => {
    mockUseArrivalSync.mockReturnValue({
      queued: [
        { checkpointId: 1, latitude: 41.1, longitude: -8.6, status: "pending", createdAt: 1 },
      ],
      syncNow: vi.fn(),
    });
    render(<NextCheckpointCard checkpoint={checkpoint} showMap />, { wrapper: createWrapper() });
    expect(screen.getByText(/check-in por enviar para este local/i)).toBeInTheDocument();
  });

  it("shows a geolocation permission error and allows clearing it", async () => {
    const getCurrentPosition = vi.fn((_success, error) =>
      error({ message: "User denied Geolocation" }),
    );
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });

    const user = userEvent.setup();
    render(<NextCheckpointCard checkpoint={checkpoint} showMap />, { wrapper: createWrapper() });
    await user.click(screen.getByRole("button", { name: /Check-in GPS/ }));

    await vi.waitFor(() =>
      expect(screen.getByText(/Sem acesso à localização/)).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: /Limpar erro/ }));
    expect(screen.queryByText(/Sem acesso à localização/)).not.toBeInTheDocument();
  });
});

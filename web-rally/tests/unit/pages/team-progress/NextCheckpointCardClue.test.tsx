import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NextCheckpointCard from "@/pages/team-progress/NextCheckpointCard";
import type { DetailedCheckPoint } from "@/client";

const {
  mockUseCheckpointMedia,
  mockUseRallySettings,
  mockUseEventTerms,
  mockUseArrivalSync,
  mockUseCheckpointHints,
  mockReveal,
} = vi.hoisted(() => ({
  mockUseCheckpointMedia: vi.fn(),
  mockUseRallySettings: vi.fn(),
  mockUseEventTerms: vi.fn(),
  mockUseArrivalSync: vi.fn(),
  mockUseCheckpointHints: vi.fn(),
  mockReveal: vi.fn(),
}));

vi.mock("@/offline/arrivalQueue", () => ({ enqueueArrival: vi.fn() }));
vi.mock("@/offline/useArrivalSync", () => ({ useArrivalSync: () => mockUseArrivalSync() }));
vi.mock("@/hooks/useEventTerms", () => ({ default: () => mockUseEventTerms() }));
vi.mock("@/hooks/useCheckpointMedia", () => ({
  useCheckpointMedia: (...args: unknown[]) => mockUseCheckpointMedia(...args),
}));
vi.mock("@/hooks/useRallySettings", () => ({ default: () => mockUseRallySettings() }));
vi.mock("@/hooks/useCheckpointHints", () => ({
  default: (...args: unknown[]) => mockUseCheckpointHints(...args),
}));
vi.mock("@/client", () => ({ arriveAtCheckpoint: vi.fn() }));
vi.mock("@/components/shared", () => ({
  CheckpointDiscovery: ({ description }: { description?: string | null }) => (
    <div data-testid="discovery">{description}</div>
  ),
}));

/** A checkpoint as the server hands it to a team in peddy paper: name and
 * coordinates redacted, riddle mirrored into description. */
const redacted = {
  id: 1,
  name: "Posto 3",
  latitude: null,
  longitude: null,
  arrival_radius_m: 50,
  order: 3,
  clue: "Onde o rio encontra a ponte de ferro.",
  description: "Onde o rio encontra a ponte de ferro.",
} as DetailedCheckPoint;

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const hintState = (overrides: Record<string, unknown> = {}) => ({
  revealed: [],
  remaining: 0,
  nextCost: 0,
  isLoading: false,
  reveal: { mutate: mockReveal, isPending: false, isError: false, error: null },
  ...overrides,
});

describe("NextCheckpointCard — clue and hints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCheckpointMedia.mockReturnValue({ photos: [], funFacts: [] });
    mockUseRallySettings.mockReturnValue({ settings: { gps_checkin_enabled: true } });
    mockUseArrivalSync.mockReturnValue({ queued: [], syncNow: vi.fn() });
    mockUseCheckpointHints.mockReturnValue(hintState());
    mockUseEventTerms.mockReturnValue({
      checkpoint: "posto",
      checkpoints: "postos",
      activity: "desafio",
      activities: "desafios",
      event: "peddy-paper",
      checkpointGender: "m",
    });
  });

  it("shows the riddle and no coordinates for a redacted checkpoint", () => {
    render(<NextCheckpointCard checkpoint={redacted} showMap />, { wrapper: createWrapper() });

    expect(screen.getByText("Enigma")).toBeInTheDocument();
    expect(screen.getByText(/ponte de ferro/)).toBeInTheDocument();
    expect(screen.queryByText(/\d+\.\d{6}/)).not.toBeInTheDocument();
  });

  it("does not repeat the clue in the discovery block", () => {
    render(<NextCheckpointCard checkpoint={redacted} showMap />, { wrapper: createWrapper() });

    // description === clue, so the discovery section has nothing of its own
    expect(screen.queryByTestId("discovery")).not.toBeInTheDocument();
    expect(screen.getAllByText(/ponte de ferro/)).toHaveLength(1);
  });

  it("renders nothing riddle-shaped for a guided checkpoint", () => {
    const guided = { ...redacted, clue: null, description: "Um posto" } as DetailedCheckPoint;

    render(<NextCheckpointCard checkpoint={guided} showMap />, { wrapper: createWrapper() });

    expect(screen.queryByText("Enigma")).not.toBeInTheDocument();
    expect(screen.getByTestId("discovery")).toHaveTextContent("Um posto");
  });

  it("hides the hint block when the checkpoint has no ladder", () => {
    render(<NextCheckpointCard checkpoint={redacted} showMap />, { wrapper: createWrapper() });

    expect(screen.queryByText("Pistas")).not.toBeInTheDocument();
  });

  it("shows the cost and how many hints are left", () => {
    mockUseCheckpointHints.mockReturnValue(hintState({ remaining: 2, nextCost: -10 }));

    render(<NextCheckpointCard checkpoint={redacted} showMap />, { wrapper: createWrapper() });

    expect(screen.getByRole("button", { name: /Pedir pista \(-10 pts\).*faltam 2/ })).toBeVisible();
  });

  it("lists hints already paid for", () => {
    mockUseCheckpointHints.mockReturnValue(
      hintState({
        revealed: [{ indication_id: 7, hint: "Procura junto ao cais", cost: -10 }],
        remaining: 1,
        nextCost: -10,
      }),
    );

    render(<NextCheckpointCard checkpoint={redacted} showMap />, { wrapper: createWrapper() });

    expect(screen.getByText(/Procura junto ao cais/)).toBeInTheDocument();
  });

  it("asks for confirmation before spending points", async () => {
    mockUseCheckpointHints.mockReturnValue(hintState({ remaining: 1, nextCost: -10 }));
    const confirmSpy = vi.spyOn(globalThis, "confirm").mockReturnValue(false);

    render(<NextCheckpointCard checkpoint={redacted} showMap />, { wrapper: createWrapper() });
    await userEvent.click(screen.getByRole("button", { name: /Pedir pista/ }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("10 pontos"));
    expect(mockReveal).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("reveals the hint once confirmed", async () => {
    mockUseCheckpointHints.mockReturnValue(hintState({ remaining: 1, nextCost: -10 }));
    const confirmSpy = vi.spyOn(globalThis, "confirm").mockReturnValue(true);

    render(<NextCheckpointCard checkpoint={redacted} showMap />, { wrapper: createWrapper() });
    await userEvent.click(screen.getByRole("button", { name: /Pedir pista/ }));

    expect(mockReveal).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it("skips the confirmation when hints are free", async () => {
    mockUseCheckpointHints.mockReturnValue(hintState({ remaining: 1, nextCost: 0 }));
    const confirmSpy = vi.spyOn(globalThis, "confirm");

    render(<NextCheckpointCard checkpoint={redacted} showMap />, { wrapper: createWrapper() });
    await userEvent.click(screen.getByRole("button", { name: /Pedir pista/ }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mockReveal).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });
});

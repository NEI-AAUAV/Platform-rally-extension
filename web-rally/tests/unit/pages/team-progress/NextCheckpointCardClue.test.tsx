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
  mockGiveUp,
} = vi.hoisted(() => ({
  mockUseCheckpointMedia: vi.fn(),
  mockUseRallySettings: vi.fn(),
  mockUseEventTerms: vi.fn(),
  mockUseArrivalSync: vi.fn(),
  mockUseCheckpointHints: vi.fn(),
  mockReveal: vi.fn(),
  mockGiveUp: vi.fn(),
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
  is_redacted: true,
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
  totalSpentInEvent: 0,
  isLoading: false,
  reveal: { mutate: mockReveal, isPending: false, isError: false, error: null },
  giveUp: { mutate: mockGiveUp, isPending: false, isError: false, error: null },
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
    const guided = {
      ...redacted,
      clue: null,
      description: "Um posto",
      is_redacted: false,
    } as DetailedCheckPoint;

    render(<NextCheckpointCard checkpoint={guided} showMap />, { wrapper: createWrapper() });

    expect(screen.queryByText("Enigma")).not.toBeInTheDocument();
    expect(screen.getByTestId("discovery")).toHaveTextContent("Um posto");
  });

  it("tells the team to wait for the guide when a redacted post has no clue", () => {
    const clueless = { ...redacted, clue: null, description: null } as DetailedCheckPoint;

    render(<NextCheckpointCard checkpoint={clueless} showMap />, { wrapper: createWrapper() });

    expect(screen.getByText(/aguarda as indicações do guia/i)).toBeInTheDocument();
  });

  it("does not show that fallback once the post is revealed", () => {
    const revealed = {
      ...redacted,
      clue: null,
      description: "Um posto",
      is_redacted: false,
    } as DetailedCheckPoint;

    render(<NextCheckpointCard checkpoint={revealed} showMap />, { wrapper: createWrapper() });

    expect(screen.queryByText(/aguarda as indicações do guia/i)).not.toBeInTheDocument();
  });

  it("offers GPS check-in even though the coordinates were redacted", () => {
    // The whole mode withholds coordinates on purpose. Requiring them before
    // showing the button hid check-in for every peddy paper, making the loop
    // unplayable; the server does the distance check regardless.
    render(<NextCheckpointCard checkpoint={redacted} showMap />, { wrapper: createWrapper() });

    expect(screen.getByRole("button", { name: "Check-in GPS" })).toBeVisible();
  });

  it("still hides check-in when the post has no geofence radius", () => {
    const noRadius = { ...redacted, arrival_radius_m: 0 } as DetailedCheckPoint;

    render(<NextCheckpointCard checkpoint={noRadius} showMap />, { wrapper: createWrapper() });

    expect(screen.queryByRole("button", { name: "Check-in GPS" })).not.toBeInTheDocument();
  });

  it("explains that an offline hint request is not queued", () => {
    // A queued arrival is a fact about where the team stood; a queued hint
    // purchase would spend points nobody was there to read.
    mockUseCheckpointHints.mockReturnValue(
      hintState({
        remaining: 1,
        nextCost: -10,
        reveal: { mutate: mockReveal, isPending: false, isError: true, error: {} },
      }),
    );

    render(<NextCheckpointCard checkpoint={redacted} showMap />, { wrapper: createWrapper() });

    expect(screen.getByText(/Sem rede.*não fica guardada/s)).toBeInTheDocument();
  });

  it("shows the server's message when the request did reach it", () => {
    mockUseCheckpointHints.mockReturnValue(
      hintState({
        remaining: 1,
        nextCost: -10,
        reveal: {
          mutate: mockReveal,
          isPending: false,
          isError: true,
          error: { body: { detail: "No hints left for this checkpoint" } },
        },
      }),
    );

    render(<NextCheckpointCard checkpoint={redacted} showMap />, { wrapper: createWrapper() });

    expect(screen.getByText(/No hints left/)).toBeInTheDocument();
  });

  it("offers a way out once the hint ladder is spent", async () => {
    // Without this a team that cannot solve the riddle sits here for the rest
    // of the event.
    mockUseRallySettings.mockReturnValue({
      settings: { gps_checkin_enabled: true, skip_penalty: -25 },
    });
    mockUseCheckpointHints.mockReturnValue(
      hintState({ revealed: [{ indication_id: 7, hint: "Junto ao cais", cost: -10 }] }),
    );

    render(<NextCheckpointCard checkpoint={redacted} showMap />, { wrapper: createWrapper() });
    await userEvent.click(screen.getByRole("button", { name: /Desistir deste posto \(-25 pts\)/ }));

    // The spend goes through an in-app confirmation, not the native dialog.
    expect(screen.getByText(/25 pontos/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Desistir" }));

    expect(mockGiveUp).toHaveBeenCalledTimes(1);
  });

  it("does not offer giving up while hints remain", () => {
    mockUseCheckpointHints.mockReturnValue(hintState({ remaining: 2, nextCost: -10 }));

    render(<NextCheckpointCard checkpoint={redacted} showMap />, { wrapper: createWrapper() });

    // Offered as a last resort, not a shortcut past the puzzle.
    expect(screen.queryByRole("button", { name: /Desistir/ })).not.toBeInTheDocument();
  });

  it("does not offer giving up on a post already revealed", () => {
    const revealed = { ...redacted, is_redacted: false } as DetailedCheckPoint;

    render(<NextCheckpointCard checkpoint={revealed} showMap />, { wrapper: createWrapper() });

    expect(screen.queryByRole("button", { name: /Desistir/ })).not.toBeInTheDocument();
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

  it("shows what each hint cost and the running total", () => {
    mockUseCheckpointHints.mockReturnValue(
      hintState({
        revealed: [
          { indication_id: 7, hint: "Junto ao cais", cost: -10 },
          { indication_id: 8, hint: "Procura a placa azul", cost: -10 },
        ],
        remaining: 0,
        nextCost: -10,
        totalSpentInEvent: -20,
      }),
    );

    render(<NextCheckpointCard checkpoint={redacted} showMap />, { wrapper: createWrapper() });

    // The deduction lives in admin-only award rows, so this is the team's
    // only explanation for the points it lost.
    expect(screen.getAllByText("-10 pts")).toHaveLength(2);
    expect(screen.getByText(/Neste posto: -20 pts/)).toBeInTheDocument();
  });

  it("adds the whole route's spend when it differs from this post's", () => {
    // A team that bought hints at earlier posts needs the running total —
    // nothing else in its app shows where the points went.
    mockUseCheckpointHints.mockReturnValue(
      hintState({
        revealed: [{ indication_id: 7, hint: "Junto ao cais", cost: -10 }],
        remaining: 0,
        nextCost: -10,
        totalSpentInEvent: -35,
      }),
    );

    render(<NextCheckpointCard checkpoint={redacted} showMap />, { wrapper: createWrapper() });

    expect(screen.getByText(/em todo o percurso: -35 pts/)).toBeInTheDocument();
  });

  it("omits the cost when hints are free", () => {
    mockUseCheckpointHints.mockReturnValue(
      hintState({ revealed: [{ indication_id: 7, hint: "Junto ao cais", cost: 0 }] }),
    );

    render(<NextCheckpointCard checkpoint={redacted} showMap />, { wrapper: createWrapper() });

    expect(screen.queryByText(/pts/)).not.toBeInTheDocument();
  });

  it("asks for confirmation before spending points", async () => {
    mockUseCheckpointHints.mockReturnValue(hintState({ remaining: 1, nextCost: -10 }));

    render(<NextCheckpointCard checkpoint={redacted} showMap />, { wrapper: createWrapper() });
    await userEvent.click(screen.getByRole("button", { name: /Pedir pista/ }));

    // In-app confirmation names the cost; dismissing it spends nothing.
    expect(screen.getByText(/10 pontos/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(mockReveal).not.toHaveBeenCalled();
  });

  it("reveals the hint once confirmed", async () => {
    mockUseCheckpointHints.mockReturnValue(hintState({ remaining: 1, nextCost: -10 }));

    render(<NextCheckpointCard checkpoint={redacted} showMap />, { wrapper: createWrapper() });
    await userEvent.click(screen.getByRole("button", { name: /Pedir pista/ }));
    await userEvent.click(screen.getByRole("button", { name: "Pedir pista" }));

    expect(mockReveal).toHaveBeenCalledTimes(1);
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

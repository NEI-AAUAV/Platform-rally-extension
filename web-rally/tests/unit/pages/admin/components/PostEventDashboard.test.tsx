import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PostEventDashboard from "@/pages/admin/components/dashboard/PostEventDashboard";

const { mockGetTeams } = vi.hoisted(() => ({ mockGetTeams: vi.fn() }));

vi.mock("@/client", () => ({
  getTeams: (...args: unknown[]) => mockGetTeams(...args),
}));

vi.mock("@/components/shared", () => ({
  LoadingState: ({ message }: { message: string }) => (
    <div data-testid="loading-state">{message}</div>
  ),
  ErrorState: ({ message }: { message: string }) => <div data-testid="error-state">{message}</div>,
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const team = (overrides: Partial<any> = {}) => ({
  id: 1,
  name: "Team Alpha",
  classification: 1,
  total: 100,
  ...overrides,
});

describe("PostEventDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders final standings when teams load", async () => {
    mockGetTeams.mockResolvedValue({ data: [team()] });
    renderWithClient(<PostEventDashboard />);
    expect(await screen.findByText("Classificação final")).toBeInTheDocument();
    expect(screen.getByText("Team Alpha")).toBeInTheDocument();
  });

  it("shows the empty state only for a real, loaded, zero-team result", async () => {
    mockGetTeams.mockResolvedValue({ data: [] });
    renderWithClient(<PostEventDashboard />);
    expect(await screen.findByText("Sem equipas para apresentar.")).toBeInTheDocument();
  });

  it("shows a loading state instead of a false empty result while teams are fetching", () => {
    mockGetTeams.mockReturnValue(new Promise(() => {}));
    renderWithClient(<PostEventDashboard />);
    expect(screen.getByTestId("loading-state")).toBeInTheDocument();
    expect(screen.queryByText("Sem equipas para apresentar.")).not.toBeInTheDocument();
  });

  it("shows an error state instead of a false empty result when the fetch fails", async () => {
    mockGetTeams.mockRejectedValue(new Error("network down"));
    renderWithClient(<PostEventDashboard />);
    expect(await screen.findByTestId("error-state")).toBeInTheDocument();
    expect(screen.queryByText("Sem equipas para apresentar.")).not.toBeInTheDocument();
  });
});

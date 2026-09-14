import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AdminDashboard from "@/pages/admin/components/dashboard/AdminDashboard";
import useRallySettings from "@/hooks/useRallySettings";
import { useCountdown } from "@/pages/home/useCountdown";

vi.mock("@/hooks/useRallySettings", () => ({ default: vi.fn() }));
vi.mock("@/pages/home/useCountdown", () => ({ useCountdown: vi.fn() }));
vi.mock("@/pages/admin/components/dashboard/PreparationDashboard", () => ({
  default: () => <div data-testid="preparation-dashboard" />,
}));
vi.mock("@/pages/admin/components/dashboard/OperationsDashboard", () => ({
  default: () => <div data-testid="operations-dashboard" />,
}));
vi.mock("@/pages/admin/components/dashboard/PostEventDashboard", () => ({
  default: () => <div data-testid="post-event-dashboard" />,
}));

function mockPhase(phase: string) {
  vi.mocked(useRallySettings).mockReturnValue({
    settings: { rally_start_time: null, rally_end_time: null },
  } as unknown as ReturnType<typeof useRallySettings>);
  vi.mocked(useCountdown).mockReturnValue({
    phase,
  } as unknown as ReturnType<typeof useCountdown>);
}

describe("AdminDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows PreparationDashboard for phase 'pre'", () => {
    mockPhase("pre");
    render(<AdminDashboard onNavigate={vi.fn()} />);
    expect(screen.getByTestId("preparation-dashboard")).toBeInTheDocument();
  });

  it("shows PreparationDashboard for phase 'none' (no dates configured)", () => {
    mockPhase("none");
    render(<AdminDashboard onNavigate={vi.fn()} />);
    expect(screen.getByTestId("preparation-dashboard")).toBeInTheDocument();
  });

  it("shows OperationsDashboard for phase 'live'", () => {
    mockPhase("live");
    render(<AdminDashboard onNavigate={vi.fn()} />);
    expect(screen.getByTestId("operations-dashboard")).toBeInTheDocument();
  });

  it("shows PostEventDashboard for phase 'post'", () => {
    mockPhase("post");
    render(<AdminDashboard onNavigate={vi.fn()} />);
    expect(screen.getByTestId("post-event-dashboard")).toBeInTheDocument();
  });
});

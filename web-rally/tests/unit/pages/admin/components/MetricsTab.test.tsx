/**
 * MetricsTab was at 4.34% statements / 0% branches: an e2e spec reached the tab
 * but nothing exercised the derivations. The numbers here are the ones an admin
 * reads to decide whether a live rally is healthy, and every one of them is a
 * computed value with a divide-by-zero or missing-field branch behind it.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { mockGetAdminMetrics, mockReadinessCheck } = vi.hoisted(() => ({
  mockGetAdminMetrics: vi.fn(),
  mockReadinessCheck: vi.fn(),
}));

vi.mock("@/client", () => ({
  getAdminMetrics: (...args: unknown[]) => mockGetAdminMetrics(...args),
  readinessCheck: (...args: unknown[]) => mockReadinessCheck(...args),
}));

vi.mock("recharts", () => ({
  Line: () => null,
  LineChart: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

import MetricsTab from "@/pages/admin/components/audit/MetricsTab";

const metrics = (over: Record<string, number> = {}) => ({
  data: {
    requests_total: 1000,
    errors_5xx: 5,
    rate_limit_rejections: 0,
    request_duration_seconds_sum: 20,
    request_duration_seconds_count: 1000,
    ...over,
  },
});

const readiness = (over: Record<string, unknown> = {}) => ({
  data: {
    db: "up",
    redis: "up",
    workers: [
      { name: "scoring", alive: true },
      { name: "badges", alive: true },
    ],
    ...over,
  },
});

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MetricsTab />
    </QueryClientProvider>,
  );
}

describe("MetricsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminMetrics.mockResolvedValue(metrics());
    mockReadinessCheck.mockResolvedValue(readiness());
  });

  it("renders health and request stats from the admin endpoints", async () => {
    renderTab();

    expect(await screen.findByText("Base de dados")).toBeInTheDocument();
    // 5 errors / 1000 requests
    await waitFor(() => expect(screen.getByText("0.5%")).toBeInTheDocument());
    // 20s over 1000 requests = 20ms average
    expect(screen.getByText("20 ms")).toBeInTheDocument();
    expect(screen.getByText("2/2")).toBeInTheDocument();
  });

  it("shows a zero error rate rather than NaN when no requests have been served", async () => {
    mockGetAdminMetrics.mockResolvedValue(
      metrics({ requests_total: 0, errors_5xx: 0, request_duration_seconds_count: 0 }),
    );

    renderTab();

    // 0/0 must not surface as NaN% to an admin mid-rally.
    await waitFor(() => expect(screen.getByText("0.0%")).toBeInTheDocument());
    expect(screen.getByText("0 ms")).toBeInTheDocument();
  });

  it("flags a database that is down", async () => {
    mockReadinessCheck.mockResolvedValue(readiness({ db: "down" }));

    renderTab();

    await waitFor(() => expect(screen.getAllByText("Em baixo").length).toBeGreaterThan(0));
  });

  it("shows an em dash for Redis when readiness reports no value for it", async () => {
    mockReadinessCheck.mockResolvedValue(readiness({ redis: undefined }));

    renderTab();

    await waitFor(() => expect(screen.getByText("—")).toBeInTheDocument());
  });

  it("counts dead workers and lists each worker's state", async () => {
    mockReadinessCheck.mockResolvedValue(
      readiness({
        workers: [
          { name: "scoring", alive: true },
          { name: "badges", alive: false },
        ],
      }),
    );

    renderTab();

    await waitFor(() => expect(screen.getByText("1/2")).toBeInTheDocument());
    expect(screen.getByText("scoring")).toBeInTheDocument();
    expect(screen.getByText("vivo")).toBeInTheDocument();
    expect(screen.getByText("morto")).toBeInTheDocument();
  });

  it("surfaces an error banner when the metrics endpoint fails", async () => {
    mockGetAdminMetrics.mockRejectedValue(new Error("503"));

    renderTab();

    expect(
      await screen.findByText(/Não foi possível obter métricas ou estado de saúde/),
    ).toBeInTheDocument();
  });

  it("explains the latency chart is empty until a second sample arrives", async () => {
    renderTab();

    // The backend stores no history, so a freshly-opened tab has nothing to plot.
    expect(await screen.findByText(/A recolher dados/)).toBeInTheDocument();
    expect(screen.queryByTestId("line-chart")).not.toBeInTheDocument();
  });
});

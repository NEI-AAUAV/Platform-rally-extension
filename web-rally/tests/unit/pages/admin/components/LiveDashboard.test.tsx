import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LiveDashboard from '@/pages/admin/components/LiveDashboard';

const {
  mockGetTeams,
  mockGetCheckpoints,
  mockGetAllEvaluations,
  mockUseScoreboardStream,
  mockUseRallySettings,
  mockUseCountdown,
} = vi.hoisted(() => ({
  mockGetTeams: vi.fn(),
  mockGetCheckpoints: vi.fn(),
  mockGetAllEvaluations: vi.fn(),
  mockUseScoreboardStream: vi.fn(),
  mockUseRallySettings: vi.fn(),
  mockUseCountdown: vi.fn(),
}));

vi.mock('@/client', () => ({
  getTeams: (...args: unknown[]) => mockGetTeams(...args),
  getCheckpoints: (...args: unknown[]) => mockGetCheckpoints(...args),
  getAllEvaluations: (...args: unknown[]) => mockGetAllEvaluations(...args),
}));

vi.mock('@/hooks/useScoreboardStream', () => ({
  default: (...args: unknown[]) => mockUseScoreboardStream(...args),
}));

vi.mock('@/hooks/useRallySettings', () => ({
  default: () => mockUseRallySettings(),
}));

vi.mock('@/pages/home/useCountdown', () => ({
  useCountdown: (...args: unknown[]) => mockUseCountdown(...args),
}));

vi.mock('@/components/shared', () => ({
  ProvisionalBadge: () => <span data-testid="provisional-badge" />,
  FreshnessIndicator: () => <span data-testid="freshness-indicator" />,
}));

vi.mock('@/components/scoreboard/PointsDistributionChart', () => ({
  default: () => <div data-testid="points-distribution-chart" />,
}));

vi.mock('recharts', () => ({
  Bar: ({ children }: { children?: React.ReactNode }) => <div data-testid="bar">{children}</div>,
  BarChart: ({ children }: { children?: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Cell: () => <div data-testid="cell" />,
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const team = (overrides: Partial<any> = {}) => ({
  id: 1,
  name: 'Team Alpha',
  classification: 1,
  total: 100,
  last_checkpoint_number: 2,
  ...overrides,
});

const checkpoint = (overrides: Partial<any> = {}) => ({
  id: 1,
  name: 'Checkpoint 1',
  order: 1,
  ...overrides,
});

describe('LiveDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRallySettings.mockReturnValue({
      settings: { rally_start_time: null, rally_end_time: null },
    });
    mockUseCountdown.mockReturnValue({ phase: 'live', days: 0, hours: 1, minutes: 2, seconds: 3 });
    mockGetTeams.mockResolvedValue({ data: [] });
    mockGetCheckpoints.mockResolvedValue({ data: [] });
    mockGetAllEvaluations.mockResolvedValue({ data: { evaluations: [] } });
  });

  it('renders the phase chip and stat cards with empty data', async () => {
    renderWithClient(<LiveDashboard />);
    expect(await screen.findByText('Estado do evento')).toBeInTheDocument();
    expect(screen.getByText('Equipas')).toBeInTheDocument();
    expect(screen.getByText('Postos')).toBeInTheDocument();
    expect(screen.getByText('Iniciaram')).toBeInTheDocument();
    expect(screen.getByText('Avaliações')).toBeInTheDocument();
  });

  it('shows live phase chip with countdown', async () => {
    renderWithClient(<LiveDashboard />);
    expect(await screen.findByText(/A decorrer — termina em/)).toBeInTheDocument();
  });

  it('shows pre phase chip with countdown', async () => {
    mockUseCountdown.mockReturnValue({ phase: 'pre', days: 1, hours: 2, minutes: 3, seconds: 4 });
    renderWithClient(<LiveDashboard />);
    expect(await screen.findByText(/Começa em/)).toBeInTheDocument();
  });

  it('shows post phase chip', async () => {
    mockUseCountdown.mockReturnValue({ phase: 'post', days: 0, hours: 0, minutes: 0, seconds: 0 });
    renderWithClient(<LiveDashboard />);
    expect(await screen.findByText('Terminada')).toBeInTheDocument();
  });

  it('renders team stats and not-started alert during live phase', async () => {
    mockGetTeams.mockResolvedValue({
      data: [team({ id: 1, last_checkpoint_number: 0 }), team({ id: 2, last_checkpoint_number: 3 })],
    });
    renderWithClient(<LiveDashboard />);
    expect(await screen.findByText(/ainda não iniciou o percurso/)).toBeInTheDocument();
  });

  it('does not show not-started alert when all teams started', async () => {
    mockGetTeams.mockResolvedValue({
      data: [team({ id: 1, last_checkpoint_number: 1 })],
    });
    renderWithClient(<LiveDashboard />);
    await screen.findByText('Estado do evento');
    expect(screen.queryByText(/ainda não iniciou o percurso/)).not.toBeInTheDocument();
  });

  it('renders per-checkpoint chart when checkpoints exist', async () => {
    mockGetCheckpoints.mockResolvedValue({ data: [checkpoint()] });
    mockGetTeams.mockResolvedValue({ data: [team()] });
    renderWithClient(<LiveDashboard />);
    expect(await screen.findByText('Equipas por posto')).toBeInTheDocument();
  });

  it('renders points distribution chart when more than one team exists', async () => {
    mockGetTeams.mockResolvedValue({ data: [team({ id: 1 }), team({ id: 2 })] });
    renderWithClient(<LiveDashboard />);
    expect(await screen.findByTestId('points-distribution-chart')).toBeInTheDocument();
  });

  it('does not render points distribution chart with a single team', async () => {
    mockGetTeams.mockResolvedValue({ data: [team({ id: 1 })] });
    renderWithClient(<LiveDashboard />);
    await screen.findByText('Estado do evento');
    expect(screen.queryByTestId('points-distribution-chart')).not.toBeInTheDocument();
  });

  it('renders the live teams table ranked by classification', async () => {
    mockGetTeams.mockResolvedValue({
      data: [
        team({ id: 1, name: 'Team B', classification: 2, total: 50 }),
        team({ id: 2, name: 'Team A', classification: 1, total: 90 }),
      ],
    });
    mockGetCheckpoints.mockResolvedValue({ data: [checkpoint()] });
    renderWithClient(<LiveDashboard />);
    const rows = await screen.findAllByText(/Team [AB]/);
    expect(rows[0]).toHaveTextContent('Team A');
    expect(rows[1]).toHaveTextContent('Team B');
  });

  it('shows the provisional badge during live phase when teams exist', async () => {
    mockGetTeams.mockResolvedValue({ data: [team()] });
    renderWithClient(<LiveDashboard />);
    expect(await screen.findByTestId('provisional-badge')).toBeInTheDocument();
  });

  it('does not show teams table when there are no teams', async () => {
    renderWithClient(<LiveDashboard />);
    await screen.findByText('Estado do evento');
    expect(screen.queryByText('Equipas ao vivo')).not.toBeInTheDocument();
  });
});

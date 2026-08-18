import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Scoreboard from '@/pages/scoreboard/index';

const {
  mockUseRallySettings,
  mockUseUserStore,
  mockUseTeamAuth,
  mockUseScoreboardStream,
  mockGetTeams,
  mockGetCheckpoints,
} = vi.hoisted(() => ({
  mockUseRallySettings: vi.fn(),
  mockUseUserStore: vi.fn(),
  mockUseTeamAuth: vi.fn(),
  mockUseScoreboardStream: vi.fn(),
  mockGetTeams: vi.fn(),
  mockGetCheckpoints: vi.fn(),
}));

vi.mock('@/hooks/useRallySettings', () => ({
  default: () => mockUseRallySettings(),
}));

vi.mock('@/stores/useUserStore', () => ({
  useUserStore: (selector: (state: unknown) => unknown) => selector(mockUseUserStore()),
}));

vi.mock('@/hooks/useTeamAuth', () => ({
  default: () => mockUseTeamAuth(),
}));

vi.mock('@/hooks/useScoreboardStream', () => ({
  default: (...args: unknown[]) => mockUseScoreboardStream(...args),
}));

vi.mock('@/hooks/useEventTerms', () => ({
  default: () => ({ event: 'rally', checkpoint: 'posto', checkpoints: 'postos' }),
}));

vi.mock('@/client', () => ({
  getCheckpoints: (...args: unknown[]) => mockGetCheckpoints(...args),
  getTeams: (...args: unknown[]) => mockGetTeams(...args),
}));

vi.mock('@tanstack/react-router', () => ({
  Navigate: ({ to }: { to: string }) => <div>Navigate to {to}</div>,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

vi.mock('@/pages/scoreboard/components/ScoreList', () => ({
  Podium: ({ teams }: { teams: { name: string }[] }) => (
    <div>Podium: {teams.map((t) => t.name).join(', ')}</div>
  ),
  ScoreRows: ({ teams }: { teams: { name: string }[] }) => (
    <div>ScoreRows: {teams.map((t) => t.name).join(', ')}</div>
  ),
  ScoreboardSkeleton: () => <div>ScoreboardSkeleton</div>,
}));

vi.mock('@/components/shared', () => ({
  ProvisionalBadge: () => <div>ProvisionalBadge</div>,
  FreshnessIndicator: () => <div>Freshness</div>,
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('Scoreboard index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRallySettings.mockReturnValue({ settings: {} });
    mockUseUserStore.mockReturnValue({ scopes: [] });
    mockUseTeamAuth.mockReturnValue({ isAuthenticated: false, teamData: undefined });
    mockGetTeams.mockResolvedValue({ data: [] });
    mockGetCheckpoints.mockResolvedValue({ data: [] });
  });

  it('shows a hidden notice when score mode hidden for unprivileged users', () => {
    mockUseRallySettings.mockReturnValue({ settings: { show_score_mode: 'hidden' } });
    renderWithClient(<Scoreboard />);
    expect(screen.getByText('Pontuação oculta')).toBeInTheDocument();
  });

  it('shows restricted notice for individual mode without team auth', () => {
    mockUseRallySettings.mockReturnValue({ settings: { show_score_mode: 'individual' } });
    renderWithClient(<Scoreboard />);
    expect(screen.getByText('Pontuação restrita')).toBeInTheDocument();
  });

  it('shows disabled notice when live leaderboard is off', () => {
    mockUseRallySettings.mockReturnValue({ settings: { show_live_leaderboard: false } });
    renderWithClient(<Scoreboard />);
    expect(screen.getByText('Leaderboard indisponível')).toBeInTheDocument();
  });

  it('shows empty state when there are no teams', async () => {
    mockGetTeams.mockResolvedValue({ data: [] });
    renderWithClient(<Scoreboard />);
    expect(await screen.findByText('Ainda não há equipas classificadas.')).toBeInTheDocument();
  });

  it('renders podium and score rows for teams', async () => {
    mockGetTeams.mockResolvedValue({
      data: [
        { id: 1, name: 'A', classification: 1, total: 100 },
        { id: 2, name: 'B', classification: 2, total: 90 },
        { id: 3, name: 'C', classification: 3, total: 80 },
        { id: 4, name: 'D', classification: 4, total: 70 },
      ],
    });
    renderWithClient(<Scoreboard />);
    expect(await screen.findByText(/Podium:/)).toBeInTheDocument();
    expect(screen.getByText(/ScoreRows: D/)).toBeInTheDocument();
    expect(screen.getByText('Entrar com a Equipa')).toBeInTheDocument();
  });

  it('shows own team card when teamData matches a team', async () => {
    mockUseTeamAuth.mockReturnValue({ isAuthenticated: true, teamData: { team_id: 2 } });
    mockGetTeams.mockResolvedValue({
      data: [
        { id: 1, name: 'A', classification: 1, total: 100 },
        { id: 2, name: 'B', classification: 2, total: 90 },
      ],
    });
    renderWithClient(<Scoreboard />);
    await screen.findByText(/Podium:/);
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('Ver progresso')).toBeInTheDocument();
  });

  it('allows privileged users to view scoreboard even when hidden', async () => {
    mockUseRallySettings.mockReturnValue({ settings: { show_score_mode: 'hidden' } });
    mockUseUserStore.mockReturnValue({ scopes: ['admin'] });
    mockGetTeams.mockResolvedValue({ data: [] });
    renderWithClient(<Scoreboard />);
    expect(await screen.findByText('Ainda não há equipas classificadas.')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeamProgress from '@/pages/team-progress/index';
import type { DetailedTeam, DetailedCheckPoint } from '@/client';

const { mockUseTeamProgress, mockUseTeamNotifications } = vi.hoisted(() => ({
  mockUseTeamProgress: vi.fn(),
  mockUseTeamNotifications: vi.fn(),
}));

vi.mock('@/pages/team-progress/useTeamProgress', () => ({
  useTeamProgress: () => mockUseTeamProgress(),
}));

vi.mock('@/hooks/useTeamNotifications', () => ({
  default: (...args: unknown[]) => mockUseTeamNotifications(...args),
}));

vi.mock('@/pages/team-progress/StatusScreen', () => ({
  default: ({ title }: { title: string }) => <div data-testid="status-screen">{title}</div>,
}));

vi.mock('@/pages/team-progress/TeamProgressSkeleton', () => ({
  default: () => <div data-testid="skeleton" />,
}));

vi.mock('@/pages/team-progress/TeamHeaderCard', () => ({
  default: () => <div data-testid="header-card" />,
}));

vi.mock('@/pages/team-progress/TeamMembersCard', () => ({
  default: () => <div data-testid="members-card" />,
}));

vi.mock('@/pages/team-progress/ProgressSummaryCard', () => ({
  default: () => <div data-testid="summary-card" />,
}));

vi.mock('@/pages/team-progress/NextCheckpointCard', () => ({
  default: () => <div data-testid="next-checkpoint" />,
}));

vi.mock('@/pages/team-progress/RouteCheckpointItem', () => ({
  default: ({ index }: { index: number }) => <div data-testid={`route-item-${index}`} />,
}));

vi.mock('@/pages/checkpoints/components/MapSection', () => ({
  default: () => <div data-testid="map-section" />,
}));

const team = { name: 'Team A', total: 30, last_checkpoint_number: 1, times: ['t1'] } as DetailedTeam;
const checkpoints = [
  { id: 1, order: 1, name: 'Posto 1' },
  { id: 2, order: 2, name: 'Posto 2' },
] as DetailedCheckPoint[];

const baseHookReturn = {
  settings: { participant_view_enabled: true, show_checkpoint_map: true },
  team,
  checkpoints,
  isLoading: false,
  teamError: null,
  expandedCheckpoints: new Set<number>(),
  toggleCheckpoint: vi.fn(),
  completedCheckpointsCount: 1,
  nextCheckpoint: checkpoints[1],
  showScore: true,
  showRanking: true,
  totalCount: 2,
};

describe('TeamProgress page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTeamProgress.mockReturnValue(baseHookReturn);
  });

  it('shows the skeleton while loading', () => {
    mockUseTeamProgress.mockReturnValue({ ...baseHookReturn, isLoading: true });
    render(<TeamProgress />);
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
  });

  it('shows a disabled-view status screen when participant view is disabled', () => {
    mockUseTeamProgress.mockReturnValue({
      ...baseHookReturn,
      settings: { participant_view_enabled: false },
    });
    render(<TeamProgress />);
    expect(screen.getByTestId('status-screen')).toHaveTextContent('Vista não disponível');
  });

  it('shows an error status screen when teamError is set', () => {
    mockUseTeamProgress.mockReturnValue({
      ...baseHookReturn,
      teamError: new Error('fail'),
    });
    render(<TeamProgress />);
    expect(screen.getByTestId('status-screen')).toHaveTextContent('Erro ao carregar');
  });

  it('shows an error status screen when team is missing', () => {
    mockUseTeamProgress.mockReturnValue({ ...baseHookReturn, team: undefined });
    render(<TeamProgress />);
    expect(screen.getByTestId('status-screen')).toHaveTextContent('Erro ao carregar');
  });

  it('renders the full progress layout on success', () => {
    render(<TeamProgress />);
    expect(screen.getByTestId('header-card')).toBeInTheDocument();
    expect(screen.getByTestId('members-card')).toBeInTheDocument();
    expect(screen.getByTestId('summary-card')).toBeInTheDocument();
    expect(screen.getByTestId('map-section')).toBeInTheDocument();
    expect(screen.getByTestId('next-checkpoint')).toBeInTheDocument();
    expect(screen.getByTestId('route-item-0')).toBeInTheDocument();
    expect(screen.getByTestId('route-item-1')).toBeInTheDocument();
    expect(screen.getByText('Percurso')).toBeInTheDocument();
  });

  it('hides the map when show_checkpoint_map is false', () => {
    mockUseTeamProgress.mockReturnValue({
      ...baseHookReturn,
      settings: { participant_view_enabled: true, show_checkpoint_map: false },
    });
    render(<TeamProgress />);
    expect(screen.queryByTestId('map-section')).not.toBeInTheDocument();
  });

  it('does not render the route section when there are no checkpoints', () => {
    mockUseTeamProgress.mockReturnValue({
      ...baseHookReturn,
      checkpoints: [],
      nextCheckpoint: undefined,
    });
    render(<TeamProgress />);
    expect(screen.queryByText('Percurso')).not.toBeInTheDocument();
    expect(screen.queryByTestId('next-checkpoint')).not.toBeInTheDocument();
  });
});

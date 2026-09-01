import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeamsById from '@/pages/teams/[id]/index';
import type { DetailedTeam } from '@/client';

const { mockUseParams, mockUseTeamDetails } = vi.hoisted(() => ({
  mockUseParams: vi.fn(),
  mockUseTeamDetails: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  useParams: () => mockUseParams(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
}));

vi.mock('@/pages/teams/[id]/useTeamDetails', () => ({
  useTeamDetails: (...args: unknown[]) => mockUseTeamDetails(...args),
}));

vi.mock('@/pages/teams/[id]/NextCheckpointCard', () => ({
  NextCheckpointCard: () => <div data-testid="next-checkpoint" />,
}));

vi.mock('@/pages/teams/[id]/CheckpointTimelineItem', () => ({
  CheckpointTimelineItem: ({
    index,
    isExpanded,
    onToggle,
  }: {
    index: number;
    isExpanded: boolean;
    onToggle: (i: number) => void;
  }) => (
    <button type="button" data-testid={`timeline-${index}`} onClick={() => onToggle(index)}>
      {isExpanded ? 'expanded' : 'collapsed'}
    </button>
  ),
}));

vi.mock('@/components/badges/BadgeShowcase', () => ({
  BadgeShowcase: () => <div data-testid="badges" />,
}));

vi.mock('@/components/shared/ShareButton', () => ({
  ShareButton: () => <button type="button">Partilhar</button>,
}));

const baseTeam: Partial<DetailedTeam> = {
  name: 'Team Alpha',
  classification: 1,
  total: 100,
  last_checkpoint_number: 2,
  times: ['2024-01-01T10:00:00Z', '2024-01-01T11:00:00Z'],
  members: [{ id: 1, name: 'Alice Smith' }] as never,
};

describe('TeamsById page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ id: '1' });
  });

  it('redirects to /teams when id is not a number', () => {
    mockUseParams.mockReturnValue({ id: 'abc' });
    mockUseTeamDetails.mockReturnValue({
      settings: {},
      team: undefined,
      isLoading: false,
      isSuccess: false,
      checkpoints: [],
      activityResults: [],
      allEvaluations: [],
      totalTeams: 0,
      totalCount: 0,
      resolvedOrders: new Set<number>(),
      nextCheckpoint: undefined,
      isRouteFinished: false,
      rank: null,
    });
    render(<TeamsById />);
    expect(screen.getByTestId('navigate')).toHaveTextContent('/teams');
  });

  it('shows loading message', () => {
    mockUseTeamDetails.mockReturnValue({
      settings: {},
      team: undefined,
      isLoading: true,
      isSuccess: false,
      checkpoints: [],
      activityResults: [],
      allEvaluations: [],
      totalTeams: 0,
      totalCount: 0,
      resolvedOrders: new Set<number>(),
      nextCheckpoint: undefined,
      isRouteFinished: false,
      rank: null,
    });
    render(<TeamsById />);
    expect(screen.getByText('A carregar...')).toBeInTheDocument();
  });

  it('shows hidden-details message when isSuccess but no team details shown', () => {
    mockUseTeamDetails.mockReturnValue({
      settings: { show_team_details: false },
      team: undefined,
      isLoading: false,
      isSuccess: true,
      checkpoints: [],
      activityResults: [],
      allEvaluations: [],
      totalTeams: 0,
      totalCount: 0,
      resolvedOrders: new Set<number>(),
      nextCheckpoint: undefined,
      isRouteFinished: false,
      rank: null,
    });
    render(<TeamsById />);
    expect(screen.getByText('Detalhes da equipa ocultos')).toBeInTheDocument();
  });

  it('renders full team details when successful', () => {
    mockUseTeamDetails.mockReturnValue({
      settings: { show_team_details: true, show_score_mode: 'visible', badges_enabled: true },
      team: baseTeam,
      isLoading: false,
      isSuccess: true,
      checkpoints: [
        { id: 1, order: 1 },
        { id: 2, order: 2 },
      ],
      activityResults: [],
      allEvaluations: [],
      totalTeams: 4,
      totalCount: 3,
      resolvedOrders: new Set<number>([1, 2]),
      nextCheckpoint: undefined,
      isRouteFinished: false,
      rank: 1,
    });
    render(<TeamsById />);
    expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Smith')).toBeInTheDocument();
    expect(screen.getByTestId('badges')).toBeInTheDocument();
    expect(screen.getByTestId('next-checkpoint')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-0')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-1')).toBeInTheDocument();
  });

  it('hides score and badges when settings disable them', () => {
    mockUseTeamDetails.mockReturnValue({
      settings: { show_team_details: true, show_score_mode: 'hidden', badges_enabled: false },
      team: baseTeam,
      isLoading: false,
      isSuccess: true,
      checkpoints: [],
      activityResults: [],
      allEvaluations: [],
      totalTeams: 0,
      totalCount: 3,
      resolvedOrders: new Set<number>(),
      nextCheckpoint: undefined,
      isRouteFinished: false,
      rank: null,
    });
    render(<TeamsById />);
    expect(screen.queryByText('Pontuação')).not.toBeInTheDocument();
    expect(screen.queryByTestId('badges')).not.toBeInTheDocument();
  });

  it('shows the "no checkpoints visited" placeholder when the team has none', () => {
    const teamNoCheckpoints = { ...baseTeam, last_checkpoint_number: 0, times: [] };
    mockUseTeamDetails.mockReturnValue({
      settings: { show_team_details: true },
      team: teamNoCheckpoints,
      isLoading: false,
      isSuccess: true,
      checkpoints: [],
      activityResults: [],
      allEvaluations: [],
      totalTeams: 0,
      totalCount: 3,
      resolvedOrders: new Set<number>(),
      nextCheckpoint: undefined,
      isRouteFinished: false,
      rank: null,
    });
    render(<TeamsById />);
    expect(screen.getByText('Ainda sem postos visitados')).toBeInTheDocument();
  });

  it('toggles checkpoint expansion state (expand then collapse)', async () => {
    mockUseTeamDetails.mockReturnValue({
      settings: { show_team_details: true },
      team: baseTeam,
      isLoading: false,
      isSuccess: true,
      checkpoints: [{ id: 1, order: 1 }],
      activityResults: [],
      allEvaluations: [],
      totalTeams: 4,
      totalCount: 3,
      resolvedOrders: new Set<number>([1]),
      nextCheckpoint: undefined,
      isRouteFinished: false,
      rank: 1,
    });
    const user = userEvent.setup();
    render(<TeamsById />);

    const toggle = screen.getByTestId('timeline-0');
    expect(toggle).toHaveTextContent('collapsed');

    await user.click(toggle);
    expect(toggle).toHaveTextContent('expanded');

    // Clicking again removes the index from the expanded set.
    await user.click(toggle);
    expect(toggle).toHaveTextContent('collapsed');
  });

  it('renders nothing extra when not loading, not successful, and id is a number', () => {
    mockUseTeamDetails.mockReturnValue({
      settings: {},
      team: undefined,
      isLoading: false,
      isSuccess: false,
      checkpoints: [],
      activityResults: [],
      allEvaluations: [],
      totalTeams: 0,
      totalCount: 0,
      resolvedOrders: new Set<number>(),
      nextCheckpoint: undefined,
      isRouteFinished: false,
      rank: null,
    });
    render(<TeamsById />);
    expect(screen.queryByText('A carregar...')).not.toBeInTheDocument();
    expect(screen.queryByText('Detalhes da equipa ocultos')).not.toBeInTheDocument();
    expect(screen.getByText('Voltar à lista de equipas')).toBeInTheDocument();
  });
});

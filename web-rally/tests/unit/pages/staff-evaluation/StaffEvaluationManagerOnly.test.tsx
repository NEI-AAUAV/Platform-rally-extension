import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ManagerEvaluationPage from '@/pages/staff-evaluation/manager-only';

const {
  mockUseUserStore,
  mockNavigate,
  mockUseRallySettings,
  mockUseRallyEventStream,
  mockUseQuery,
  mockGetCheckpoints,
  mockGetActivities,
  mockGetTeams,
  mockGetAllEvaluations,
} = vi.hoisted(() => ({
  mockUseUserStore: vi.fn(),
  mockNavigate: vi.fn(),
  mockUseRallySettings: vi.fn(),
  mockUseRallyEventStream: vi.fn(),
  mockUseQuery: vi.fn(),
  mockGetCheckpoints: vi.fn(),
  mockGetActivities: vi.fn(),
  mockGetTeams: vi.fn(),
  mockGetAllEvaluations: vi.fn(),
}));

vi.mock('@/stores/useUserStore', () => ({
  useUserStore: () => mockUseUserStore(),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/hooks/useRallySettings', () => ({
  default: () => mockUseRallySettings(),
}));

vi.mock('@/hooks/useRallyEventStream', () => ({
  default: (...args: unknown[]) => mockUseRallyEventStream(...args),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock('@/client', () => ({
  getCheckpoints: mockGetCheckpoints,
  getActivities: mockGetActivities,
  getTeams: mockGetTeams,
  getAllEvaluations: mockGetAllEvaluations,
}));

vi.mock('@/pages/staff-evaluation/components/AssignedCheckpoints', () => ({
  AssignedCheckpoints: ({ checkpoints }: { checkpoints: unknown[] }) => (
    <div data-testid="assigned-checkpoints">{checkpoints.length} checkpoints</div>
  ),
}));

vi.mock('@/pages/staff-evaluation/components/AllEvaluations', () => ({
  AllEvaluations: ({ evaluations }: { evaluations: unknown[] }) => (
    <div data-testid="all-evaluations">{evaluations.length} evaluations</div>
  ),
}));

const team = { id: 1, name: 'Team A', num_members: 3, total: 10, classification: '1st', last_checkpoint_number: 2 };

describe('ManagerEvaluationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUserStore.mockReturnValue({ token: 'tok' });
    mockUseRallySettings.mockReturnValue({ settings: { show_score_mode: 'visible' } });
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === 'allCheckpoints') return { data: [{ id: 1, name: 'CP1' }] };
      if (queryKey[0] === 'allActivities') return { data: { activities: [] } };
      if (queryKey[0] === 'allTeams') return { data: [team] };
      if (queryKey[0] === 'allEvaluations') return { data: [], isLoading: false };
      return { data: undefined };
    });
  });

  it('renders header, team overview, and stats', () => {
    render(<ManagerEvaluationPage />);
    expect(screen.getByText('Painel de avaliação')).toBeInTheDocument();
    expect(screen.getByText('Team A')).toBeInTheDocument();
    expect(screen.getByText('Membros: 3')).toBeInTheDocument();
    expect(screen.getByText('Pontuação: 10')).toBeInTheDocument();
    expect(screen.getByText('Classificação: 1st')).toBeInTheDocument();
  });

  it('does not render header when embedded', () => {
    render(<ManagerEvaluationPage embedded />);
    expect(screen.queryByText('Painel de avaliação')).not.toBeInTheDocument();
  });

  it('toggles all evaluations section', () => {
    render(<ManagerEvaluationPage />);
    fireEvent.click(screen.getByText('Todas as Avaliações'));
    expect(screen.getByTestId('all-evaluations')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Todas as Avaliações'));
    expect(screen.queryByTestId('all-evaluations')).not.toBeInTheDocument();
  });

  it('shows loading label for evaluations count while loading', () => {
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === 'allCheckpoints') return { data: [] };
      if (queryKey[0] === 'allActivities') return { data: { activities: [] } };
      if (queryKey[0] === 'allTeams') return { data: [] };
      if (queryKey[0] === 'allEvaluations') return { data: undefined, isLoading: true };
      return { data: undefined };
    });
    render(<ManagerEvaluationPage />);
    expect(screen.getByText('A carregar...')).toBeInTheDocument();
  });

  it('hides score fields when show_score_mode is hidden', () => {
    mockUseRallySettings.mockReturnValue({ settings: { show_score_mode: 'hidden' } });
    render(<ManagerEvaluationPage />);
    expect(screen.queryByText('Pontuação: 10')).not.toBeInTheDocument();
  });

  describe('queryFn implementations', () => {
    let queryFns: Record<string, () => Promise<unknown>>;

    beforeEach(() => {
      queryFns = {};
      mockUseQuery.mockImplementation(
        ({ queryKey, queryFn }: { queryKey: string[]; queryFn?: () => Promise<unknown> }) => {
          if (queryFn && queryKey[0]) queryFns[queryKey[0]] = queryFn;
          if (queryKey[0] === 'allCheckpoints') return { data: [{ id: 1, name: 'CP1' }] };
          if (queryKey[0] === 'allActivities') return { data: { activities: [] } };
          if (queryKey[0] === 'allTeams') return { data: [team] };
          if (queryKey[0] === 'allEvaluations') return { data: [], isLoading: false };
          return { data: undefined };
        },
      );
    });

    it('allCheckpoints queryFn fetches and returns checkpoint data', async () => {
      mockGetCheckpoints.mockResolvedValue({ data: [{ id: 5, name: 'CP5' }] });
      render(<ManagerEvaluationPage />);
      const result = await queryFns.allCheckpoints!();
      expect(mockGetCheckpoints).toHaveBeenCalled();
      expect(result).toEqual([{ id: 5, name: 'CP5' }]);
    });

    it('allActivities queryFn fetches and returns activities data', async () => {
      mockGetActivities.mockResolvedValue({ data: { activities: [{ id: 9 }] } });
      render(<ManagerEvaluationPage />);
      const result = await queryFns.allActivities!();
      expect(mockGetActivities).toHaveBeenCalled();
      expect(result).toEqual({ activities: [{ id: 9 }] });
    });

    it('allTeams queryFn fetches and returns teams data', async () => {
      mockGetTeams.mockResolvedValue({ data: [{ id: 3, name: 'Team Z' }] });
      render(<ManagerEvaluationPage />);
      const result = await queryFns.allTeams!();
      expect(mockGetTeams).toHaveBeenCalled();
      expect(result).toEqual([{ id: 3, name: 'Team Z' }]);
    });

    it('allEvaluations queryFn returns empty array when response has no evaluations', async () => {
      mockGetAllEvaluations.mockResolvedValue({ data: null });
      render(<ManagerEvaluationPage />);
      const result = await queryFns.allEvaluations!();
      expect(result).toEqual([]);
    });

    it('allEvaluations queryFn returns empty array when evaluations field missing', async () => {
      mockGetAllEvaluations.mockResolvedValue({ data: {} });
      render(<ManagerEvaluationPage />);
      const result = await queryFns.allEvaluations!();
      expect(result).toEqual([]);
    });

    it('allEvaluations queryFn transforms raw evaluation results with fallbacks', async () => {
      mockGetAllEvaluations.mockResolvedValue({
        data: {
          evaluations: [
            {
              id: 1,
              team_id: 10,
              activity_id: 20,
              final_score: null,
              is_completed: null,
              completed_at: null,
              result_data: null,
              extra_shots: null,
              penalties: null,
              time_score: null,
              points_score: null,
              boolean_score: null,
              team: undefined,
              activity: undefined,
            },
          ],
        },
      });
      render(<ManagerEvaluationPage />);
      const result = (await queryFns.allEvaluations!()) as Array<Record<string, unknown>>;
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 1,
        team_id: 10,
        activity_id: 20,
        final_score: 0,
        is_completed: false,
        completed_at: '',
        result_data: {},
        extra_shots: 0,
        penalties: {},
        team: { id: 10, name: 'Team 10', num_members: undefined },
        activity: {
          id: 20,
          name: 'Activity 20',
          activity_type: 'GeneralActivity',
          checkpoint_id: 1,
        },
      });
    });

    it('allEvaluations queryFn preserves provided team/activity relationship data', async () => {
      mockGetAllEvaluations.mockResolvedValue({
        data: {
          evaluations: [
            {
              id: 2,
              team_id: 10,
              activity_id: 20,
              final_score: 42,
              is_completed: true,
              completed_at: '2024-01-01',
              result_data: { a: 1 },
              extra_shots: 3,
              penalties: { late: 1 },
              time_score: 5,
              points_score: 6,
              boolean_score: true,
              team: { id: 10, name: 'Real Team', members: [1, 2] },
              activity: {
                id: 20,
                name: 'Real Activity',
                activity_type: 'TimedActivity',
                checkpoint_id: 3,
                description: 'desc',
              },
            },
          ],
        },
      });
      render(<ManagerEvaluationPage />);
      const result = (await queryFns.allEvaluations!()) as Array<Record<string, unknown>>;
      expect(result[0]).toMatchObject({
        final_score: 42,
        is_completed: true,
        completed_at: '2024-01-01',
        team: { id: 10, name: 'Real Team', num_members: 2 },
        activity: {
          id: 20,
          name: 'Real Activity',
          activity_type: 'TimedActivity',
          checkpoint_id: 3,
          description: 'desc',
        },
      });
    });
  });

  it('calls navigate with checkpoint id when handleCheckpointClick fires via AssignedCheckpoints', async () => {
    vi.resetModules();
    vi.doMock('@/pages/staff-evaluation/components/AssignedCheckpoints', () => ({
      AssignedCheckpoints: ({
        checkpoints,
        onCheckpointClick,
      }: {
        checkpoints: Array<{ id: number }>;
        onCheckpointClick: (checkpoint: { id: number }) => void;
      }) => (
        <button type="button" onClick={() => onCheckpointClick(checkpoints[0]!)}>
          click-checkpoint
        </button>
      ),
    }));

    const { default: FreshManagerEvaluationPage } = await import(
      '@/pages/staff-evaluation/manager-only'
    );

    render(<FreshManagerEvaluationPage />);
    fireEvent.click(screen.getByText('click-checkpoint'));

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/staff-evaluation/checkpoint/$checkpointId',
      params: { checkpointId: '1' },
    });
  });
});

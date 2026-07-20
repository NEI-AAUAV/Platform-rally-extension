import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CheckpointTeamEvaluation from '@/pages/staff-evaluation/components/CheckpointTeamEvaluation';

const {
  mockUseParams,
  mockUseRallySettings,
  mockUseRallyEventStream,
  mockUseCheckpointEvaluation,
} = vi.hoisted(() => ({
  mockUseParams: vi.fn(),
  mockUseRallySettings: vi.fn(),
  mockUseRallyEventStream: vi.fn(),
  mockUseCheckpointEvaluation: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  useParams: (...args: unknown[]) => mockUseParams(...args),
}));

vi.mock('@/hooks/useRallySettings', () => ({
  default: () => mockUseRallySettings(),
}));

vi.mock('@/hooks/useRallyEventStream', () => ({
  default: (...args: unknown[]) => mockUseRallyEventStream(...args),
}));

vi.mock('@/pages/staff-evaluation/components/useCheckpointEvaluation', () => ({
  useCheckpointEvaluation: (...args: unknown[]) => mockUseCheckpointEvaluation(...args),
}));

vi.mock('@/components/checkin/StaffCheckinScanner', () => ({
  StaffCheckinScanner: ({ onTeamIdentified }: { onTeamIdentified: (id: number) => void }) => (
    <button onClick={() => onTeamIdentified(1)}>scan-team</button>
  ),
}));

vi.mock('@/pages/staff-evaluation/components/TeamActivitiesList', () => ({
  TeamActivitiesList: ({ team }: { team: { name: string } }) => (
    <div data-testid="team-activities">{team.name}</div>
  ),
}));

vi.mock('@/pages/staff-evaluation/components/OfflineQueueBanner', () => ({
  default: () => null,
}));

const baseHookState = {
  checkpoint: { id: 1, name: 'CP1', order: 2 },
  checkpointTeams: [
    { id: 1, name: 'Team A', last_checkpoint_number: 1 },
    { id: 2, name: 'Team B', last_checkpoint_number: 0 },
    { id: 3, name: 'Team C', last_checkpoint_number: 2 },
  ],
  teamEvaluationStatus: {},
  teamActivities: [],
  teamActivitiesLoading: false,
  selectedTeam: null,
  showTeamList: true,
  evaluationSummary: null,
  showWarningDialog: false,
  isEvaluating: false,
  handleEvaluateActivity: vi.fn(),
  selectTeam: vi.fn(),
  backToTeams: vi.fn(),
  dismissWarning: vi.fn(),
};

describe('CheckpointTeamEvaluation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ checkpointId: '1' });
    mockUseRallySettings.mockReturnValue({ settings: { show_score_mode: 'visible' } });
    mockUseCheckpointEvaluation.mockReturnValue(baseHookState);
  });

  it('renders not-found state when checkpoint is missing', () => {
    mockUseCheckpointEvaluation.mockReturnValue({ ...baseHookState, checkpoint: undefined });
    render(<CheckpointTeamEvaluation />);
    expect(screen.getByText('Posto não encontrado')).toBeInTheDocument();
  });

  it('renders team sections, splitting by checkpoint status', () => {
    render(<CheckpointTeamEvaluation />);
    expect(screen.getByText('Equipas para avaliar')).toBeInTheDocument();
    expect(screen.getByText('Team A')).toBeInTheDocument();
    expect(screen.getByText('Team B')).toBeInTheDocument();
    expect(screen.getByText('Team C')).toBeInTheDocument();
  });

  it('shows no-teams message when checkpointTeams is empty', () => {
    mockUseCheckpointEvaluation.mockReturnValue({ ...baseHookState, checkpointTeams: [] });
    render(<CheckpointTeamEvaluation />);
    expect(screen.getByText('Nenhuma equipa disponível')).toBeInTheDocument();
  });

  it('shows team activities detail view when a team is selected', () => {
    mockUseCheckpointEvaluation.mockReturnValue({
      ...baseHookState,
      selectedTeam: { id: 1, name: 'Team A' },
      showTeamList: false,
    });
    render(<CheckpointTeamEvaluation />);
    expect(screen.getByTestId('team-activities')).toHaveTextContent('Team A');
  });

  it('shows loading spinner while team activities load', () => {
    mockUseCheckpointEvaluation.mockReturnValue({
      ...baseHookState,
      selectedTeam: { id: 1, name: 'Team A' },
      showTeamList: false,
      teamActivitiesLoading: true,
    });
    render(<CheckpointTeamEvaluation />);
    expect(screen.getByText('A carregar atividades...')).toBeInTheDocument();
  });

  it('calls backToTeams when back button clicked', () => {
    const backToTeams = vi.fn();
    mockUseCheckpointEvaluation.mockReturnValue({
      ...baseHookState,
      selectedTeam: { id: 1, name: 'Team A' },
      showTeamList: false,
      backToTeams,
    });
    render(<CheckpointTeamEvaluation />);
    fireEvent.click(screen.getByText('Voltar às equipas'));
    expect(backToTeams).toHaveBeenCalled();
  });

  it('selects team when scanner identifies a team', () => {
    const selectTeam = vi.fn();
    mockUseCheckpointEvaluation.mockReturnValue({ ...baseHookState, selectTeam });
    render(<CheckpointTeamEvaluation />);
    fireEvent.click(screen.getByText('scan-team'));
    expect(selectTeam).toHaveBeenCalledWith(baseHookState.checkpointTeams[0]);
  });

  it('does not select a team when scanner reports an unknown team id', () => {
    const selectTeam = vi.fn();
    mockUseCheckpointEvaluation.mockReturnValue({
      ...baseHookState,
      selectTeam,
      checkpointTeams: [],
    });
    render(<CheckpointTeamEvaluation />);
    fireEvent.click(screen.getByText('scan-team'));
    expect(selectTeam).not.toHaveBeenCalled();
  });

  it('falls back to order 0 and empty teams when checkpoint.order and checkpointTeams are missing', () => {
    mockUseCheckpointEvaluation.mockReturnValue({
      ...baseHookState,
      checkpoint: { id: 1, name: 'CP1' },
      checkpointTeams: undefined,
    });
    render(<CheckpointTeamEvaluation />);
    expect(screen.getByText('Nenhuma equipa disponível')).toBeInTheDocument();
    expect(screen.getByText('0/0')).toBeInTheDocument();
  });

  it('renders team activities with empty array fallback when teamActivities is undefined', () => {
    mockUseCheckpointEvaluation.mockReturnValue({
      ...baseHookState,
      selectedTeam: { id: 1, name: 'Team A' },
      showTeamList: false,
      teamActivities: undefined,
    });
    render(<CheckpointTeamEvaluation />);
    expect(screen.getByTestId('team-activities')).toHaveTextContent('Team A');
  });

  it('shows warning dialog when showWarningDialog is true', () => {
    mockUseCheckpointEvaluation.mockReturnValue({
      ...baseHookState,
      showWarningDialog: true,
      evaluationSummary: {
        total_activities: 1,
        completed_activities: 0,
        pending_activities: 1,
        completion_rate: 0,
        has_incomplete: true,
        missing_activities: [],
      },
    });
    render(<CheckpointTeamEvaluation />);
    expect(screen.getByText('Incomplete Evaluations Detected')).toBeInTheDocument();
  });
});

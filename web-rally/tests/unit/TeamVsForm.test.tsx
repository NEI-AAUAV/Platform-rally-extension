import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import TeamVsForm from '@/components/forms/TeamVsForm';
import type { ListingTeam } from '@/client';


// Use vi.hoisted() so these are initialized before vi.mock factories run
const { mockUseRallySettings, mockToast, mockVersusService, mockTeamService } = vi.hoisted(() => ({
  mockUseRallySettings: vi.fn(),
  mockToast: { error: vi.fn(), success: vi.fn() },
  mockVersusService: {
    getTeamOpponentApiRallyV1VersusTeamTeamIdOpponentGet: vi.fn(),
  },
  mockTeamService: {
    getTeamsApiRallyV1TeamGet: vi.fn(),
  },
}));

// Mock dependencies
vi.mock('@/components/themes/bloody', () => ({
  BloodyButton: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock('@/hooks/useRallySettings', () => ({
  default: () => mockUseRallySettings(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useAppToast: () => mockToast,
}));

vi.mock('@/client', () => ({
  VersusService: mockVersusService,
  TeamService: mockTeamService,
}));

describe('TeamVsForm', () => {
  const mockTeam = { id: 1, name: 'Team A' } as ListingTeam;
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRallySettings.mockReturnValue({
      settings: {
        raw_settings: {
          extra_shots_penalty_per_member: 1,
          penalty_values: { vomit: 50, not_drinking: 20 },
        },
      },
    });
    mockVersusService.getTeamOpponentApiRallyV1VersusTeamTeamIdOpponentGet.mockResolvedValue({});
    mockTeamService.getTeamsApiRallyV1TeamGet.mockResolvedValue([
      { id: 2, name: 'Team B' },
      { id: 3, name: 'Team C' },
    ]);
  });

  it('renders correctly with tiered scoring', async () => {
    const config = {
      base_points: 10,
      completion_points: 20,
      win_points: 30,
    };

    render(
      <TeamVsForm
        team={mockTeam}
        config={config}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
      />
    );

    expect(screen.getByText('Match Result')).toBeInTheDocument();
    expect(screen.getByText('Challenge Completed?')).toBeInTheDocument();
    expect(screen.getByText('Pontuação estimada')).toBeInTheDocument();
    // Base points (10) + Completion (20) + Win (30) = 60
    expect(screen.getByText('60 pts')).toBeInTheDocument();
  });

  it('renders correctly without tiered scoring (backwards compatibility)', async () => {
    const config = { win_points: 100 }; // No base/completion

    render(
      <TeamVsForm
        team={mockTeam}
        config={config}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
      />
    );

    expect(screen.queryByText('Challenge Completed?')).not.toBeInTheDocument();
    expect(screen.queryByText('Pontuação estimada')).not.toBeInTheDocument();
  });

  it('updates completed state and score preview', async () => {
    const config = {
      base_points: 10,
      completion_points: 20,
      win_points: 30,
    };

    render(
      <TeamVsForm
        team={mockTeam}
        config={config}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
      />
    );

    // Initial state: Completed (true) -> 60 pts
    expect(screen.getByText('60 pts')).toBeInTheDocument();

    // Click toggle to turn off completed
    fireEvent.click(screen.getByTestId('toggle-completed'));

    // Should now be incomplete -> 40 pts (10 base + 30 win)
    expect(screen.getByText('✗ Não completou o desafio')).toBeInTheDocument();
    expect(screen.getByText('40 pts')).toBeInTheDocument();
  });

  it('updates score based on result selection', async () => {
    const config = {
      base_points: 10,
      completion_points: 20,
      win_points: 30,
      draw_points: 15,
      lose_points: 5,
    };

    render(
      <TeamVsForm
        team={mockTeam}
        config={config}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
      />
    );

    // Initial (Win): 60 pts
    expect(screen.getByText('60 pts')).toBeInTheDocument();

    // Change to Draw
    fireEvent.change(screen.getByTestId('select-result'), {
      target: { value: 'draw' },
    });
    // Draw (15) + Base (10) + Completion (20) = 45
    expect(screen.getByText('45 pts')).toBeInTheDocument();

    // Change to Lose
    fireEvent.change(screen.getByTestId('select-result'), {
      target: { value: 'lose' },
    });
    // Lose (5) + Base (10) + Completion (20) = 35
    expect(screen.getByText('35 pts')).toBeInTheDocument();
  });

  it('submits correct data including completed status', async () => {
    const config = {
      base_points: 10,
      completion_points: 20,
    };

    render(
      <TeamVsForm
        team={mockTeam}
        config={config}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
      />
    );

    // Wait for teams to load
    await waitFor(() => {
      expect(mockTeamService.getTeamsApiRallyV1TeamGet).toHaveBeenCalled();
    });

    // Select opponent
    fireEvent.change(screen.getAllByRole('combobox')[1]!, { // Opponent select
      target: { value: '2' }
    });

    // Submit
    fireEvent.click(screen.getByText('Submit Evaluation'));

    expect(mockOnSubmit).toHaveBeenCalledWith({
      result_data: {
        result: 'win', // default
        completed: true, // default
        opponent_team_id: 2,
        notes: '',
      },
      extra_shots: 0,
      penalties: {},
    });
  });

  it('pre-selects opponent if API returns one', async () => {
    mockVersusService.getTeamOpponentApiRallyV1VersusTeamTeamIdOpponentGet.mockResolvedValue({
      opponent_id: 3,
      opponent_name: 'Team C'
    });

    render(
      <TeamVsForm
        team={mockTeam}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
        config={{}}
      />
    );


    await waitFor(() => {
      expect(screen.getByDisplayValue('Team C')).toBeInTheDocument();
      // Should see "Opponent automatically set"
      expect(screen.getByText(/Opponent automatically set/i)).toBeInTheDocument();
    });
  });
});

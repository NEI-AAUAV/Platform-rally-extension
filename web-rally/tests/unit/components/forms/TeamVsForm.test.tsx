import type { ComponentProps } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import TeamVsForm from '@/components/forms/TeamVsForm';
import type { ListingTeam } from '@/client';


// Use vi.hoisted() so these are initialized before vi.mock factories run
const { mockUseRallySettings, mockToast, mockGetTeamOpponent, mockGetTeams } = vi.hoisted(() => ({
  mockUseRallySettings: vi.fn(),
  mockToast: { error: vi.fn(), success: vi.fn() },
  mockGetTeamOpponent: vi.fn(),
  mockGetTeams: vi.fn(),
}));

// Mock dependencies
vi.mock('@/components/themes/bloody', () => ({
  BloodyButton: ({ children, ...props }: ComponentProps<'button'>) => <button {...props}>{children}</button>,
}));

vi.mock('@/hooks/useGlobalPenaltyCounters', () => ({
  useGlobalPenaltyCounters: () => ({ globalPenaltyCounters: [], isLoading: false }),
  default: () => ({ globalPenaltyCounters: [], isLoading: false }),
  globalCounterKey: (id: number) => 'g_' + id,
}));

vi.mock('@/hooks/useRallySettings', () => ({
  default: () => mockUseRallySettings(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useAppToast: () => mockToast,
}));

vi.mock('@/client', () => ({
  getTeamOpponent: mockGetTeamOpponent,
  getTeams: mockGetTeams,
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
    mockGetTeamOpponent.mockResolvedValue({ data: {} });
    mockGetTeams.mockResolvedValue({
      data: [
        { id: 2, name: 'Team B' },
        { id: 3, name: 'Team C' },
      ],
    });
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

    expect(screen.getByText('Resultado do confronto')).toBeInTheDocument();
    expect(screen.getByText('Desafio concluído?')).toBeInTheDocument();
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

    expect(screen.queryByText('Desafio concluído?')).not.toBeInTheDocument();
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
    expect(screen.getByText('Não completou o desafio')).toBeInTheDocument();
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
      expect(mockGetTeams).toHaveBeenCalled();
    });

    // Select opponent
    fireEvent.change(screen.getAllByRole('combobox')[1]!, { // Opponent select
      target: { value: '2' }
    });

    // Submit
    fireEvent.click(screen.getByText('Submeter avaliação'));

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
    mockGetTeamOpponent.mockResolvedValue({
      data: { opponent_id: 3, opponent_name: 'Team C' },
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
      expect(screen.getByText(/Adversário definido automaticamente/i)).toBeInTheDocument();
    });
  });

  it('falls back to manual selection when fetchPreselectedOpponent throws', async () => {
    mockGetTeamOpponent.mockRejectedValue(new Error('network error'));

    render(
      <TeamVsForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} config={{}} />
    );

    await waitFor(() => {
      expect(mockGetTeams).toHaveBeenCalled();
    });
    expect(screen.getByText('Seleciona a equipa adversária')).toBeInTheDocument();
  });

  it('shows loading text and disables select while teams are loading', async () => {
    let resolveTeams: (value: { data: ListingTeam[] }) => void = () => {};
    mockGetTeams.mockReturnValue(
      new Promise((resolve) => {
        resolveTeams = resolve;
      })
    );

    render(
      <TeamVsForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} config={{}} />
    );

    await waitFor(() => {
      expect(screen.getByText('A carregar equipas...')).toBeInTheDocument();
    });

    resolveTeams({ data: [{ id: 2, name: 'Team B' } as ListingTeam] });

    await waitFor(() => {
      expect(screen.getByText('Seleciona a equipa adversária')).toBeInTheDocument();
    });
  });

  it('shows toast error and allows retry when loading teams fails', async () => {
    mockGetTeams.mockRejectedValue(new Error('failed to load'));

    render(
      <TeamVsForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} config={{}} />
    );

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Falha ao carregar lista de equipas');
    });
  });

  it('does not fetch anything when team has no id', () => {
    render(
      <TeamVsForm
        team={{} as ListingTeam}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
        config={{}}
      />
    );

    expect(mockGetTeamOpponent).not.toHaveBeenCalled();
    expect(mockGetTeams).not.toHaveBeenCalled();
  });

  it('prefills state from existingResult including opponent lookup from teams list', async () => {
    render(
      <TeamVsForm
        team={mockTeam}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
        config={{}}
        existingResult={
          {
            result_data: {
              result: 'draw',
              completed: false,
              opponent_team_id: 2,
              notes: 'existing notes',
            },
            extra_shots: 0,
            penalties: {},
          } as any
        }
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Team B')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('existing notes')).toBeInTheDocument();
  });

  it('prefills notes and result even without opponent_team_id in existingResult', async () => {
    render(
      <TeamVsForm
        team={mockTeam}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
        config={{}}
        existingResult={
          {
            result_data: { result: 'lose', notes: 'no opponent set' },
            extra_shots: 0,
            penalties: {},
          } as any
        }
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('no opponent set')).toBeInTheDocument();
    });
    expect(screen.getByTestId('select-result')).toHaveValue('lose');
  });

  it('manually selects an opponent after preselection, clearing preselected state', async () => {
    mockGetTeamOpponent.mockResolvedValue({
      data: { opponent_id: 3, opponent_name: 'Team C' },
    });

    render(
      <TeamVsForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} config={{}} />
    );

    await waitFor(() => {
      expect(screen.getByText(/Adversário definido automaticamente/i)).toBeInTheDocument();
    });
  });
});

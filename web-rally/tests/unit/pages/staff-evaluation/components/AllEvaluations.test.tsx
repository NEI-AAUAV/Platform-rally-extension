import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AllEvaluations from '@/pages/staff-evaluation/components/AllEvaluations';

vi.mock('@/pages/staff-evaluation/components/EvaluationHistory', () => ({
  EvaluationHistory: ({ resultId }: { resultId: number }) => (
    <div data-testid="history">history-{resultId}</div>
  ),
}));

const baseEvaluation = {
  id: 1,
  team_id: 1,
  activity_id: 1,
  final_score: 10,
  is_completed: true,
  completed_at: '2024-01-01T10:00:00Z',
  result_data: { notes: 'good job' },
  extra_shots: 2,
  penalties: { vomit: 1 },
  time_score: 12.3,
  points_score: 5,
  team: { id: 1, name: 'Team A', num_members: 4 },
  activity: {
    id: 1,
    name: 'Sprint',
    activity_type: 'GeneralActivity',
    checkpoint_id: 1,
    description: 'A sprint',
  },
};

describe('AllEvaluations', () => {
  it('renders empty state', () => {
    render(<AllEvaluations evaluations={[]} />);
    expect(screen.getByText('Nenhuma avaliação encontrada.')).toBeInTheDocument();
  });

  it('renders a list of evaluations', () => {
    render(<AllEvaluations evaluations={[baseEvaluation]} />);
    expect(screen.getByText('Sprint')).toBeInTheDocument();
    expect(screen.getByText(/Team: Team A/)).toBeInTheDocument();
  });

  it('filters by team and checkpoint', () => {
    const secondEvaluation = {
      ...baseEvaluation,
      id: 2,
      team: { id: 2, name: 'Team B' },
      activity: { ...baseEvaluation.activity, checkpoint_id: 2, name: 'Other' },
    };
    render(<AllEvaluations evaluations={[baseEvaluation, secondEvaluation]} />);

    fireEvent.change(screen.getByLabelText('Equipa'), { target: { value: 'Team A' } });
    expect(screen.getByText('Sprint')).toBeInTheDocument();
    expect(screen.queryByText('Other')).not.toBeInTheDocument();
    expect(screen.getByText('A mostrar 1 de 2 avaliações')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Limpar filtros'));
    expect(screen.getByText('Other')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Posto'), { target: { value: '2' } });
    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(screen.queryByText('Sprint')).not.toBeInTheDocument();
  });

  it('expands details and shows result badges, penalties, and modifiers', () => {
    render(<AllEvaluations evaluations={[baseEvaluation]} />);
    const toggle = screen.getByRole('button', { name: /Sprint/ });
    fireEvent.click(toggle);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText(/Time: 12.30s/)).toBeInTheDocument();
    expect(screen.getByText(/Points: 5/)).toBeInTheDocument();
    expect(screen.getByText(/Nota: good job/)).toBeInTheDocument();
    expect(screen.getByText(/Shots extra: \+2/)).toBeInTheDocument();
    expect(screen.getByText(/vomit: 1/)).toBeInTheDocument();
  });

  it('renders TeamVsActivity win/lose/draw result badges', () => {
    const winEval = {
      ...baseEvaluation,
      id: 3,
      activity: { ...baseEvaluation.activity, activity_type: 'TeamVsActivity' },
      result_data: { result: 'win', opponent_team_id: 5 },
    };
    render(<AllEvaluations evaluations={[winEval]} />);
    fireEvent.click(screen.getByRole('button', { name: /Sprint/ }));
    expect(screen.getByText('Won')).toBeInTheDocument();
    expect(screen.getByText('vs Equipa #5')).toBeInTheDocument();
  });

  it('renders TeamVsActivity lose result badge without opponent id', () => {
    const loseEval = {
      ...baseEvaluation,
      id: 5,
      activity: { ...baseEvaluation.activity, activity_type: 'TeamVsActivity' },
      result_data: { result: 'lose' },
    };
    render(<AllEvaluations evaluations={[loseEval]} />);
    fireEvent.click(screen.getByRole('button', { name: /Sprint/ }));
    expect(screen.getByText('Lost')).toBeInTheDocument();
    expect(screen.queryByText(/vs Equipa/)).not.toBeInTheDocument();
  });

  it('renders TeamVsActivity draw badge with fallback badge class', () => {
    const drawEval = {
      ...baseEvaluation,
      id: 6,
      activity: { ...baseEvaluation.activity, activity_type: 'TeamVsActivity' },
      result_data: { result: 'draw' },
    };
    render(<AllEvaluations evaluations={[drawEval]} />);
    fireEvent.click(screen.getByRole('button', { name: /Sprint/ }));
    expect(screen.getByText('Draw')).toBeInTheDocument();
  });

  it('collapses an expanded evaluation when toggled again', () => {
    render(<AllEvaluations evaluations={[baseEvaluation]} />);
    const toggle = screen.getByRole('button', { name: /Sprint/ });
    fireEvent.click(toggle);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });

  it('renders BooleanActivity success/failed badge', () => {
    const boolEval = {
      ...baseEvaluation,
      id: 4,
      activity: { ...baseEvaluation.activity, activity_type: 'BooleanActivity' },
      boolean_score: false,
      result_data: { notes: 'checked' },
      extra_shots: 0,
      penalties: {},
    };
    render(<AllEvaluations evaluations={[boolEval]} />);
    fireEvent.click(screen.getByRole('button', { name: /Sprint/ }));
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('toggles history visibility', () => {
    render(<AllEvaluations evaluations={[baseEvaluation]} />);
    fireEvent.click(screen.getByText('Ver histórico'));
    expect(screen.getByTestId('history')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ocultar histórico'));
    expect(screen.queryByTestId('history')).not.toBeInTheDocument();
  });

  it('handles non-array evaluations input gracefully', () => {
    // @ts-expect-error testing defensive fallback
    render(<AllEvaluations evaluations={null} />);
    expect(screen.getByText('Nenhuma avaliação encontrada.')).toBeInTheDocument();
  });
});

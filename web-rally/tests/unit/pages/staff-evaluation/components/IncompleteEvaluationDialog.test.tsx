import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { IncompleteEvaluationDialog } from '@/pages/staff-evaluation/components/IncompleteEvaluationDialog';
import type { EvaluationSummary } from '@/pages/staff-evaluation/components/checkpointEvaluation.types';

describe('IncompleteEvaluationDialog', () => {
  it('renders nothing extra when summary is null', () => {
    render(<IncompleteEvaluationDialog summary={null} onClose={vi.fn()} />);
    expect(screen.getByText('Avaliações incompletas detetadas')).toBeInTheDocument();
  });

  it('renders checkpoint mismatch message', () => {
    const summary: EvaluationSummary = {
      total_activities: 0,
      completed_activities: 0,
      pending_activities: 0,
      completion_rate: 0,
      has_incomplete: false,
      missing_activities: [],
      checkpoint_mismatch: true,
      team_checkpoint: 1,
      current_checkpoint: 2,
    };
    render(<IncompleteEvaluationDialog summary={summary} onClose={vi.fn()} />);
    expect(screen.getByText('Esta equipa é de um posto diferente')).toBeInTheDocument();
  });

  it('renders pending activities and missing list', () => {
    const summary: EvaluationSummary = {
      total_activities: 3,
      completed_activities: 1,
      pending_activities: 2,
      completion_rate: 33,
      has_incomplete: true,
      missing_activities: ['Act A', 'Act B'],
    };
    render(<IncompleteEvaluationDialog summary={summary} onClose={vi.fn()} />);
    expect(screen.getByText('Atividades em falta:')).toBeInTheDocument();
    expect(screen.getByText('Act A')).toBeInTheDocument();
    expect(screen.getByText('Act B')).toBeInTheDocument();
  });

  it('calls onClose when clicking Close', () => {
    const onClose = vi.fn();
    render(<IncompleteEvaluationDialog summary={null} onClose={onClose} />);
    fireEvent.click(screen.getByText('Fechar'));
    expect(onClose).toHaveBeenCalled();
  });
});

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import EvaluationFormModal from '@/pages/staff-evaluation/components/EvaluationFormModal';
import type { ActivityResponse } from '@/client';
import type { Team } from '@/types/forms';

vi.mock('@/components/forms', () => ({
  ActivityEvaluationForm: ({ activity }: { activity: ActivityResponse }) => (
    <div data-testid="activity-form">{activity.name}</div>
  ),
}));

describe('EvaluationFormModal', () => {
  const activity = { id: 1, name: 'Sprint', activity_type: 'GeneralActivity' } as ActivityResponse;
  const team = { id: 1, name: 'Team A' } as Team;

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <EvaluationFormModal
        isOpen={false}
        activity={activity}
        team={team}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        isSubmitting={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders modal content when open', () => {
    render(
      <EvaluationFormModal
        isOpen
        activity={activity}
        team={team}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        isSubmitting={false}
      />,
    );
    expect(screen.getByText('Avaliar: Sprint')).toBeInTheDocument();
    expect(screen.getByTestId('activity-form')).toBeInTheDocument();
  });

  it('calls onCancel from close (x) button and Cancel button', () => {
    const onCancel = vi.fn();
    render(
      <EvaluationFormModal
        isOpen
        activity={activity}
        team={team}
        onSubmit={vi.fn()}
        onCancel={onCancel}
        isSubmitting={false}
      />,
    );
    fireEvent.click(screen.getByText('×'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});

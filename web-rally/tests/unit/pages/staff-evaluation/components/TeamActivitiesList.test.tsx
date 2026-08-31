
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TeamActivitiesList } from '@/pages/staff-evaluation/components/TeamActivitiesList';
import type { ActivityResponse } from '@/client';
import type { Team } from '@/types/forms';

vi.mock('@/components/forms/ActivityEvaluationForm', () => ({
  default: ({ activity, onSubmit, onCaptured }: any) => (
    <div>
      <span>form-for-{activity.name}</span>
      <span>status-{activity.evaluation_status ?? 'none'}</span>
      <span>extra-shots-{activity.existing_result?.extra_shots ?? 'none'}</span>
      <button onClick={() => onSubmit({ result_data: {} })}>submit-form</button>
      <button onClick={onCaptured}>captured</button>
    </div>
  ),
}));

describe('TeamActivitiesList', () => {
  const team = { id: 1, name: 'Team A' } as Team;

  it('renders empty state when no activities', () => {
    render(
      <TeamActivitiesList team={team} activities={[]} onEvaluate={vi.fn()} isEvaluating={false} />,
    );
    expect(screen.getByText('Sem atividades para avaliar')).toBeInTheDocument();
  });

  it('renders activities list with pending/completed badges', () => {
    const activities = [
      { id: 1, name: 'Act 1', activity_type: 'GeneralActivity', description: 'desc' },
      { id: 2, name: 'Act 2', activity_type: 'BooleanActivity', evaluation_status: 'completed' },
    ] as unknown as ActivityResponse[];
    render(
      <TeamActivitiesList
        team={team}
        activities={activities}
        onEvaluate={vi.fn()}
        isEvaluating={false}
      />,
    );
    expect(screen.getByText('Act 1')).toBeInTheDocument();
    expect(screen.getByText('Act 2')).toBeInTheDocument();
    expect(screen.getByText('Pendente')).toBeInTheDocument();
    expect(screen.getByText('Avaliado')).toBeInTheDocument();
  });

  it('opens evaluation form when clicking evaluate and can go back', async () => {
    const activities = [
      { id: 1, name: 'Act 1', activity_type: 'GeneralActivity' },
    ] as unknown as ActivityResponse[];
    const onEvaluate = vi.fn().mockResolvedValue(undefined);
    render(
      <TeamActivitiesList
        team={team}
        activities={activities}
        onEvaluate={onEvaluate}
        isEvaluating={false}
      />,
    );
    fireEvent.click(screen.getByText('Avaliar'));
    expect(screen.getByText('form-for-Act 1')).toBeInTheDocument();

    fireEvent.click(screen.getByText('submit-form'));
    await waitFor(() => expect(onEvaluate).toHaveBeenCalledWith(1, 1, { result_data: {} }));
  });

  it('handles cancel from the form', () => {
    const activities = [
      { id: 1, name: 'Act 1', activity_type: 'GeneralActivity' },
    ] as unknown as ActivityResponse[];
    render(
      <TeamActivitiesList
        team={team}
        activities={activities}
        onEvaluate={vi.fn()}
        isEvaluating={false}
      />,
    );
    fireEvent.click(screen.getByText('Avaliar'));
    fireEvent.click(screen.getByText('← Voltar às atividades'));
    expect(screen.getByText('Act 1')).toBeInTheDocument();
  });

  it('C1 regression: reopens a completed activity with existing_result intact', () => {
    const activities = [
      {
        id: 1,
        name: 'Act 1',
        activity_type: 'GeneralActivity',
        evaluation_status: 'completed',
        existing_result: { extra_shots: 3, penalty_counts: { vomit: 2 } },
      },
    ] as unknown as ActivityResponse[];
    render(
      <TeamActivitiesList
        team={team}
        activities={activities}
        onEvaluate={vi.fn()}
        isEvaluating={false}
      />,
    );
    fireEvent.click(screen.getByText('Atualizar'));
    // Must NOT be forced to "pending" — the form needs the real status/result to hydrate.
    expect(screen.getByText('status-completed')).toBeInTheDocument();
    expect(screen.getByText('extra-shots-3')).toBeInTheDocument();
  });

  it('renders unknown activity type with default icon', () => {
    const activities = [
      { id: 3, name: 'Weird', activity_type: 'UnknownType' },
    ] as unknown as ActivityResponse[];
    render(
      <TeamActivitiesList team={team} activities={activities} onEvaluate={vi.fn()} isEvaluating={false} />,
    );
    expect(screen.getByText('Weird')).toBeInTheDocument();
  });
});

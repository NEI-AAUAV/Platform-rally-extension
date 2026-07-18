import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ActivityList from '@/components/ActivityList';
import { ActivityType } from '@/types/activityTypes';
import type { Activity, Checkpoint } from '@/types/activityTypes';

const checkpoints: Checkpoint[] = [
  { id: 1, name: 'Checkpoint Alpha' } as Checkpoint,
  { id: 2, name: 'Checkpoint Beta' } as Checkpoint,
];

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 1,
    name: 'Corrida de sacos',
    description: 'Descrição da atividade',
    activity_type: ActivityType.TIME_BASED,
    checkpoint_id: 1,
    order: 1,
    is_active: true,
    ...overrides,
  } as Activity;
}

describe('ActivityList', () => {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onReorder = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when there are no activities', () => {
    render(
      <ActivityList activities={[]} checkpoints={checkpoints} onEdit={onEdit} onDelete={onDelete} />,
    );

    expect(screen.getByText('Nenhuma atividade criada')).toBeInTheDocument();
    expect(
      screen.getByText('Crie a primeira atividade para começar a configurar o Rally.'),
    ).toBeInTheDocument();
  });

  it('renders empty state when activities is not an array', () => {
    render(
      <ActivityList
        activities={null as unknown as Activity[]}
        checkpoints={checkpoints}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText('Nenhuma atividade criada')).toBeInTheDocument();
  });

  it('renders activity details including name, description, type and checkpoint', () => {
    const activity = makeActivity();
    render(
      <ActivityList
        activities={[activity]}
        checkpoints={checkpoints}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText('Corrida de sacos')).toBeInTheDocument();
    expect(screen.getByText('Descrição da atividade')).toBeInTheDocument();
    expect(screen.getByText(/Baseada em Tempo/)).toBeInTheDocument();
    expect(screen.getByText(/Checkpoint Alpha/)).toBeInTheDocument();
    expect(screen.getByText('Ativa')).toBeInTheDocument();
  });

  it('renders inactive badge for inactive activities', () => {
    render(
      <ActivityList
        activities={[makeActivity({ is_active: false })]}
        checkpoints={checkpoints}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText('Inativa')).toBeInTheDocument();
  });

  it('does not render description when absent', () => {
    render(
      <ActivityList
        activities={[makeActivity({ description: undefined })]}
        checkpoints={checkpoints}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    expect(screen.queryByText('Descrição da atividade')).not.toBeInTheDocument();
  });

  it('falls back to a generic checkpoint label when the checkpoint is not found', () => {
    render(
      <ActivityList
        activities={[makeActivity({ checkpoint_id: 999 })]}
        checkpoints={checkpoints}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText(/Checkpoint 999/)).toBeInTheDocument();
  });

  it('renders each activity type label correctly', () => {
    const types: Activity['activity_type'][] = [
      ActivityType.TIME_BASED,
      ActivityType.SCORE_BASED,
      ActivityType.BOOLEAN,
      ActivityType.TEAM_VS,
      ActivityType.GENERAL,
      ActivityType.DEFERRED_JUDGED,
    ];
    const activities = types.map((t, i) => makeActivity({ id: i + 1, activity_type: t }));

    render(
      <ActivityList
        activities={activities}
        checkpoints={checkpoints}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText(/Baseada em Pontuação/)).toBeInTheDocument();
    expect(screen.getByText(/Sim\/Não/)).toBeInTheDocument();
    expect(screen.getByText(/Equipa vs Equipa/)).toBeInTheDocument();
    expect(screen.getByText(/Geral/)).toBeInTheDocument();
    expect(screen.getByText(/Avaliação Posterior \(Fotos\)/)).toBeInTheDocument();
  });

  it('calls onEdit when the edit button is clicked', () => {
    const activity = makeActivity();
    render(
      <ActivityList
        activities={[activity]}
        checkpoints={checkpoints}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]!);
    expect(onEdit).toHaveBeenCalledWith(activity);
  });

  it('calls onDelete with the activity id when the delete button is clicked', () => {
    const activity = makeActivity();
    render(
      <ActivityList
        activities={[activity]}
        checkpoints={checkpoints}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[1]!);
    expect(onDelete).toHaveBeenCalledWith(activity.id);
  });

  it('does not render the drag handle when onReorder is not provided', () => {
    const { container } = render(
      <ActivityList
        activities={[makeActivity()]}
        checkpoints={checkpoints}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    expect(container.querySelector('[draggable="true"]')).not.toBeInTheDocument();
  });

  it('renders draggable items and the drag handle when onReorder is provided', () => {
    const { container } = render(
      <ActivityList
        activities={[makeActivity()]}
        checkpoints={checkpoints}
        onEdit={onEdit}
        onDelete={onDelete}
        onReorder={onReorder}
      />,
    );

    expect(container.querySelector('[draggable="true"]')).toBeInTheDocument();
  });

  it('reorders activities within the same checkpoint on drop', () => {
    const activityA = makeActivity({ id: 1, name: 'A', checkpoint_id: 1, order: 1 });
    const activityB = makeActivity({ id: 2, name: 'B', checkpoint_id: 1, order: 2 });

    const { container } = render(
      <ActivityList
        activities={[activityA, activityB]}
        checkpoints={checkpoints}
        onEdit={onEdit}
        onDelete={onDelete}
        onReorder={onReorder}
      />,
    );

    const items = container.querySelectorAll('[draggable="true"]');
    expect(items).toHaveLength(2);

    const dataTransfer = { effectAllowed: '', dropEffect: '' };

    fireEvent.dragStart(items[0]!, { dataTransfer });
    fireEvent.dragOver(items[1]!, { dataTransfer });
    fireEvent.drop(items[1]!, { dataTransfer });

    expect(onReorder).toHaveBeenCalledWith({ 1: 2, 2: 1 });
  });

  it('does not reorder when dropping onto the same activity', () => {
    const activityA = makeActivity({ id: 1, name: 'A', checkpoint_id: 1, order: 1 });

    const { container } = render(
      <ActivityList
        activities={[activityA]}
        checkpoints={checkpoints}
        onEdit={onEdit}
        onDelete={onDelete}
        onReorder={onReorder}
      />,
    );

    const items = container.querySelectorAll('[draggable="true"]');
    const dataTransfer = { effectAllowed: '', dropEffect: '' };

    fireEvent.dragStart(items[0]!, { dataTransfer });
    fireEvent.drop(items[0]!, { dataTransfer });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('does not reorder across different checkpoints', () => {
    const activityA = makeActivity({ id: 1, name: 'A', checkpoint_id: 1, order: 1 });
    const activityB = makeActivity({ id: 2, name: 'B', checkpoint_id: 2, order: 1 });

    const { container } = render(
      <ActivityList
        activities={[activityA, activityB]}
        checkpoints={checkpoints}
        onEdit={onEdit}
        onDelete={onDelete}
        onReorder={onReorder}
      />,
    );

    const items = container.querySelectorAll('[draggable="true"]');
    const dataTransfer = { effectAllowed: '', dropEffect: '' };

    fireEvent.dragStart(items[0]!, { dataTransfer });
    fireEvent.drop(items[1]!, { dataTransfer });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('does nothing on drop when onReorder is not provided', () => {
    const activityA = makeActivity({ id: 1, name: 'A', checkpoint_id: 1, order: 1 });
    const activityB = makeActivity({ id: 2, name: 'B', checkpoint_id: 1, order: 2 });

    const { container } = render(
      <ActivityList
        activities={[activityA, activityB]}
        checkpoints={checkpoints}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    const items = container.querySelectorAll('div.rounded-lg');
    const dataTransfer = { effectAllowed: '', dropEffect: '' };

    fireEvent.dragStart(items[0]!, { dataTransfer });
    fireEvent.drop(items[1]!, { dataTransfer });

    expect(onDelete).not.toHaveBeenCalled();
  });

  it('does not reorder when dropping with no dragged activity set', () => {
    const activityA = makeActivity({ id: 1, name: 'A', checkpoint_id: 1, order: 1 });

    const { container } = render(
      <ActivityList
        activities={[activityA]}
        checkpoints={checkpoints}
        onEdit={onEdit}
        onDelete={onDelete}
        onReorder={onReorder}
      />,
    );

    const item = container.querySelector('[draggable="true"]') as Element;
    const dataTransfer = { effectAllowed: '', dropEffect: '' };

    // Drop without a preceding dragStart
    fireEvent.drop(item, { dataTransfer });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('clears the dragged state on drag end', () => {
    const activityA = makeActivity({ id: 1, name: 'A', checkpoint_id: 1, order: 1 });

    const { container } = render(
      <ActivityList
        activities={[activityA]}
        checkpoints={checkpoints}
        onEdit={onEdit}
        onDelete={onDelete}
        onReorder={onReorder}
      />,
    );

    const item = container.querySelector('[draggable="true"]') as Element;
    const dataTransfer = { effectAllowed: '', dropEffect: '' };

    fireEvent.dragStart(item, { dataTransfer });
    fireEvent.dragEnd(item);

    // No crash and item is no longer visually "dragged" (class check)
    expect(item.className).not.toContain('opacity-50');
  });
});

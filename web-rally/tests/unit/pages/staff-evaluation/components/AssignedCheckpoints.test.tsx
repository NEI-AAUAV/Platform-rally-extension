import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AssignedCheckpoints from '@/pages/staff-evaluation/components/AssignedCheckpoints';
import type { DetailedCheckPoint, ActivityResponse, ListingTeam } from '@/client';

describe('AssignedCheckpoints', () => {
  it('renders empty state when no checkpoints', () => {
    render(
      <AssignedCheckpoints
        checkpoints={[]}
        activities={[]}
        teams={[]}
        onCheckpointClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Nenhum posto encontrado.')).toBeInTheDocument();
  });

  it('renders checkpoints with counts', () => {
    const checkpoints = [
      { id: 1, name: 'Checkpoint 1', order: 1 },
      { id: 2, name: 'Checkpoint 2', order: 2 },
    ] as DetailedCheckPoint[];
    const activities = [
      { id: 1, checkpoint_id: 1 },
      { id: 2, checkpoint_id: 1 },
    ] as ActivityResponse[];
    const teams = [{ id: 1 }, { id: 2 }] as ListingTeam[];

    render(
      <AssignedCheckpoints
        checkpoints={checkpoints}
        activities={activities}
        teams={teams}
        onCheckpointClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Checkpoint 1')).toBeInTheDocument();
    expect(screen.getByText('2 atividades • 2 equipas')).toBeInTheDocument();
    expect(screen.getByText('0 atividades • 2 equipas')).toBeInTheDocument();
  });

  it('calls onCheckpointClick with the clicked checkpoint', () => {
    const onCheckpointClick = vi.fn();
    const checkpoints = [{ id: 1, name: 'Checkpoint 1', order: 1 }] as DetailedCheckPoint[];
    render(
      <AssignedCheckpoints
        checkpoints={checkpoints}
        activities={[]}
        teams={[]}
        onCheckpointClick={onCheckpointClick}
      />,
    );
    fireEvent.click(screen.getByText('Checkpoint 1'));
    expect(onCheckpointClick).toHaveBeenCalledWith(checkpoints[0]);
  });
});

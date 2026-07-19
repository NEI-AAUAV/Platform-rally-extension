import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import StaffAssignmentList from '@/pages/assignment/components/StaffAssignmentList';
import type { DetailedCheckPoint } from '@/client';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = MockResizeObserver;
});

describe('StaffAssignmentList', () => {
  it('renders empty state when there are no assignments', () => {
    render(
      <StaffAssignmentList assignments={[]} checkpoints={[]} onUpdateAssignment={vi.fn()} />,
    );
    expect(screen.getByText('Nenhuma atribuição de staff encontrada.')).toBeInTheDocument();
  });

  it('renders assignments with user name and checkpoint info', () => {
    const assignments = [
      {
        id: 1,
        user_id: 10,
        user_name: 'Alice',
        user_email: 'alice@example.com',
        checkpoint_id: 5,
        checkpoint_name: 'Checkpoint A',
      },
      {
        id: 2,
        user_id: 20,
        checkpoint_id: undefined,
        checkpoint_name: undefined,
      },
    ];
    render(
      <StaffAssignmentList
        assignments={assignments}
        checkpoints={[] as DetailedCheckPoint[]}
        onUpdateAssignment={vi.fn()}
      />,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText(/alice@example.com/)).toBeInTheDocument();
    expect(screen.getByText('Checkpoint: Checkpoint A')).toBeInTheDocument();
    expect(screen.getByText('User 20')).toBeInTheDocument();
    expect(screen.getByText('Checkpoint: Não atribuído')).toBeInTheDocument();
  });

  it('calls onUpdateAssignment when selecting a checkpoint', async () => {
    const onUpdateAssignment = vi.fn();
    const assignments = [
      { id: 1, user_id: 10, user_name: 'Alice', checkpoint_id: undefined },
    ];
    const checkpoints = [
      { id: 1, name: 'Checkpoint A', order: 1 },
      { id: 2, name: 'Checkpoint B', order: 2 },
    ] as DetailedCheckPoint[];

    const user = userEvent.setup();
    render(
      <StaffAssignmentList
        assignments={assignments}
        checkpoints={checkpoints}
        onUpdateAssignment={onUpdateAssignment}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('Checkpoint A'));

    expect(onUpdateAssignment).toHaveBeenCalledWith(10, 1);
  });

  it('calls onUpdateAssignment with 0 when removing assignment', async () => {
    const onUpdateAssignment = vi.fn();
    const assignments = [
      { id: 1, user_id: 10, user_name: 'Alice', checkpoint_id: 1, checkpoint_name: 'Checkpoint A' },
    ];
    const checkpoints = [{ id: 1, name: 'Checkpoint A', order: 1 }] as DetailedCheckPoint[];

    const user = userEvent.setup();
    render(
      <StaffAssignmentList
        assignments={assignments}
        checkpoints={checkpoints}
        onUpdateAssignment={onUpdateAssignment}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('Remover atribuição'));

    expect(onUpdateAssignment).toHaveBeenCalledWith(10, 0);
  });
});

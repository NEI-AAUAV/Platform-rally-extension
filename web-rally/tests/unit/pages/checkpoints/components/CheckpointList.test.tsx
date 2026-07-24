import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CheckpointList from '@/pages/checkpoints/components/CheckpointList';

vi.mock('@/hooks/useCheckpointMedia', () => ({
  useCheckpointMedia: () => ({ photos: [], funFacts: [] }),
}));

vi.mock('@/components/shared', () => ({
  CheckpointDiscovery: () => <div>Discovery</div>,
  EmptyState: ({ title, description }: { title: string; description: string }) => (
    <div>
      {title} - {description}
    </div>
  ),
}));

describe('CheckpointList', () => {
  it('renders empty state when no checkpoints', () => {
    render(<CheckpointList checkpoints={[]} selectedCheckpoint={null} onSelectCheckpoint={vi.fn()} />);
    expect(screen.getByText(/Nenhum posto disponível/)).toBeInTheDocument();
  });

  it('renders a card per checkpoint and marks the selected one', () => {
    const checkpoints = [
      { id: 1, name: 'Checkpoint A', order: 1 },
      { id: 2, name: 'Checkpoint B', order: 2 },
    ];
    render(
      <CheckpointList
        checkpoints={checkpoints}
        selectedCheckpoint={checkpoints[1] ?? null}
        onSelectCheckpoint={vi.fn()}
      />,
    );
    expect(screen.getByText('Checkpoint A')).toBeInTheDocument();
    expect(screen.getByText('Checkpoint B')).toBeInTheDocument();
    expect(screen.getByLabelText('Selecionar posto Checkpoint B')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

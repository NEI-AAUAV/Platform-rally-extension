import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CheckpointCard from '@/pages/postos/components/CheckpointCard';

const { mockUseCheckpointMedia } = vi.hoisted(() => ({
  mockUseCheckpointMedia: vi.fn(),
}));

vi.mock('@/hooks/useCheckpointMedia', () => ({
  useCheckpointMedia: (...args: unknown[]) => mockUseCheckpointMedia(...args),
}));

vi.mock('@/components/shared', () => ({
  CheckpointDiscovery: ({ checkpointId }: { checkpointId: number }) => (
    <div>Discovery {checkpointId}</div>
  ),
}));

describe('CheckpointCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCheckpointMedia.mockReturnValue({ photos: [], funFacts: [] });
  });

  const checkpoint = {
    id: 1,
    name: 'Checkpoint A',
    description: 'Nice spot',
    latitude: 40.1,
    longitude: -8.4,
    order: 1,
  };

  it('renders checkpoint name and order', () => {
    render(<CheckpointCard checkpoint={checkpoint} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.getByText('Checkpoint A')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('calls onSelect when clicked', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<CheckpointCard checkpoint={checkpoint} isSelected={false} onSelect={onSelect} />);
    await user.click(screen.getByLabelText('Selecionar posto Checkpoint A'));
    expect(onSelect).toHaveBeenCalledWith(checkpoint);
  });

  it('shows the "Ir" directions link when showMap and coords are set', () => {
    render(<CheckpointCard checkpoint={checkpoint} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.getByText('Ir')).toBeInTheDocument();
  });

  it('hides the directions link when showMap is false', () => {
    render(
      <CheckpointCard checkpoint={checkpoint} isSelected={false} onSelect={vi.fn()} showMap={false} />,
    );
    expect(screen.queryByText('Ir')).not.toBeInTheDocument();
  });

  it('hides the directions link when coordinates are missing', () => {
    const noCoords = { ...checkpoint, latitude: null, longitude: null };
    render(<CheckpointCard checkpoint={noCoords} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.queryByText('Ir')).not.toBeInTheDocument();
  });

  it('renders discovery content when description or media exists', () => {
    render(<CheckpointCard checkpoint={checkpoint} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.getByText('Discovery 1')).toBeInTheDocument();
  });

  it('does not render discovery content when nothing to discover', () => {
    mockUseCheckpointMedia.mockReturnValue({ photos: [], funFacts: [] });
    const noDescription = { ...checkpoint, description: null };
    render(<CheckpointCard checkpoint={noDescription} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.queryByText('Discovery 1')).not.toBeInTheDocument();
  });

  it('applies selected styling attributes', () => {
    render(<CheckpointCard checkpoint={checkpoint} isSelected={true} onSelect={vi.fn()} />);
    expect(screen.getByLabelText('Selecionar posto Checkpoint A')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

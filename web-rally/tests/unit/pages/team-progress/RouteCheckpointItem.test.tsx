import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RouteCheckpointItem from '@/pages/team-progress/RouteCheckpointItem';
import type { DetailedCheckPoint, DetailedTeam } from '@/client';

const { mockUseCheckpointMedia } = vi.hoisted(() => ({
  mockUseCheckpointMedia: vi.fn(),
}));

vi.mock('@/hooks/useCheckpointMedia', () => ({
  useCheckpointMedia: (...args: unknown[]) => mockUseCheckpointMedia(...args),
}));

vi.mock('@/components/shared', () => ({
  CheckpointDiscoveryModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="discovery-modal" /> : null,
}));

const checkpoint = {
  id: 1,
  order: 1,
  name: 'Posto 1',
  description: 'Descrição',
} as DetailedCheckPoint;

const team = {
  score_per_checkpoint: [10, 20],
  times: ['2024-01-01T10:00:00Z', '2024-01-01T11:00:00Z'],
} as DetailedTeam;

describe('RouteCheckpointItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCheckpointMedia.mockReturnValue({ photos: [], funFacts: [] });
  });

  it('renders as completed with score and time when order <= completedCount', () => {
    render(
      <RouteCheckpointItem
        checkpoint={checkpoint}
        index={0}
        team={team}
        completedCount={2}
        showScore
        showMap
        isExpanded={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText('Concluído')).toBeInTheDocument();
    expect(screen.getByText('+10 pts')).toBeInTheDocument();
  });

  it('renders as current when order === completedCount + 1', () => {
    render(
      <RouteCheckpointItem
        checkpoint={checkpoint}
        index={0}
        team={team}
        completedCount={0}
        showScore
        showMap
        isExpanded={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText('Em curso')).toBeInTheDocument();
  });

  it('renders as future/pending and locked when order is beyond current', () => {
    const futureCheckpoint = { ...checkpoint, order: 3 } as DetailedCheckPoint;
    render(
      <RouteCheckpointItem
        checkpoint={futureCheckpoint}
        index={2}
        team={team}
        completedCount={0}
        showScore
        showMap
        isExpanded={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText('Pendente')).toBeInTheDocument();
    expect(screen.getByText(/Descobre este local quando lá chegares/)).toBeInTheDocument();
  });

  it('opens the discovery modal on click when revealable', async () => {
    const user = userEvent.setup();
    render(
      <RouteCheckpointItem
        checkpoint={checkpoint}
        index={0}
        team={team}
        completedCount={2}
        showScore
        showMap
        isExpanded={false}
        onToggle={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button'));
    expect(screen.getByTestId('discovery-modal')).toBeInTheDocument();
  });

  it('hides score pill when showScore is false', () => {
    render(
      <RouteCheckpointItem
        checkpoint={checkpoint}
        index={0}
        team={team}
        completedCount={2}
        showScore={false}
        showMap
        isExpanded={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.queryByText('+10 pts')).not.toBeInTheDocument();
  });

  it('renders a cover image header when photos are available', () => {
    mockUseCheckpointMedia.mockReturnValue({
      photos: [{ image_url: 'http://x/y.jpg', caption: 'Cover' }],
      funFacts: [],
    });
    render(
      <RouteCheckpointItem
        checkpoint={checkpoint}
        index={0}
        team={team}
        completedCount={2}
        showScore
        showMap
        isExpanded={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByAltText('Cover')).toBeInTheDocument();
  });
});

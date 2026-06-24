import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import LeaderboardHeader from '@/pages/scoreboard/components/LeaderboardHeader';
import type { ListingTeam } from '@/client';

const leader = (over: Partial<ListingTeam> = {}): ListingTeam =>
  ({ id: 1, name: 'Equipa A', total: 120, classification: 1, ...over }) as ListingTeam;

describe('LeaderboardHeader', () => {
  test('renders the leader name, total points and team count', () => {
    render(<LeaderboardHeader leader={leader()} teamsCount={8} />);
    expect(screen.getByText('Equipa A')).toBeInTheDocument();
    // total appears in the hero (and, without a checkpoint count, the fallback tile)
    expect(screen.getAllByText('120').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('Equipas')).toBeInTheDocument();
  });

  test('shows checkpoint progress when the checkpoint count is known', () => {
    const { container } = render(
      <LeaderboardHeader
        leader={leader({ last_checkpoint_number: 3 })}
        teamsCount={5}
        checkpointsCount={6}
      />,
    );
    expect(screen.getByText('3 / 6 checkpoints')).toBeInTheDocument();
    expect(screen.getByText('Checkpoints')).toBeInTheDocument();
    // progress bar element at 50%
    const bar = container.querySelector<HTMLElement>('[style*="width: 50%"]');
    expect(bar).not.toBeNull();
  });

  test('falls back to leader points label when no checkpoint count', () => {
    render(<LeaderboardHeader leader={leader()} teamsCount={5} />);
    expect(screen.getByText('Pontos do líder')).toBeInTheDocument();
    expect(screen.queryByText('Checkpoints')).not.toBeInTheDocument();
  });

  test('uses current_checkpoint_number when last is absent', () => {
    render(
      <LeaderboardHeader
        leader={leader({ current_checkpoint_number: 2 })}
        teamsCount={4}
      />,
    );
    expect(screen.getByText('Checkpoint 2')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { CheckpointTimelineItem } from '@/pages/teams/[id]/CheckpointTimelineItem';
import type { DetailedTeam, DetailedCheckPoint } from '@/client';
import type { EvaluationResult } from '@/pages/teams/[id]/teamDetails.types';

vi.mock('@/components/shared', () => ({
  CheckpointDiscovery: () => <div data-testid="discovery" />,
  ProvisionalBadge: () => <span data-testid="provisional">*</span>,
}));

const baseTeam = {
  score_per_checkpoint: [10],
  last_checkpoint_number: 1,
  times: ['2024-01-01T10:00:00Z'],
} as unknown as DetailedTeam;

const checkpoints = [{ id: 1, order: 1, name: 'Posto 1' }] as DetailedCheckPoint[];

describe('CheckpointTimelineItem', () => {
  it('renders basic checkpoint info', () => {
    render(
      <CheckpointTimelineItem
        team={baseTeam}
        index={0}
        checkpoints={checkpoints}
        activityResults={[]}
        allEvaluations={[]}
        totalTeams={2}
        isExpanded={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText('Checkpoint 1')).toBeInTheDocument();
    expect(screen.getByText('Posto 1')).toBeInTheDocument();
    expect(screen.getByText(/10 pts/)).toBeInTheDocument();
  });

  it('marks the current checkpoint', () => {
    const team = { ...baseTeam, last_checkpoint_number: 0, times: [] } as unknown as DetailedTeam;
    render(
      <CheckpointTimelineItem
        team={team}
        index={0}
        checkpoints={checkpoints}
        activityResults={[]}
        allEvaluations={[]}
        totalTeams={2}
        isExpanded={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('Not evaluated yet')).toBeInTheDocument();
  });

  it('toggles expansion and shows activity results when clicked', async () => {
    const onToggle = vi.fn();
    const activityResults = [
      {
        activity: { id: 1, checkpoint_id: 1, name: 'Act 1', activity_type: 'ScoreBasedActivity' },
        final_score: 20,
        completed_at: '2024-01-01T10:05:00Z',
      },
    ] as unknown as EvaluationResult[];

    const user = userEvent.setup();
    render(
      <CheckpointTimelineItem
        team={baseTeam}
        index={0}
        checkpoints={checkpoints}
        activityResults={activityResults}
        allEvaluations={activityResults}
        totalTeams={1}
        isExpanded={false}
        onToggle={onToggle}
      />,
    );

    expect(screen.getByText('1 activity')).toBeInTheDocument();
    await user.click(screen.getByText('Checkpoint 1').closest('button')!);
    expect(onToggle).toHaveBeenCalledWith(0);
  });

  it('renders activity cards when expanded', () => {
    const activityResults = [
      {
        activity: {
          id: 1,
          checkpoint_id: 1,
          name: 'Act 1',
          description: 'Desc',
          activity_type: 'TimeBasedActivity',
        },
        final_score: 20,
        completed_at: '2024-01-01T10:05:00Z',
      },
    ] as unknown as EvaluationResult[];

    render(
      <CheckpointTimelineItem
        team={baseTeam}
        index={0}
        checkpoints={checkpoints}
        activityResults={activityResults}
        allEvaluations={activityResults}
        totalTeams={2}
        isExpanded
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText('Act 1')).toBeInTheDocument();
    expect(screen.getByText('Desc')).toBeInTheDocument();
    expect(screen.getAllByTestId('provisional').length).toBeGreaterThan(0);
  });

  it('deduplicates multiple results for the same activity, keeping the latest', () => {
    const activityResults = [
      {
        activity: { id: 1, checkpoint_id: 1, name: 'Act 1', activity_type: 'ScoreBasedActivity' },
        final_score: 5,
        completed_at: '2024-01-01T09:00:00Z',
      },
      {
        activity: { id: 1, checkpoint_id: 1, name: 'Act 1', activity_type: 'ScoreBasedActivity' },
        final_score: 15,
        completed_at: '2024-01-01T11:00:00Z',
      },
    ] as unknown as EvaluationResult[];

    render(
      <CheckpointTimelineItem
        team={baseTeam}
        index={0}
        checkpoints={checkpoints}
        activityResults={activityResults}
        allEvaluations={activityResults}
        totalTeams={2}
        isExpanded
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText('15 pts')).toBeInTheDocument();
  });

  it('renders a fallback checkpoint name when no matching checkpoint is found', () => {
    render(
      <CheckpointTimelineItem
        team={baseTeam}
        index={5}
        checkpoints={checkpoints}
        activityResults={[]}
        allEvaluations={[]}
        totalTeams={2}
        isExpanded={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getAllByText('Checkpoint 6').length).toBeGreaterThan(0);
  });
});

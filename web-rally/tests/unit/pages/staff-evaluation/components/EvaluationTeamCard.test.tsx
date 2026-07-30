import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EvaluationTeamCard } from '@/pages/staff-evaluation/components/EvaluationTeamCard';
import type { ListingTeam } from '@/client';

describe('EvaluationTeamCard', () => {
  const team = {
    id: 1,
    name: 'Team Alpha',
    num_members: 4,
    total: 120,
    last_checkpoint_number: 2,
  } as ListingTeam;

  it('renders team info for current variant with score', () => {
    const onSelect = vi.fn();
    render(<EvaluationTeamCard team={team} variant="current" showScore onSelect={onSelect} />);
    expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    expect(screen.getByText('Em curso')).toBeInTheDocument();
    expect(screen.getByText(/120 pts/)).toBeInTheDocument();
    expect(screen.getByText('TA')).toBeInTheDocument();
  });

  it('hides score when showScore is false', () => {
    const onSelect = vi.fn();
    render(<EvaluationTeamCard team={team} variant="previous" showScore={false} onSelect={onSelect} />);
    expect(screen.getByText('Anterior')).toBeInTheDocument();
    expect(screen.queryByText(/pts/)).not.toBeInTheDocument();
  });

  it('renders evaluated variant', () => {
    const onSelect = vi.fn();
    render(<EvaluationTeamCard team={team} variant="evaluated" showScore onSelect={onSelect} />);
    expect(screen.getByText('Avaliado')).toBeInTheDocument();
  });

  it('calls onSelect when clicked', () => {
    const onSelect = vi.fn();
    render(<EvaluationTeamCard team={team} variant="current" showScore onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(team);
  });

  it('handles missing name gracefully for initials/defaults', () => {
    const onSelect = vi.fn();
    const barren = { id: 2, name: 'Solo', num_members: 0, total: 0 } as ListingTeam;
    render(<EvaluationTeamCard team={barren} variant="current" showScore onSelect={onSelect} />);
    expect(screen.getByText('S')).toBeInTheDocument();
    expect(screen.getByText(/Posto —/)).toBeInTheDocument();
  });
});

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TeamSection } from '@/pages/staff-evaluation/components/TeamSection';
import type { ListingTeam } from '@/client';

describe('TeamSection', () => {
  const teams = [
    { id: 1, name: 'Team A', num_members: 3, total: 10 },
    { id: 2, name: 'Team B', num_members: 2, total: 20 },
  ] as ListingTeam[];

  it('renders nothing when teams empty', () => {
    const { container } = render(
      <TeamSection title="Test" variant="current" teams={[]} showScore onSelect={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders title and teams', () => {
    render(
      <TeamSection title="Em curso" variant="current" teams={teams} showScore onSelect={vi.fn()} />,
    );
    expect(screen.getAllByText('Em curso').length).toBeGreaterThan(0);
    expect(screen.getByText('Team A')).toBeInTheDocument();
    expect(screen.getByText('Team B')).toBeInTheDocument();
  });

  it('calls onSelect with clicked team', () => {
    const onSelect = vi.fn();
    render(
      <TeamSection title="Em curso" variant="previous" teams={teams} showScore onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByText('Team A'));
    expect(onSelect).toHaveBeenCalledWith(teams[0]);
  });

  it('renders evaluated variant styling', () => {
    render(
      <TeamSection title="Já avaliadas" variant="evaluated" teams={teams} showScore={false} onSelect={vi.fn()} />,
    );
    expect(screen.getByText('Já avaliadas')).toBeInTheDocument();
  });
});

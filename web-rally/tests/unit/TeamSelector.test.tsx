import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TeamSelector from '@/pages/team-members/components/TeamSelector';
import type { ListingTeam } from '@/client';

describe('TeamSelector', () => {
  const teams = [
    { id: 1, name: 'Team A', num_members: 3 },
    { id: 2, name: 'Team B', num_members: 5 },
  ] as ListingTeam[];

  it('renders header text', () => {
    render(<TeamSelector teams={teams} selectedTeam="" onTeamChange={vi.fn()} />);
    expect(screen.getByText('Selecionar Equipa')).toBeInTheDocument();
  });

  it('renders without crashing when teams is undefined', () => {
    render(<TeamSelector teams={undefined} selectedTeam="" onTeamChange={vi.fn()} />);
    expect(screen.getByText('Selecionar Equipa')).toBeInTheDocument();
  });

  it('renders the select trigger with placeholder', () => {
    render(<TeamSelector teams={teams} selectedTeam="" onTeamChange={vi.fn()} />);
    expect(screen.getByText('Selecionar equipa')).toBeInTheDocument();
  });
});

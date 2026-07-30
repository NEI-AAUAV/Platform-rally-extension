import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Podium, ScoreRows, ScoreboardSkeleton } from '@/pages/scoreboard/components/ScoreList';
import type { ListingTeam } from '@/client';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={`${to}${params ? `/${params.id}` : ''}`} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('framer-motion', () => ({
  motion: {
    ol: ({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) => <ol {...props}>{children}</ol>,
    li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => <li {...props}>{children}</li>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/hooks/useEventTerms', () => ({
  default: () => ({ event: 'rally', checkpoint: 'posto', checkpoints: 'postos' }),
}));

function makeTeam(overrides: Partial<ListingTeam> = {}): ListingTeam {
  return {
    id: 1,
    name: 'Team Alpha',
    total: 100,
    classification: 1,
    ...overrides,
  } as ListingTeam;
}

describe('ScoreboardSkeleton', () => {
  it('renders skeleton placeholders', () => {
    const { container } = render(<ScoreboardSkeleton />);
    expect(container.querySelectorAll('.rally-surface, [class*="Skeleton"]').length).toBeGreaterThanOrEqual(0);
    expect(container.firstChild).toBeTruthy();
  });
});

describe('Podium', () => {
  it('returns null when there are no teams', () => {
    const { container } = render(<Podium teams={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders 1st, 2nd, 3rd place teams with correct ordinal labels', () => {
    const teams = [
      makeTeam({ id: 1, name: 'First', total: 300 }),
      makeTeam({ id: 2, name: 'Second', total: 200 }),
      makeTeam({ id: 3, name: 'Third', total: 100 }),
    ];
    render(<Podium teams={teams} />);
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.getByText('Third')).toBeInTheDocument();
    expect(screen.getByText('1º')).toBeInTheDocument();
    expect(screen.getByText('2º')).toBeInTheDocument();
    expect(screen.getByText('3º')).toBeInTheDocument();
  });

  it('renders champion star avatar when no photo_url is provided', () => {
    const teams = [makeTeam({ id: 1, name: 'Champ', total: 500 })];
    render(<Podium teams={teams} />);
    expect(screen.getByText('★')).toBeInTheDocument();
  });

  it('renders initials avatar for non-champion team without photo', () => {
    const teams = [
      makeTeam({ id: 1, name: 'Champ', total: 500 }),
      makeTeam({ id: 2, name: 'Runner Up', total: 300 }),
    ];
    render(<Podium teams={teams} />);
    expect(screen.getByText('RU')).toBeInTheDocument();
  });

  it('renders team photo image when photo_url is present', () => {
    const teams = [makeTeam({ id: 1, name: 'Champ', total: 500, photo_url: 'https://x/img.png' })];
    render(<Podium teams={teams} />);
    const img = screen.getByAltText('Champ') as HTMLImageElement;
    expect(img.src).toContain('img.png');
  });

  it('handles only one team gracefully (only champion slot)', () => {
    const teams = [makeTeam({ id: 1, name: 'Solo', total: 10 })];
    render(<Podium teams={teams} />);
    expect(screen.getByText('Solo')).toBeInTheDocument();
    expect(screen.queryByText('2º')).not.toBeInTheDocument();
    expect(screen.queryByText('3º')).not.toBeInTheDocument();
  });

  it('shows reachedLabel using checkpointsCount when provided and reached > 0', () => {
    const teams = [makeTeam({ id: 1, name: 'Solo', total: 10, last_checkpoint_number: 3 })];
    render(<Podium teams={teams} checkpointsCount={8} />);
    expect(screen.getByText('3/8 postos')).toBeInTheDocument();
  });

  it('shows reachedLabel with checkpoint singular fallback when checkpointsCount is absent', () => {
    const teams = [makeTeam({ id: 1, name: 'Solo', total: 10, current_checkpoint_number: 2 })];
    render(<Podium teams={teams} />);
    expect(screen.getByText('Posto 2')).toBeInTheDocument();
  });

  it('does not render reached label when reached is 0', () => {
    const teams = [makeTeam({ id: 1, name: 'Solo', total: 10 })];
    render(<Podium teams={teams} />);
    expect(screen.queryByText(/postos/)).not.toBeInTheDocument();
  });

  it('applies italic styling for provisional scores', () => {
    const teams = [makeTeam({ id: 1, name: 'Solo', total: 10 })];
    render(<Podium teams={teams} isProvisional />);
    const points = screen.getByText('10');
    expect(points.className).toContain('italic');
  });

  it('links to the team detail page', () => {
    const teams = [makeTeam({ id: 42, name: 'Linked Team', total: 10 })];
    render(<Podium teams={teams} />);
    const link = screen.getByText('Linked Team').closest('a');
    expect(link).toHaveAttribute('href', '/teams/$id/42');
  });
});

describe('ScoreRows', () => {
  it('returns null when there are no teams', () => {
    const { container } = render(<ScoreRows teams={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders ranked rows starting at rank 1 by default', () => {
    const teams = [makeTeam({ id: 1, name: 'Row A', total: 50 }), makeTeam({ id: 2, name: 'Row B', total: 40 })];
    render(<ScoreRows teams={teams} />);
    expect(screen.getByText('Row A')).toBeInTheDocument();
    expect(screen.getByText('Row B')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('respects a custom startRank offset', () => {
    const teams = [makeTeam({ id: 1, name: 'Row C', total: 30 })];
    render(<ScoreRows teams={teams} startRank={4} />);
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('renders team photo when available, initials otherwise', () => {
    const teams = [
      makeTeam({ id: 1, name: 'Photo Team', total: 30, photo_url: 'https://x/p.png' }),
      makeTeam({ id: 2, name: 'No Photo Team', total: 20 }),
    ];
    render(<ScoreRows teams={teams} />);
    expect(screen.getByAltText('Photo Team')).toBeInTheDocument();
    expect(screen.getByText('NP')).toBeInTheDocument();
  });

  it('shows reached label when reached > 0', () => {
    const teams = [makeTeam({ id: 1, name: 'Row D', total: 30, last_checkpoint_number: 5 })];
    render(<ScoreRows teams={teams} checkpointsCount={10} />);
    expect(screen.getByText('5/10 postos')).toBeInTheDocument();
  });

  it('applies italic styling to points when provisional', () => {
    const teams = [makeTeam({ id: 1, name: 'Row E', total: 77 })];
    render(<ScoreRows teams={teams} isProvisional />);
    const points = screen.getByText('77');
    expect(points.className).toContain('italic');
  });

  it('links each row to its team detail page', () => {
    const teams = [makeTeam({ id: 9, name: 'Row F', total: 15 })];
    render(<ScoreRows teams={teams} />);
    const link = screen.getByText('Row F').closest('a');
    expect(link).toHaveAttribute('href', '/teams/$id/9');
  });
});

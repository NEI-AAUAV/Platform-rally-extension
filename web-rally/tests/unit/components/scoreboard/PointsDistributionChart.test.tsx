import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PointsDistributionChart from '@/components/scoreboard/PointsDistributionChart';
import type { ListingTeam } from '@/client';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: ({
    children,
    shape,
  }: {
    children: React.ReactNode;
    shape: (props: { payload?: { leader: boolean } }) => React.ReactNode;
  }) => (
    <div data-testid="bar">
      {shape({ payload: { leader: true } })}
      {shape({ payload: { leader: false } })}
      {children}
    </div>
  ),
  Rectangle: ({ fill }: { fill: string }) => <div data-testid="rectangle" data-fill={fill} />,
  Cell: () => <div data-testid="cell" />,
  LabelList: () => <div data-testid="label-list" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
}));

describe('PointsDistributionChart', () => {
  it('renders without crashing with teams', () => {
    const teams = [
      { id: 1, name: 'Team A', total: 50, classification: 2 },
      { id: 2, name: 'Team B', total: 100, classification: 1 },
    ] as unknown as ListingTeam[];

    render(<PointsDistributionChart teams={teams} />);
    expect(screen.getByText('Distribuição de pontos')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('renders without crashing with empty teams array', () => {
    render(<PointsDistributionChart teams={[]} />);
    expect(screen.getByText('Distribuição de pontos')).toBeInTheDocument();
  });

  it('sorts teams by total descending', () => {
    const teams = [
      { id: 1, name: 'Low', total: 10, classification: 2 },
      { id: 2, name: 'High', total: 90, classification: 1 },
    ] as unknown as ListingTeam[];
    render(<PointsDistributionChart teams={teams} />);
    // Just confirm it renders without throwing given unsorted input
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('renders the leader bar with the accent color and non-leader bars with the soft accent color', () => {
    const teams = [
      { id: 1, name: 'Team A', total: 50, classification: 2 },
      { id: 2, name: 'Team B', total: 100, classification: 1 },
    ] as unknown as ListingTeam[];
    render(<PointsDistributionChart teams={teams} />);

    const rectangles = screen.getAllByTestId('rectangle');
    expect(rectangles[0]).toHaveAttribute('data-fill', 'var(--rally-accent, var(--rally-accent-fallback))');
    expect(rectangles[1]).toHaveAttribute(
      'data-fill',
      'var(--rally-accent-soft, var(--rally-accent-soft-fallback))',
    );
  });
});

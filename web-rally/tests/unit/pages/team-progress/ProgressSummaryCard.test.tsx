import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ProgressSummaryCard from '@/pages/team-progress/ProgressSummaryCard';

describe('ProgressSummaryCard', () => {
  it('renders percentage and details when showScore is true', () => {
    render(
      <ProgressSummaryCard completedCount={2} totalCount={4} totalScore={80} showScore />,
    );
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('2 de 4 postos · 80 pontos')).toBeInTheDocument();
  });

  it('hides score details when showScore is false', () => {
    render(
      <ProgressSummaryCard completedCount={2} totalCount={4} totalScore={80} showScore={false} />,
    );
    expect(screen.queryByText(/pontos/)).not.toBeInTheDocument();
  });

  it('handles zero totalCount without dividing by zero', () => {
    render(<ProgressSummaryCard completedCount={0} totalCount={0} totalScore={0} showScore />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });
});

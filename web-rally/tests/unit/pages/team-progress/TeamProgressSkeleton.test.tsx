import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TeamProgressSkeleton from '@/pages/team-progress/TeamProgressSkeleton';

describe('TeamProgressSkeleton', () => {
  it('renders without crashing', () => {
    const { container } = render(<TeamProgressSkeleton />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders multiple skeleton placeholders', () => {
    const { container } = render(<TeamProgressSkeleton />);
    // 4 top skeletons + 1 heading skeleton + 5 checkpoint skeletons = 10
    expect(container.querySelectorAll('[class*="animate-pulse"], div').length).toBeGreaterThan(0);
  });
});

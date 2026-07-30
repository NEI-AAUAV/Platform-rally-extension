import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RallyMarquee from '@/pages/home/RallyMarquee';
import { DEFAULT_TICKER_ITEMS } from '@/lib/homeLayout';

describe('RallyMarquee', () => {
  it('renders default ticker items when none provided', () => {
    render(<RallyMarquee />);
    const matches = screen.getAllByText(DEFAULT_TICKER_ITEMS[0]!);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('renders provided items doubled', () => {
    render(<RallyMarquee items={['CUSTOM ITEM']} />);
    const matches = screen.getAllByText('CUSTOM ITEM');
    expect(matches).toHaveLength(4);
  });

  it('renders empty list falls back to default when items is empty array', () => {
    render(<RallyMarquee items={[]} />);
    const matches = screen.getAllByText(DEFAULT_TICKER_ITEMS[0]!);
    expect(matches.length).toBeGreaterThan(0);
  });
});

import type { HTMLAttributes } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Reveal, RevealGroup, RevealItem } from '@/components/home/Reveal';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

describe('Reveal', () => {
  it('renders children inside a motion.div', () => {
    render(
      <Reveal>
        <span>reveal-content</span>
      </Reveal>
    );
    expect(screen.getByText('reveal-content')).toBeInTheDocument();
  });

  it('applies className passed to Reveal', () => {
    render(
      <Reveal className="my-reveal-class">
        <span>content</span>
      </Reveal>
    );
    expect(screen.getByText('content').parentElement).toHaveClass('my-reveal-class');
  });
});

describe('RevealGroup', () => {
  it('renders children inside a motion.div', () => {
    render(
      <RevealGroup>
        <span>group-content</span>
      </RevealGroup>
    );
    expect(screen.getByText('group-content')).toBeInTheDocument();
  });

  it('applies className passed to RevealGroup', () => {
    render(
      <RevealGroup className="my-group-class">
        <span>content</span>
      </RevealGroup>
    );
    expect(screen.getByText('content').parentElement).toHaveClass('my-group-class');
  });
});

describe('RevealItem', () => {
  it('renders children inside a motion.div', () => {
    render(
      <RevealItem>
        <span>item-content</span>
      </RevealItem>
    );
    expect(screen.getByText('item-content')).toBeInTheDocument();
  });

  it('applies className passed to RevealItem', () => {
    render(
      <RevealItem className="my-item-class">
        <span>content</span>
      </RevealItem>
    );
    expect(screen.getByText('content').parentElement).toHaveClass('my-item-class');
  });
});

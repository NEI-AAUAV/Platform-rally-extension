import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import Typewriter from '@/pages/home/Typewriter';

describe('Typewriter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders full text immediately when reduced motion is preferred', () => {
    vi.spyOn(globalThis, 'matchMedia').mockReturnValue({
      matches: true,
    } as MediaQueryList);
    render(<Typewriter text="Hello" />);
    const el = screen.getByLabelText('Hello');
    expect(el.textContent).toBe('Hello');
  });

  it('types text character by character over time', async () => {
    vi.spyOn(globalThis, 'matchMedia').mockReturnValue({
      matches: false,
    } as MediaQueryList);
    vi.useFakeTimers();
    render(<Typewriter text="Hi" delay={0} />);
    const el = screen.getByLabelText('Hi');
    expect(el.textContent).toBe('');

    await vi.advanceTimersByTimeAsync(200);
    expect(el.textContent).toBe('Hi');
  });

  it('applies className prop', () => {
    vi.spyOn(globalThis, 'matchMedia').mockReturnValue({
      matches: true,
    } as MediaQueryList);
    render(<Typewriter text="X" className="my-class" />);
    expect(screen.getByLabelText('X')).toHaveClass('my-class');
  });
});

import type { HTMLAttributes } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BadgeShowcase } from '@/components/badges/BadgeShowcase';
import { useBadgeShowcase } from '@/hooks/useBadges';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

vi.mock('@/hooks/useBadges', () => ({
  useBadgeShowcase: vi.fn(),
}));

const mockedUseBadgeShowcase = vi.mocked(useBadgeShowcase);

describe('BadgeShowcase', () => {
  it('renders nothing while loading', () => {
    mockedUseBadgeShowcase.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as never);
    const { container } = render(<BadgeShowcase teamId={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on error', () => {
    mockedUseBadgeShowcase.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as never);
    const { container } = render(<BadgeShowcase teamId={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when data is undefined', () => {
    mockedUseBadgeShowcase.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as never);
    const { container } = render(<BadgeShowcase teamId={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders 0% progress when there are no definitions', () => {
    mockedUseBadgeShowcase.mockReturnValue({
      data: { definitions: [], earned: [] },
      isLoading: false,
      isError: false,
    } as never);
    render(<BadgeShowcase teamId={1} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('renders earned badges with icon image, awarded time and progress', () => {
    mockedUseBadgeShowcase.mockReturnValue({
      data: {
        definitions: [
          {
            code: 'first-blood',
            name: 'First Blood',
            description: 'First badge',
            color: '#ff0000',
            glyph: '🏆',
            icon_url: 'https://example.com/icon.png',
          },
        ],
        earned: [{ code: 'first-blood', awarded_at: '2024-01-01T10:00:00Z' }],
      },
      isLoading: false,
      isError: false,
    } as never);
    render(<BadgeShowcase teamId={1} />);
    expect(screen.getByText('First Blood')).toBeInTheDocument();
    expect(screen.getByText('First badge')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    const img = document.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://example.com/icon.png');
  });

  it('renders locked badges with glyph fallback and "Por conquistar"', () => {
    mockedUseBadgeShowcase.mockReturnValue({
      data: {
        definitions: [
          {
            code: 'locked-badge',
            name: 'Locked Badge',
            description: '',
            color: '',
            glyph: '',
            icon_url: null,
          },
        ],
        earned: [],
      },
      isLoading: false,
      isError: false,
    } as never);
    render(<BadgeShowcase teamId={1} />);
    expect(screen.getByText('Locked Badge')).toBeInTheDocument();
    expect(screen.getByText('Por conquistar')).toBeInTheDocument();
    expect(screen.getByText('Distinção atribuída à equipa.')).toBeInTheDocument();
    expect(screen.getByText('◈')).toBeInTheDocument();
  });

  it('uses the earliest awarded_at when a badge has multiple earned entries', () => {
    mockedUseBadgeShowcase.mockReturnValue({
      data: {
        definitions: [
          {
            code: 'multi',
            name: 'Multi Badge',
            description: 'desc',
            color: '#123456',
            glyph: '⭐',
            icon_url: null,
          },
        ],
        earned: [
          { code: 'multi', awarded_at: '2024-05-01T10:00:00Z' },
          { code: 'multi', awarded_at: '2024-01-01T08:00:00Z' },
        ],
      },
      isLoading: false,
      isError: false,
    } as never);
    render(<BadgeShowcase teamId={1} />);
    // Should render an awarded time (not "Por conquistar")
    expect(screen.queryByText('Por conquistar')).not.toBeInTheDocument();
  });

  it('computes partial percentage when some but not all definitions are earned', () => {
    mockedUseBadgeShowcase.mockReturnValue({
      data: {
        definitions: [
          { code: 'a', name: 'A', description: '', color: '', glyph: '', icon_url: null },
          { code: 'b', name: 'B', description: '', color: '', glyph: '', icon_url: null },
        ],
        earned: [{ code: 'a', awarded_at: '2024-01-01T10:00:00Z' }],
      },
      isLoading: false,
      isError: false,
    } as never);
    render(<BadgeShowcase teamId={1} />);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });
});

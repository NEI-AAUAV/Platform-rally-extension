import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HomeHero } from '@/pages/home/HomeHero';
import type { Branding } from '@/lib/branding';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

const branding: Branding = {
  eventName: 'Rally Tascas',
  eventSubtitle: 'A maior caça ao tesouro académica',
  accentColor: '',
  bannerSrc: '/banner.jpeg',
  logoSrc: '',
  faviconHref: '/favicon.ico',
  customFaviconUrl: '',
  themeColor: '#dc2626',
};

describe('HomeHero', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the event name and subtitle', () => {
    render(<HomeHero branding={branding} settings={null} />);
    expect(screen.getByText('Rally Tascas')).toBeInTheDocument();
    expect(screen.getByText('A maior caça ao tesouro académica')).toBeInTheDocument();
  });

  it('renders CTA links to team login and scoreboard', () => {
    render(<HomeHero branding={branding} settings={null} />);
    expect(screen.getByRole('link', { name: /Entrar com a Equipa/i })).toHaveAttribute(
      'href',
      '/team-login',
    );
    expect(screen.getByRole('link', { name: /Ver Pontuação/i })).toHaveAttribute(
      'href',
      '/scoreboard',
    );
  });

  it('hides the scoreboard CTA when the leaderboard is unavailable', () => {
    render(<HomeHero branding={branding} settings={null} showLeaderboard={false} />);
    expect(screen.queryByRole('link', { name: /Ver Pontuação/i })).not.toBeInTheDocument();
  });

  it('shows "Em breve" pill and countdown when rally has not started', () => {
    render(
      <HomeHero
        branding={branding}
        settings={{
          rally_start_time: '2026-07-19T12:00:00Z',
          rally_end_time: '2026-07-20T12:00:00Z',
        } as any}
      />,
    );
    expect(screen.getByText('Em breve')).toBeInTheDocument();
    expect(screen.getByText('Começa em')).toBeInTheDocument();
  });

  it('shows live pill and countdown to end when rally is ongoing', () => {
    render(
      <HomeHero
        branding={branding}
        settings={{
          rally_start_time: '2026-07-18T00:00:00Z',
          rally_end_time: '2026-07-19T00:00:00Z',
        } as any}
      />,
    );
    expect(screen.getByText('A decorrer agora')).toBeInTheDocument();
    expect(screen.getByText('Termina em')).toBeInTheDocument();
  });

  it('shows "Edição terminada" pill when rally has ended', () => {
    render(
      <HomeHero
        branding={branding}
        settings={{
          rally_start_time: '2026-07-16T00:00:00Z',
          rally_end_time: '2026-07-17T00:00:00Z',
        } as any}
      />,
    );
    expect(screen.getByText('Edição terminada')).toBeInTheDocument();
  });

  it('renders without a settings prop', () => {
    render(<HomeHero branding={branding} />);
    expect(screen.getByText('Rally Tascas')).toBeInTheDocument();
  });
});

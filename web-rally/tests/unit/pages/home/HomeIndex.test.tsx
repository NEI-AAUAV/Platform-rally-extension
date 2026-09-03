import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Home from '@/pages/home/index';

const { mockUseTeamAuth, mockUseRallySettings, mockUseUserStore } = vi.hoisted(() => ({
  mockUseTeamAuth: vi.fn(),
  mockUseRallySettings: vi.fn(),
  mockUseUserStore: vi.fn(),
}));

vi.mock('@/hooks/useTeamAuth', () => ({
  default: () => mockUseTeamAuth(),
}));

vi.mock('@/hooks/useRallySettings', () => ({
  default: () => mockUseRallySettings(),
}));

vi.mock('@/stores/useUserStore', () => ({
  useUserStore: (selector: (state: unknown) => unknown) => selector(mockUseUserStore()),
}));

vi.mock('@tanstack/react-router', () => ({
  Navigate: ({ to }: { to: string }) => <div>Navigate to {to}</div>,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

vi.mock('@/components/home/Reveal', () => ({
  Reveal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/pages/home/HomeHero', () => ({
  default: () => <div>HomeHero</div>,
}));
vi.mock('@/pages/home/RallyMarquee', () => ({
  default: () => <div>RallyMarquee</div>,
}));
vi.mock('@/pages/home/EventStatsRibbon', () => ({
  default: () => <div>EventStatsRibbon</div>,
}));
vi.mock('@/pages/home/HowItWorks', () => ({
  default: () => <div>HowItWorks</div>,
}));
vi.mock('@/pages/home/LiveTop5', () => ({
  default: () => <div>LiveTop5</div>,
}));
vi.mock('@/pages/home/PostosPreview', () => ({
  default: () => <div>PostosPreview</div>,
}));
vi.mock('@/pages/home/HomeBottomBanner', () => ({
  default: () => <div>HomeBottomBanner</div>,
}));

describe('Home index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUserStore.mockReturnValue({ scopes: undefined });
  });

  it('redirects team-authenticated users to team-progress', () => {
    mockUseTeamAuth.mockReturnValue({ isAuthenticated: true });
    mockUseRallySettings.mockReturnValue({ settings: undefined });
    render(<Home />);
    expect(screen.getByText('Navigate to /team-progress')).toBeInTheDocument();
  });

  it('renders default layout sections for public visitors', () => {
    mockUseTeamAuth.mockReturnValue({ isAuthenticated: false });
    mockUseRallySettings.mockReturnValue({ settings: undefined });
    render(<Home />);
    expect(screen.getByText('HomeHero')).toBeInTheDocument();
    expect(screen.getByText('RallyMarquee')).toBeInTheDocument();
    expect(screen.getByText('EventStatsRibbon')).toBeInTheDocument();
    expect(screen.getByText('LiveTop5')).toBeInTheDocument();
    expect(screen.getByText('HowItWorks')).toBeInTheDocument();
    expect(screen.getByText('PostosPreview')).toBeInTheDocument();
    expect(screen.getByText('HomeBottomBanner')).toBeInTheDocument();
  });

  it('hides live_top5 section when score mode is hidden', () => {
    mockUseTeamAuth.mockReturnValue({ isAuthenticated: false });
    mockUseRallySettings.mockReturnValue({ settings: { show_score_mode: 'hidden' } });
    render(<Home />);
    expect(screen.queryByText('LiveTop5')).not.toBeInTheDocument();
  });

  it('hides leaderboard entry points for public visitors when it is disabled', () => {
    mockUseTeamAuth.mockReturnValue({ isAuthenticated: false });
    mockUseRallySettings.mockReturnValue({ settings: { show_live_leaderboard: false } });
    render(<Home />);
    expect(screen.queryByText('LiveTop5')).not.toBeInTheDocument();
  });

  it('keeps leaderboard entry points for staff when it is disabled', () => {
    mockUseTeamAuth.mockReturnValue({ isAuthenticated: false });
    mockUseUserStore.mockReturnValue({ scopes: ['rally-staff'] });
    mockUseRallySettings.mockReturnValue({ settings: { show_live_leaderboard: false } });
    render(<Home />);
    expect(screen.getByText('LiveTop5')).toBeInTheDocument();
  });

  it('respects a custom home_layout with hidden sections', () => {
    mockUseTeamAuth.mockReturnValue({ isAuthenticated: false });
    mockUseRallySettings.mockReturnValue({
      settings: {
        home_layout: [
          { key: 'home_hero', visible: true },
          { key: 'rally_marquee', visible: false },
        ],
      },
    });
    render(<Home />);
    expect(screen.getByText('HomeHero')).toBeInTheDocument();
    expect(screen.queryByText('RallyMarquee')).not.toBeInTheDocument();
  });
});

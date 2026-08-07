import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MainLayout from '@/pages/layout';

const { mockUseUserStore, mockUseTeamAuth, mockUseStaffLogin, mockUseRallySettings, mockUseDocumentBranding } =
  vi.hoisted(() => ({
    mockUseUserStore: vi.fn(),
    mockUseTeamAuth: vi.fn(),
    mockUseStaffLogin: vi.fn(),
    mockUseRallySettings: vi.fn(),
    mockUseDocumentBranding: vi.fn(),
  }));

vi.mock('@/stores/useUserStore', () => ({
  useUserStore: (selector: (s: unknown) => unknown) => mockUseUserStore(selector),
}));

vi.mock('@/hooks/useLoginLink', () => ({
  default: () => mockUseStaffLogin(),
}));

vi.mock('@/hooks/useRallySettings', () => ({
  default: () => mockUseRallySettings(),
}));

vi.mock('@/hooks/useTeamAuth', () => ({
  default: () => mockUseTeamAuth(),
}));

vi.mock('@/hooks/useDocumentBranding', () => ({
  default: (...args: unknown[]) => mockUseDocumentBranding(...args),
}));

vi.mock('@/components/shared/navigation/RallyNavbar', () => ({
  RallyNavbar: () => <nav data-testid="navbar" />,
}));

vi.mock('@/components/shared/layout/SiteFooter', () => ({
  SiteFooter: () => <footer data-testid="footer" />,
}));

vi.mock('@/components/shared/navigation/MobileBottomNav', () => ({
  MobileBottomNav: () => <div data-testid="mobile-nav" />,
}));

vi.mock('@/components/pwa/PWAInstallPrompt', () => ({
  default: () => <div data-testid="pwa-prompt" />,
}));

vi.mock('@/components/ErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/landing/LandingGate', () => ({
  default: () => <div data-testid="landing-gate" />,
}));

vi.mock('@tanstack/react-router', () => ({
  Outlet: () => <div data-testid="outlet" />,
  useLocation: (opts?: { select?: (loc: { pathname: string }) => unknown }) =>
    opts?.select ? opts.select({ pathname: window.location.pathname }) : { pathname: window.location.pathname },
}));

vi.mock('@/components/themes', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTheme: () => ({ themeName: 'default' }),
}));

describe('MainLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseStaffLogin.mockReturnValue(vi.fn());
    // Default: no team session. Individual tests override via mockUseTeamAuth.
    mockUseTeamAuth.mockReturnValue({ isAuthenticated: false, teamData: null, isLoading: false });
  });

  it('renders the LandingGate when unauthenticated, public access disabled, and not on a public path', () => {
    mockUseUserStore.mockImplementation((selector) =>
      selector({ sub: undefined, sessionLoading: false }),
    );
    mockUseRallySettings.mockReturnValue({
      settings: { public_access_enabled: false },
      isLoading: false,
    });
    window.history.pushState({}, '', '/rally/private-page');

    render(<MainLayout />);
    expect(screen.getByTestId('landing-gate')).toBeInTheDocument();
    expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
  });

  it('renders the full app shell when authenticated', () => {
    mockUseUserStore.mockImplementation((selector) =>
      selector({ sub: 'user-1', sessionLoading: false }),
    );
    mockUseRallySettings.mockReturnValue({
      settings: { public_access_enabled: false },
      isLoading: false,
    });
    window.history.pushState({}, '', '/rally/');

    render(<MainLayout />);
    expect(screen.getByTestId('navbar')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-nav')).toBeInTheDocument();
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
    expect(screen.queryByTestId('landing-gate')).not.toBeInTheDocument();
  });

  it('renders the full app shell when public access is enabled, even if unauthenticated', () => {
    mockUseUserStore.mockImplementation((selector) =>
      selector({ sub: undefined, sessionLoading: false }),
    );
    mockUseRallySettings.mockReturnValue({
      settings: { public_access_enabled: true },
      isLoading: false,
    });
    window.history.pushState({}, '', '/rally/');

    render(<MainLayout />);
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
  });

  it('shows a loading spinner while settings are loading', () => {
    mockUseUserStore.mockImplementation((selector) =>
      selector({ sub: undefined, sessionLoading: false }),
    );
    mockUseRallySettings.mockReturnValue({ settings: undefined, isLoading: true });
    window.history.pushState({}, '', '/rally/');

    render(<MainLayout />);
    expect(screen.getByText('A carregar')).toBeInTheDocument();
  });

  it('renders the full app shell for a team-only session even when public access is disabled', () => {
    mockUseUserStore.mockImplementation((selector) =>
      selector({ sub: undefined, sessionLoading: false }),
    );
    mockUseTeamAuth.mockReturnValue({ isAuthenticated: true, teamData: null, isLoading: false });
    mockUseRallySettings.mockReturnValue({
      settings: { public_access_enabled: false },
      isLoading: false,
    });
    window.history.pushState({}, '', '/rally/team-info');

    render(<MainLayout />);
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
    expect(screen.queryByTestId('landing-gate')).not.toBeInTheDocument();
  });

  it('does not block access when settings fail to load (undefined, not loading)', () => {
    mockUseUserStore.mockImplementation((selector) =>
      selector({ sub: undefined, sessionLoading: false }),
    );
    mockUseRallySettings.mockReturnValue({ settings: undefined, isLoading: false });
    window.history.pushState({}, '', '/rally/private-page');

    render(<MainLayout />);
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
    expect(screen.queryByTestId('landing-gate')).not.toBeInTheDocument();
  });
});

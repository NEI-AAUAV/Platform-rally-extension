import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Conquistas from '@/pages/conquistas/index';

const { mockUseTeamAuth, mockUseRallySettings } = vi.hoisted(() => ({
  mockUseTeamAuth: vi.fn(),
  mockUseRallySettings: vi.fn(),
}));

vi.mock('@/hooks/useTeamAuth', () => ({
  default: () => mockUseTeamAuth(),
}));

vi.mock('@/hooks/useRallySettings', () => ({
  default: () => mockUseRallySettings(),
}));

vi.mock('@/components/badges/BadgeShowcase', () => ({
  BadgeShowcase: ({ teamId }: { teamId: number }) => <div>BadgeShowcase for {teamId}</div>,
}));

vi.mock('@/components/shared', () => ({
  LoadingState: ({ message }: { message: string }) => <div>{message}</div>,
}));

vi.mock('@tanstack/react-router', () => ({
  Navigate: ({ to }: { to: string }) => <div>Navigate to {to}</div>,
}));

describe('Conquistas page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state while team or settings loading', () => {
    mockUseTeamAuth.mockReturnValue({ isAuthenticated: false, teamData: undefined, isLoading: true });
    mockUseRallySettings.mockReturnValue({ settings: undefined, isLoading: false });
    render(<Conquistas />);
    expect(screen.getByText('A carregar conquistas...')).toBeInTheDocument();
  });

  it('redirects home when badges disabled', () => {
    mockUseTeamAuth.mockReturnValue({ isAuthenticated: true, teamData: { team_id: 1 }, isLoading: false });
    mockUseRallySettings.mockReturnValue({ settings: { badges_enabled: false }, isLoading: false });
    render(<Conquistas />);
    expect(screen.getByText('Navigate to /')).toBeInTheDocument();
  });

  it('redirects to team-login when not authenticated', () => {
    mockUseTeamAuth.mockReturnValue({ isAuthenticated: false, teamData: undefined, isLoading: false });
    mockUseRallySettings.mockReturnValue({ settings: { badges_enabled: true }, isLoading: false });
    render(<Conquistas />);
    expect(screen.getByText('Navigate to /team-login')).toBeInTheDocument();
  });

  it('renders badge showcase for authenticated team', () => {
    mockUseTeamAuth.mockReturnValue({ isAuthenticated: true, teamData: { team_id: 42 }, isLoading: false });
    mockUseRallySettings.mockReturnValue({ settings: { badges_enabled: true }, isLoading: false });
    render(<Conquistas />);
    expect(screen.getByText('BadgeShowcase for 42')).toBeInTheDocument();
  });
});

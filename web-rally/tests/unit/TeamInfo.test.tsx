import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeamInfo from '@/pages/team-info/index';
import { TeamMemberLinkService } from '@/services/TeamMemberLinkService';

const { mockUseTeamAuth, mockUseStaffLogin, mockToast, mockUseAuth } = vi.hoisted(() => ({
  mockUseTeamAuth: vi.fn(),
  mockUseStaffLogin: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn() },
  mockUseAuth: vi.fn(),
}));

vi.mock('@/hooks/useTeamAuth', () => ({
  default: () => mockUseTeamAuth(),
}));

vi.mock('@/hooks/useLoginLink', () => ({
  default: () => mockUseStaffLogin(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useAppToast: () => mockToast,
}));

vi.mock('@/services/TeamMemberLinkService', () => ({
  TeamMemberLinkService: {
    linkSelf: vi.fn(),
  },
}));

vi.mock('react-oidc-context', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/components/shared', () => ({
  LoadingState: ({ message }: { message: string }) => <div>{message}</div>,
}));

const reloadSpy = vi.fn();

describe('TeamInfo page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseStaffLogin.mockReturnValue(vi.fn());
    mockUseAuth.mockReturnValue({ isAuthenticated: false });
    sessionStorage.clear();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadSpy },
      writable: true,
    });
  });

  it('shows loading state', () => {
    mockUseTeamAuth.mockReturnValue({ team: undefined, teamData: undefined, isLoading: true });
    render(<TeamInfo />);
    expect(screen.getByText('A carregar equipa...')).toBeInTheDocument();
  });

  it('renders team name and members', () => {
    mockUseTeamAuth.mockReturnValue({
      team: {
        name: 'Team A',
        members: [
          { id: 1, name: 'Alice', is_captain: true, is_linked: true },
          { id: 2, name: 'Bob', is_captain: false, is_linked: false },
        ],
      },
      teamData: { team_id: 1 },
      isLoading: false,
    });
    render(<TeamInfo />);
    expect(screen.getByText('Team A')).toBeInTheDocument();
    expect(screen.getByText('Capitão')).toBeInTheDocument();
    expect(screen.getByText('Associado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Associar a mim/i })).toBeInTheDocument();
  });

  it('links immediately when already OIDC-authenticated', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    vi.mocked(TeamMemberLinkService.linkSelf).mockResolvedValue(undefined as never);
    mockUseTeamAuth.mockReturnValue({
      team: {
        name: 'Team A',
        members: [{ id: 2, name: 'Bob', is_captain: false, is_linked: false }],
      },
      teamData: { team_id: 1 },
      isLoading: false,
    });
    const user = userEvent.setup();
    render(<TeamInfo />);

    await user.click(screen.getByRole('button', { name: /Associar a mim/i }));

    await waitFor(() => {
      expect(TeamMemberLinkService.linkSelf).toHaveBeenCalledWith(1, 2);
    });
    await waitFor(() => expect(mockToast.success).toHaveBeenCalled());
    expect(reloadSpy).toHaveBeenCalled();
  });

  it('starts staff login and stores pending link when not authenticated', async () => {
    const onStaffLogin = vi.fn();
    mockUseStaffLogin.mockReturnValue(onStaffLogin);
    mockUseTeamAuth.mockReturnValue({
      team: {
        name: 'Team A',
        members: [{ id: 2, name: 'Bob', is_captain: false, is_linked: false }],
      },
      teamData: { team_id: 1 },
      isLoading: false,
    });
    const user = userEvent.setup();
    render(<TeamInfo />);

    await user.click(screen.getByRole('button', { name: /Associar a mim/i }));

    expect(onStaffLogin).toHaveBeenCalled();
    expect(sessionStorage.getItem('rally_pending_link_user_id')).toBe('2');
    expect(sessionStorage.getItem('rally_pending_link_team_id')).toBe('1');
  });

  it('resumes a pending link automatically once authenticated', async () => {
    sessionStorage.setItem('rally_pending_link_user_id', '2');
    sessionStorage.setItem('rally_pending_link_team_id', '1');
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    vi.mocked(TeamMemberLinkService.linkSelf).mockResolvedValue(undefined as never);
    mockUseTeamAuth.mockReturnValue({
      team: { name: 'Team A', members: [] },
      teamData: { team_id: 1 },
      isLoading: false,
    });

    render(<TeamInfo />);

    await waitFor(() => {
      expect(TeamMemberLinkService.linkSelf).toHaveBeenCalledWith(1, 2);
    });
  });

  it('shows an error toast when linking fails', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    vi.mocked(TeamMemberLinkService.linkSelf).mockRejectedValue(new Error('link failed'));
    mockUseTeamAuth.mockReturnValue({
      team: {
        name: 'Team A',
        members: [{ id: 2, name: 'Bob', is_captain: false, is_linked: false }],
      },
      teamData: { team_id: 1 },
      isLoading: false,
    });
    const user = userEvent.setup();
    render(<TeamInfo />);

    await user.click(screen.getByRole('button', { name: /Associar a mim/i }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('link failed');
    });
  });
});

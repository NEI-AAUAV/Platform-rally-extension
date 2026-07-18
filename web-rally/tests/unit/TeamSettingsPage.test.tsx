import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeamSettings from '@/pages/team-settings/index';

const { mockNavigate, mockUseTeamAuth, mockToast, mockLogout } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseTeamAuth: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn() },
  mockLogout: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/hooks/useTeamAuth', () => ({
  default: () => mockUseTeamAuth(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useAppToast: () => mockToast,
}));

describe('TeamSettings page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTeamAuth.mockReturnValue({
      teamData: { team_name: 'Team Alpha' },
      logout: mockLogout,
    });
  });

  it('renders the current team name', () => {
    render(<TeamSettings />);
    expect(screen.getByText('Definições')).toBeInTheDocument();
    expect(screen.getByText('Equipa atual: Team Alpha')).toBeInTheDocument();
  });

  it('renders without a team name when teamData is missing', () => {
    mockUseTeamAuth.mockReturnValue({ teamData: null, logout: mockLogout });
    render(<TeamSettings />);
    expect(screen.queryByText(/Equipa atual/)).not.toBeInTheDocument();
  });

  it('navigates to team-login when "Trocar Equipa" is clicked', async () => {
    const user = userEvent.setup();
    render(<TeamSettings />);
    await user.click(screen.getByRole('button', { name: /Trocar Equipa/ }));
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/team-login' });
  });

  it('logs out, toasts, and navigates home on confirming logout', async () => {
    const user = userEvent.setup();
    render(<TeamSettings />);
    await user.click(screen.getByRole('button', { name: /Terminar Sessão/ }));
    // Confirm inside the alert dialog
    const confirmButtons = screen.getAllByRole('button', { name: /Terminar Sessão/ });
    await user.click(confirmButtons[confirmButtons.length - 1]!);

    expect(mockLogout).toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalledWith('Sessão terminada');
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
  });
});

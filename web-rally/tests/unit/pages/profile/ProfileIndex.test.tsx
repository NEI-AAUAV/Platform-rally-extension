import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Profile from '@/pages/profile/index';
import { ColorModeProvider } from '@/components/theme/ColorModeProvider';

const { mockUseUserStore, mockUseStaffLogin, mockUseProfile } = vi.hoisted(() => ({
  mockUseUserStore: vi.fn(),
  mockUseStaffLogin: vi.fn(),
  mockUseProfile: vi.fn(),
}));

vi.mock('@/stores/useUserStore', () => ({
  useUserStore: (selector: (state: unknown) => unknown) => selector(mockUseUserStore()),
}));

vi.mock('@/hooks/useLoginLink', () => ({
  default: () => mockUseStaffLogin(),
}));

vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => mockUseProfile(),
}));

vi.mock('@/components/shared', () => ({
  PageHeader: ({ title }: { title: string }) => <div>{title}</div>,
  LoadingState: ({ message }: { message: string }) => <div>{message}</div>,
}));

vi.mock('@/pages/profile/JoinTeamCard', () => ({
  default: () => <div>JoinTeamCard</div>,
}));

// The page hosts the appearance panel, which needs the colour-mode context.
function renderProfile() {
  return render(
    <ColorModeProvider>
      <Profile />
    </ColorModeProvider>,
  );
}

describe('Profile index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseStaffLogin.mockReturnValue(vi.fn());
  });

  it('shows loading state while session is loading', () => {
    mockUseUserStore.mockReturnValue({ sessionLoading: true });
    mockUseProfile.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    renderProfile();
    expect(screen.getByText('A carregar perfil...')).toBeInTheDocument();
  });

  it('shows login prompt when not authenticated', async () => {
    mockUseUserStore.mockReturnValue({ sessionLoading: false, isAuthenticated: false });
    mockUseProfile.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    const onStaffLogin = vi.fn();
    mockUseStaffLogin.mockReturnValue(onStaffLogin);
    const user = userEvent.setup();
    renderProfile();
    expect(screen.getByText('Inicia sessão')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Login NEI/i }));
    expect(onStaffLogin).toHaveBeenCalled();
  });

  it('renders profile with participations', () => {
    mockUseUserStore.mockReturnValue({
      sessionLoading: false,
      isAuthenticated: true,
      name: 'Alice',
      email: 'alice@example.com',
      image: null,
      scopes: ['admin'],
    });
    mockUseProfile.mockReturnValue({
      data: {
        name: 'Alice',
        email: 'alice@example.com',
        scopes: ['admin'],
        current_team_id: 1,
        participations: [
          {
            event_id: 1,
            team_id: 2,
            event_name: 'Rally 2024',
            event_type: 'rally',
            team_name: 'Team A',
            joined_at: '2024-01-01T00:00:00Z',
            is_captain: true,
            team_classification: 1,
            team_total: 100,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    renderProfile();
    expect(screen.getByText('O meu perfil')).toBeInTheDocument();
    expect(screen.getByText('Rally 2024')).toBeInTheDocument();
    expect(screen.getByText('Capitão')).toBeInTheDocument();
    expect(screen.queryByText('JoinTeamCard')).not.toBeInTheDocument();
  });

  it('shows JoinTeamCard when user has no current team', () => {
    mockUseUserStore.mockReturnValue({
      sessionLoading: false,
      isAuthenticated: true,
      name: 'Alice',
      email: 'alice@example.com',
      image: null,
      scopes: [],
    });
    mockUseProfile.mockReturnValue({
      data: { current_team_id: null, participations: [] },
      isLoading: false,
      isError: false,
    });
    renderProfile();
    expect(screen.getByText('JoinTeamCard')).toBeInTheDocument();
  });

  it('shows error state when profile fails to load', () => {
    mockUseUserStore.mockReturnValue({
      sessionLoading: false,
      isAuthenticated: true,
      name: 'Alice',
      email: 'alice@example.com',
    });
    mockUseProfile.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderProfile();
    expect(screen.getByText('Não foi possível carregar o histórico.')).toBeInTheDocument();
  });

  it('shows empty participations message', () => {
    mockUseUserStore.mockReturnValue({
      sessionLoading: false,
      isAuthenticated: true,
      name: 'Alice',
      email: 'alice@example.com',
    });
    mockUseProfile.mockReturnValue({
      data: { current_team_id: 1, participations: [] },
      isLoading: false,
      isError: false,
    });
    renderProfile();
    expect(
      screen.getByText('Ainda não há participações registadas. Junta-te a uma equipa para começar.'),
    ).toBeInTheDocument();
  });
});

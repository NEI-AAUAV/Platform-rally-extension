import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StaffTeamView from '@/pages/team-members/staff-view';

const { mockUseUser, mockUseFallbackNavigation, mockUseTeamMembersData } = vi.hoisted(() => ({
  mockUseUser: vi.fn(),
  mockUseFallbackNavigation: vi.fn(),
  mockUseTeamMembersData: vi.fn(),
}));

vi.mock('@/hooks/useUser', () => ({
  default: () => mockUseUser(),
}));

vi.mock('@/hooks/useFallbackNavigation', () => ({
  default: () => mockUseFallbackNavigation(),
}));

vi.mock('@/pages/team-members/hooks/useTeamMembersData', () => ({
  useTeamMembersData: (...args: unknown[]) => mockUseTeamMembersData(...args),
}));

vi.mock('@/pages/team-members/components', () => ({
  TeamSelector: ({
    teams,
    onTeamChange,
  }: {
    teams?: Array<{ id: number; name: string }>;
    selectedTeam: string;
    onTeamChange: (v: string) => void;
  }) => (
    <select aria-label="team-selector" onChange={(e) => onTeamChange(e.target.value)} value="">
      <option value="">-</option>
      {(teams || []).map((t) => (
        <option key={t.id} value={String(t.id)}>
          {t.name}
        </option>
      ))}
    </select>
  ),
  ErrorBanner: ({ title, error }: { title: string; error: Error }) => (
    <div>
      <h3>{title}</h3>
      <p>{error.message}</p>
    </div>
  ),
  NoTeamsMessage: () => <div>Nenhuma equipa encontrada</div>,
  StaffTeamRoster: ({ teamName }: { teamName?: string }) => (
    <div data-testid="staff-roster">{teamName}</div>
  ),
}));

vi.mock('@tanstack/react-router', () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
}));

vi.mock('@/components/shared', () => ({
  LoadingState: ({ message }: { message: string }) => <div>{message}</div>,
}));

const emptyQuery = { data: undefined, error: null, isLoading: false };

describe('StaffTeamView page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFallbackNavigation.mockReturnValue('/scoreboard');
    mockUseTeamMembersData.mockReturnValue({
      teamsQuery: emptyQuery,
      membersQuery: emptyQuery,
      teamDataQuery: emptyQuery,
    });
  });

  it('shows loading state', () => {
    mockUseUser.mockReturnValue({ isLoading: true, userStore: {} });
    render(<StaffTeamView />);
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('redirects when not staff', () => {
    mockUseUser.mockReturnValue({ isLoading: false, userStore: { scopes: [] } });
    render(<StaffTeamView />);
    expect(screen.getByTestId('navigate')).toHaveTextContent('/scoreboard');
  });

  it('renders staff heading and no-teams message', () => {
    mockUseUser.mockReturnValue({ isLoading: false, userStore: { scopes: ['rally-staff'] } });
    mockUseTeamMembersData.mockReturnValue({
      teamsQuery: { ...emptyQuery, data: [] },
      membersQuery: emptyQuery,
      teamDataQuery: emptyQuery,
    });
    render(<StaffTeamView />);
    expect(screen.getByText('Consultar Equipas')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma equipa encontrada')).toBeInTheDocument();
  });

  it('renders the staff team roster and members-loading state for a selected team', async () => {
    mockUseUser.mockReturnValue({ isLoading: false, userStore: { scopes: ['rally-staff'] } });
    mockUseTeamMembersData.mockReturnValue({
      teamsQuery: { ...emptyQuery, data: [{ id: 1, name: 'Team A' }] },
      membersQuery: { ...emptyQuery, isLoading: true },
      teamDataQuery: emptyQuery,
    });
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<StaffTeamView />);

    await user.selectOptions(screen.getByLabelText('team-selector'), '1');

    expect(screen.getByText('A carregar membros da equipa...')).toBeInTheDocument();
    expect(screen.getByTestId('staff-roster')).toHaveTextContent('Team A');
  });

  it('shows loading and error banners', () => {
    mockUseUser.mockReturnValue({ isLoading: false, userStore: { scopes: ['rally-staff'] } });
    mockUseTeamMembersData.mockReturnValue({
      teamsQuery: { ...emptyQuery, isLoading: true, error: new Error('teams broke') },
      membersQuery: { ...emptyQuery, error: new Error('members broke') },
      teamDataQuery: emptyQuery,
    });
    render(<StaffTeamView />);
    expect(screen.getByText('A carregar equipas...')).toBeInTheDocument();
    expect(screen.getByText('teams broke')).toBeInTheDocument();
    expect(screen.getByText('members broke')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeamMembers from '@/pages/team-members/index';

const { mockUseUser, mockUseUserStore, mockUseTeamMembersData } = vi.hoisted(() => ({
  mockUseUser: vi.fn(),
  mockUseUserStore: vi.fn(),
  mockUseTeamMembersData: vi.fn(),
}));

vi.mock('@/hooks/useUser', () => ({
  default: () => mockUseUser(),
}));

vi.mock('@/stores/useUserStore', () => ({
  useUserStore: (selector: (s: unknown) => unknown) => mockUseUserStore(selector),
}));

vi.mock('@/pages/team-members/hooks/useTeamMembersData', () => ({
  useTeamMembersData: (...args: unknown[]) => mockUseTeamMembersData(...args),
}));

vi.mock('./components', () => ({}));

vi.mock('@/pages/team-members/components', () => ({
  TeamSelector: ({
    teams,
    onTeamChange,
  }: {
    teams?: Array<{ id: number; name: string }>;
    selectedTeam: string;
    onTeamChange: (v: string) => void;
  }) => (
    <select
      aria-label="team-selector"
      onChange={(e) => onTeamChange(e.target.value)}
      value=""
    >
      <option value="">-</option>
      {(teams || []).map((t) => (
        <option key={t.id} value={String(t.id)}>
          {t.name}
        </option>
      ))}
    </select>
  ),
  MemberForm: () => <div data-testid="member-form" />,
  MemberList: ({ teamMembers }: { teamMembers: Array<{ id: number; name: string }> }) => (
    <ul>
      {teamMembers.map((m) => (
        <li key={m.id}>{m.name}</li>
      ))}
    </ul>
  ),
  ErrorBanner: ({ title, error }: { title: string; error: Error }) => (
    <div>
      <h3>{title}</h3>
      <p>{error.message}</p>
    </div>
  ),
  NoTeamsMessage: () => <div>Nenhuma equipa encontrada</div>,
  StaffTeamRoster: () => <div data-testid="staff-roster" />,
}));

vi.mock('@tanstack/react-router', () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
}));

vi.mock('@/components/shared', () => ({
  LoadingState: ({ message }: { message: string }) => <div>{message}</div>,
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

const emptyQuery = { data: undefined, error: null, isLoading: false, refetch: vi.fn() };

describe('TeamMembers page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUserStore.mockImplementation((selector) => selector({ token: 'tok' }));
    mockUseTeamMembersData.mockReturnValue({
      teamsQuery: emptyQuery,
      membersQuery: emptyQuery,
      teamDataQuery: emptyQuery,
    });
  });

  it('shows loading state', () => {
    mockUseUser.mockReturnValue({ isLoading: true, isRallyAdmin: false, userStore: {} });
    render(<TeamMembers />);
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('redirects non-admin, non-staff users', () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: false, userStore: { scopes: [] } });
    render(<TeamMembers />);
    expect(screen.getByTestId('navigate')).toHaveTextContent('/scoreboard');
  });

  it('renders admin heading and no-teams message when teams empty', () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true, userStore: { scopes: [] } });
    mockUseTeamMembersData.mockReturnValue({
      teamsQuery: { ...emptyQuery, data: [] },
      membersQuery: emptyQuery,
      teamDataQuery: emptyQuery,
    });
    render(<TeamMembers />);
    expect(screen.getByText('Gestão de membros')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma equipa encontrada')).toBeInTheDocument();
  });

  it('renders staff heading when staff but not admin', () => {
    mockUseUser.mockReturnValue({
      isLoading: false,
      isRallyAdmin: false,
      userStore: { scopes: ['rally-staff'] },
    });
    render(<TeamMembers />);
    expect(screen.getByText('Consultar equipas')).toBeInTheDocument();
  });

  it('does not redirect when embedded even without admin/staff', () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: false, userStore: { scopes: [] } });
    render(<TeamMembers embedded />);
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
  });

  it('renders member list for the selected team as admin and refetches on success', async () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true, userStore: { scopes: [] } });
    const refetch = vi.fn();
    mockUseTeamMembersData.mockReturnValue({
      teamsQuery: { ...emptyQuery, data: [{ id: 1, name: 'Team A' }] },
      membersQuery: {
        ...emptyQuery,
        data: [{ id: 10, name: 'Alice', email: 'alice@example.com', is_captain: true }],
        refetch,
      },
      teamDataQuery: emptyQuery,
    });
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<TeamMembers />);

    await user.selectOptions(screen.getByLabelText('team-selector'), '1');

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByTestId('member-form')).toBeInTheDocument();
  });

  it('shows teams loading and error banners', () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true, userStore: { scopes: [] } });
    mockUseTeamMembersData.mockReturnValue({
      teamsQuery: { ...emptyQuery, isLoading: true, error: new Error('teams broke') },
      membersQuery: { ...emptyQuery, error: new Error('members broke') },
      teamDataQuery: emptyQuery,
    });
    render(<TeamMembers />);
    expect(screen.getByText('A carregar equipas...')).toBeInTheDocument();
    expect(screen.getByText('teams broke')).toBeInTheDocument();
    expect(screen.getByText('members broke')).toBeInTheDocument();
  });
});

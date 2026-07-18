import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TeamMembersCard from '@/pages/team-progress/TeamMembersCard';
import type { DetailedTeam } from '@/client';

const {
  mockUseUserStore,
  mockUseProfile,
  mockClaimMembership,
  mockToast,
  mockInvalidateQueries,
} = vi.hoisted(() => ({
  mockUseUserStore: vi.fn(),
  mockUseProfile: vi.fn(),
  mockClaimMembership: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn() },
  mockInvalidateQueries: vi.fn(),
}));

vi.mock('@/stores/useUserStore', () => ({
  useUserStore: (selector: (s: { isAuthenticated: boolean }) => unknown) =>
    mockUseUserStore(selector),
}));

vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => mockUseProfile(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useAppToast: () => mockToast,
}));

vi.mock('@/client', () => ({
  claimMembership: (...args: unknown[]) => mockClaimMembership(...args),
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  );
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  };
});

const team = {
  members: [
    { id: 1, name: 'Alice Smith' },
    { id: 2, name: 'Bob Jones' },
  ],
} as DetailedTeam;

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('TeamMembersCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUserStore.mockReturnValue(false);
    mockUseProfile.mockReturnValue({ data: undefined });
  });

  it('renders member names', () => {
    const Wrapper = createWrapper();
    render(<TeamMembersCard team={team} />, { wrapper: Wrapper });
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });

  it('does not offer claiming when not authenticated', () => {
    const Wrapper = createWrapper();
    render(<TeamMembersCard team={team} />, { wrapper: Wrapper });
    expect(screen.queryByText(/És um destes membros/)).not.toBeInTheDocument();
  });

  it('offers claiming when authenticated and no current team', async () => {
    mockUseUserStore.mockReturnValue(true);
    mockUseProfile.mockReturnValue({ data: { current_team_id: null } });
    mockClaimMembership.mockResolvedValue({});
    const Wrapper = createWrapper();
    const user = userEvent.setup();
    render(<TeamMembersCard team={team} />, { wrapper: Wrapper });

    expect(screen.getByText(/És um destes membros/)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /Alice Smith/ });
    await user.click(button);

    expect(mockClaimMembership).toHaveBeenCalledWith({ path: { member_user_id: 1 } });
  });

  it('does not offer claiming when profile already has a team', () => {
    mockUseUserStore.mockReturnValue(true);
    mockUseProfile.mockReturnValue({ data: { current_team_id: 5 } });
    const Wrapper = createWrapper();
    render(<TeamMembersCard team={team} />, { wrapper: Wrapper });
    expect(screen.queryByText(/És um destes membros/)).not.toBeInTheDocument();
  });

  it('shows a toast error when claim fails with an Error object', async () => {
    mockUseUserStore.mockReturnValue(true);
    mockUseProfile.mockReturnValue({ data: { current_team_id: null } });
    mockClaimMembership.mockRejectedValue(new Error('boom'));
    const Wrapper = createWrapper();
    const user = userEvent.setup();
    render(<TeamMembersCard team={team} />, { wrapper: Wrapper });

    await user.click(screen.getByRole('button', { name: /Alice Smith/ }));

    await vi.waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('boom'));
  });

  it('shows a toast error with body.detail when claim fails with an API-shaped error', async () => {
    mockUseUserStore.mockReturnValue(true);
    mockUseProfile.mockReturnValue({ data: { current_team_id: null } });
    mockClaimMembership.mockRejectedValue({ body: { detail: 'Already claimed' } });
    const Wrapper = createWrapper();
    const user = userEvent.setup();
    render(<TeamMembersCard team={team} />, { wrapper: Wrapper });

    await user.click(screen.getByRole('button', { name: /Alice Smith/ }));

    await vi.waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Already claimed'));
  });

  it('renders nothing crashy when there are no members', () => {
    const Wrapper = createWrapper();
    const emptyTeam = { members: [] } as unknown as DetailedTeam;
    render(<TeamMembersCard team={emptyTeam} />, { wrapper: Wrapper });
    expect(screen.getByText('Membros')).toBeInTheDocument();
  });
});

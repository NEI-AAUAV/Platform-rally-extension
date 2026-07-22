import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import JoinTeamCard from '@/pages/profile/JoinTeamCard';
import { ProfileService } from '@/services/ProfileService';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

vi.mock('@/services/ProfileService', () => ({
  ProfileService: {
    getClaimable: vi.fn(),
    claimMembership: vi.fn(),
  },
}));

describe('JoinTeamCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables submit until a code is entered', async () => {
    const user = userEvent.setup();
    renderWithClient(<JoinTeamCard />);
    const submit = screen.getByRole('button', { name: /Procurar/i });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Código da equipa'), 'ABCD-1234');
    expect(submit).not.toBeDisabled();
  });

  it('submits the code and shows claimable members', async () => {
    vi.mocked(ProfileService.getClaimable).mockResolvedValue({
      team_name: 'Team X',
      members: [{ id: 1, name: 'Bob', is_captain: false }],
    } as never);
    const user = userEvent.setup();
    renderWithClient(<JoinTeamCard />);

    await user.type(screen.getByLabelText('Código da equipa'), 'ABCD-1234');
    await user.click(screen.getByRole('button', { name: /Procurar/i }));

    await waitFor(() => {
      expect(screen.getByText('Team X')).toBeInTheDocument();
    });
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows empty state when there are no claimable members', async () => {
    vi.mocked(ProfileService.getClaimable).mockResolvedValue({
      team_name: 'Team X',
      members: [],
    } as never);
    const user = userEvent.setup();
    renderWithClient(<JoinTeamCard />);

    await user.type(screen.getByLabelText('Código da equipa'), 'ABCD-1234');
    await user.click(screen.getByRole('button', { name: /Procurar/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Não há membros por associar nesta equipa. Pede a um responsável para te adicionar.'),
      ).toBeInTheDocument();
    });
  });

  it('shows error message when lookup fails', async () => {
    vi.mocked(ProfileService.getClaimable).mockRejectedValue(new Error('not found'));
    const user = userEvent.setup();
    renderWithClient(<JoinTeamCard />);

    await user.type(screen.getByLabelText('Código da equipa'), 'ABCD-1234');
    await user.click(screen.getByRole('button', { name: /Procurar/i }));

    await waitFor(() => {
      expect(screen.getByText('not found')).toBeInTheDocument();
    });
  });

  it('shows the body.detail message when lookup fails with an API error shape', async () => {
    vi.mocked(ProfileService.getClaimable).mockRejectedValue({
      body: { detail: 'Código inválido' },
    });
    const user = userEvent.setup();
    renderWithClient(<JoinTeamCard />);

    await user.type(screen.getByLabelText('Código da equipa'), 'ABCD-1234');
    await user.click(screen.getByRole('button', { name: /Procurar/i }));

    await waitFor(() => {
      expect(screen.getByText('Código inválido')).toBeInTheDocument();
    });
  });

  it('shows a generic fallback message for an unrecognized error shape', async () => {
    vi.mocked(ProfileService.getClaimable).mockRejectedValue('some string error');
    const user = userEvent.setup();
    renderWithClient(<JoinTeamCard />);

    await user.type(screen.getByLabelText('Código da equipa'), 'ABCD-1234');
    await user.click(screen.getByRole('button', { name: /Procurar/i }));

    await waitFor(() => {
      expect(screen.getByText('Algo correu mal. Tenta novamente.')).toBeInTheDocument();
    });
  });

  it('claims a membership when a member is selected', async () => {
    vi.mocked(ProfileService.getClaimable).mockResolvedValue({
      team_name: 'Team X',
      members: [{ id: 5, name: 'Carla', is_captain: true }],
    } as never);
    vi.mocked(ProfileService.claimMembership).mockResolvedValue(undefined as never);
    const user = userEvent.setup();
    renderWithClient(<JoinTeamCard />);

    await user.type(screen.getByLabelText('Código da equipa'), 'ABCD-1234');
    await user.click(screen.getByRole('button', { name: /Procurar/i }));

    await user.click(await screen.findByText('Carla'));

    await waitFor(() => {
      expect(ProfileService.claimMembership).toHaveBeenCalledWith(5);
    });
  });

  it('shows error message when claim fails', async () => {
    vi.mocked(ProfileService.getClaimable).mockResolvedValue({
      team_name: 'Team X',
      members: [{ id: 5, name: 'Carla', is_captain: false }],
    } as never);
    vi.mocked(ProfileService.claimMembership).mockRejectedValue(new Error('claim failed'));
    const user = userEvent.setup();
    renderWithClient(<JoinTeamCard />);

    await user.type(screen.getByLabelText('Código da equipa'), 'ABCD-1234');
    await user.click(screen.getByRole('button', { name: /Procurar/i }));

    await user.click(await screen.findByText('Carla'));

    await waitFor(() => {
      expect(screen.getByText('claim failed')).toBeInTheDocument();
    });
  });
});

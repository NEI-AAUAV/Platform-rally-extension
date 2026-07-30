import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import MemberList from '@/pages/team-members/components/MemberList';
import { removeTeamMember } from '@/client';

vi.mock('@/client', () => ({
  removeTeamMember: vi.fn(),
}));

vi.mock('@/pages/team-members/components/LinkMemberPanel', () => ({
  default: ({ onLinked }: { onLinked: () => void }) => (
    <div data-testid="link-panel">
      <button onClick={onLinked}>fake-link</button>
    </div>
  ),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('MemberList', () => {
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when there are no members', () => {
    render(
      <MemberList teamMembers={[]} selectedTeam="1" userToken="tok" onSuccess={onSuccess} />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByText('Esta equipa não tem membros ainda.')).toBeInTheDocument();
  });

  it('renders a list of members with captain badge', () => {
    render(
      <MemberList
        teamMembers={[
          { id: 1, name: 'Alice', email: 'a@x.com', is_captain: true },
          { id: 2, name: 'Bob', is_captain: false },
        ]}
        selectedTeam="1"
        userToken="tok"
        onSuccess={onSuccess}
      />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Capitão')).toBeInTheDocument();
  });

  it('removes a member on click', async () => {
    vi.mocked(removeTeamMember).mockResolvedValue({ data: {} } as never);
    const user = userEvent.setup();
    render(
      <MemberList
        teamMembers={[{ id: 1, name: 'Alice', is_captain: false }]}
        selectedTeam="1"
        userToken="tok"
        onSuccess={onSuccess}
      />,
      { wrapper: createWrapper() },
    );

    await user.click(screen.getByRole('button', { name: /Remover/i }));

    await waitFor(() => {
      expect(removeTeamMember).toHaveBeenCalledWith({ path: { team_id: 1, user_id: 1 } });
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('toggles the link panel open and closed', async () => {
    const user = userEvent.setup();
    render(
      <MemberList
        teamMembers={[{ id: 1, name: 'Alice', is_captain: false }]}
        selectedTeam="1"
        userToken="tok"
        onSuccess={onSuccess}
      />,
      { wrapper: createWrapper() },
    );

    await user.click(screen.getByRole('button', { name: /Ligar conta NEI/i }));
    expect(screen.getByTestId('link-panel')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Cancelar/i }));
    expect(screen.queryByTestId('link-panel')).not.toBeInTheDocument();
  });

  it('shows the "linked" badge instead of a link button when already linked', () => {
    render(
      <MemberList
        teamMembers={[{ id: 1, name: 'Alice', is_captain: false, is_linked: true }]}
        selectedTeam="1"
        userToken="tok"
        onSuccess={onSuccess}
      />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByText('Conta NEI associada')).toBeInTheDocument();
  });

  it('calls onSuccess and closes panel when link succeeds', async () => {
    const user = userEvent.setup();
    render(
      <MemberList
        teamMembers={[{ id: 1, name: 'Alice', is_captain: false }]}
        selectedTeam="1"
        userToken="tok"
        onSuccess={onSuccess}
      />,
      { wrapper: createWrapper() },
    );

    await user.click(screen.getByRole('button', { name: /Ligar conta NEI/i }));
    await user.click(screen.getByText('fake-link'));

    expect(onSuccess).toHaveBeenCalled();
    expect(screen.queryByTestId('link-panel')).not.toBeInTheDocument();
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import MemberForm from '@/pages/team-members/components/MemberForm';
import { addTeamMember } from '@/client';

const { mockToast } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/client', () => ({
  addTeamMember: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useAppToast: () => mockToast,
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('MemberForm', () => {
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('renders the form fields', () => {
    render(<MemberForm selectedTeam="1" userToken="tok" onSuccess={onSuccess} />, {
      wrapper: createWrapper(),
    });
    expect(screen.getByLabelText('Nome')).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Adicionar Membro/i })).toBeInTheDocument();
  });

  it('shows a validation error when name is empty', async () => {
    const user = userEvent.setup();
    render(<MemberForm selectedTeam="1" userToken="tok" onSuccess={onSuccess} />, {
      wrapper: createWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /Adicionar Membro/i }));

    await waitFor(() => {
      expect(screen.getByText('Nome é obrigatório')).toBeInTheDocument();
    });
    expect(addTeamMember).not.toHaveBeenCalled();
  });

  it('submits valid data and calls onSuccess', async () => {
    vi.mocked(addTeamMember).mockResolvedValue({ data: {} } as never);
    const user = userEvent.setup();
    render(<MemberForm selectedTeam="1" userToken="tok" onSuccess={onSuccess} />, {
      wrapper: createWrapper(),
    });

    await user.type(screen.getByLabelText('Nome'), 'Alice');
    await user.click(screen.getByRole('button', { name: /Adicionar Membro/i }));

    await waitFor(() => {
      expect(addTeamMember).toHaveBeenCalledWith({
        path: { team_id: 1 },
        body: { name: 'Alice', email: null, is_captain: false },
      });
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockToast.success).toHaveBeenCalled();
  });

  it('shows an error toast when submission fails', async () => {
    vi.mocked(addTeamMember).mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    render(<MemberForm selectedTeam="1" userToken="tok" onSuccess={onSuccess} />, {
      wrapper: createWrapper(),
    });

    await user.type(screen.getByLabelText('Nome'), 'Alice');
    await user.click(screen.getByRole('button', { name: /Adicionar Membro/i }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalled();
    });
  });

  it('restores a half-typed name after the form is unmounted and remounted', async () => {
    const user = userEvent.setup();
    const wrapper = createWrapper();
    const { unmount } = render(
      <MemberForm selectedTeam="1" userToken="tok" onSuccess={onSuccess} />,
      { wrapper },
    );

    await user.type(screen.getByLabelText('Nome'), 'Alic');
    await waitFor(() =>
      expect(sessionStorage.getItem('rally.memberDraft.1')).toContain('Alic'),
    );
    unmount();

    render(<MemberForm selectedTeam="1" userToken="tok" onSuccess={onSuccess} />, { wrapper });

    expect(screen.getByLabelText('Nome')).toHaveValue('Alic');
  });

  it('keeps drafts separate per team', async () => {
    const user = userEvent.setup();
    const wrapper = createWrapper();
    const { rerender } = render(
      <MemberForm selectedTeam="1" userToken="tok" onSuccess={onSuccess} />,
      { wrapper },
    );

    await user.type(screen.getByLabelText('Nome'), 'Alice');

    rerender(<MemberForm selectedTeam="2" userToken="tok" onSuccess={onSuccess} />);
    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveValue(''));

    rerender(<MemberForm selectedTeam="1" userToken="tok" onSuccess={onSuccess} />);
    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveValue('Alice'));
  });

  it('drops the draft once the member is added', async () => {
    vi.mocked(addTeamMember).mockResolvedValue({ data: {} } as never);
    const user = userEvent.setup();
    render(<MemberForm selectedTeam="1" userToken="tok" onSuccess={onSuccess} />, {
      wrapper: createWrapper(),
    });

    await user.type(screen.getByLabelText('Nome'), 'Alice');
    await user.click(screen.getByRole('button', { name: /Adicionar Membro/i }));

    await waitFor(() => expect(sessionStorage.getItem('rally.memberDraft.1')).toBeNull());
  });
});

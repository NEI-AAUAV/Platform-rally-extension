import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import LinkMemberPanel from '@/pages/team-members/components/LinkMemberPanel';
import { TeamMemberLinkService } from '@/services/TeamMemberLinkService';

vi.mock('@/services/TeamMemberLinkService', () => ({
  TeamMemberLinkService: {
    searchOidcUsers: vi.fn(),
    linkMember: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('LinkMemberPanel', () => {
  const onLinked = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the search form', () => {
    render(
      <LinkMemberPanel teamId={1} placeholderUserId={2} onLinked={onLinked} />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByPlaceholderText(/Procurar conta NEI/i)).toBeInTheDocument();
  });

  it('shows search results and links a member on click', async () => {
    vi.mocked(TeamMemberLinkService.searchOidcUsers).mockResolvedValue([
      { name: 'Carlos', email: 'carlos@x.com', authentik_sub: 'sub-1' },
    ]);
    vi.mocked(TeamMemberLinkService.linkMember).mockResolvedValue({
      id: 2,
      name: 'Carlos',
      is_captain: false,
    });

    const user = userEvent.setup();
    render(
      <LinkMemberPanel teamId={1} placeholderUserId={2} onLinked={onLinked} />,
      { wrapper: createWrapper() },
    );

    await user.type(screen.getByPlaceholderText(/Procurar conta NEI/i), 'Carlos');
    await user.click(screen.getByRole('button', { name: '' }));

    await waitFor(() => {
      expect(screen.getByText('Carlos')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Carlos').closest('button')!);

    await waitFor(() => {
      expect(TeamMemberLinkService.linkMember).toHaveBeenCalledWith(1, 2, {
        authentik_sub: 'sub-1',
        name: 'Carlos',
        email: 'carlos@x.com',
      });
      expect(onLinked).toHaveBeenCalled();
    });
  });

  it('shows "no accounts found" message on empty results', async () => {
    vi.mocked(TeamMemberLinkService.searchOidcUsers).mockResolvedValue([]);

    const user = userEvent.setup();
    render(
      <LinkMemberPanel teamId={1} placeholderUserId={2} onLinked={onLinked} />,
      { wrapper: createWrapper() },
    );

    await user.type(screen.getByPlaceholderText(/Procurar conta NEI/i), 'zz');
    await user.click(screen.getByRole('button', { name: '' }));

    await waitFor(() => {
      expect(screen.getByText('Nenhuma conta encontrada.')).toBeInTheDocument();
    });
  });

  it('shows an error message when search fails', async () => {
    vi.mocked(TeamMemberLinkService.searchOidcUsers).mockRejectedValue(
      new Error('search failed'),
    );

    const user = userEvent.setup();
    render(
      <LinkMemberPanel teamId={1} placeholderUserId={2} onLinked={onLinked} />,
      { wrapper: createWrapper() },
    );

    await user.type(screen.getByPlaceholderText(/Procurar conta NEI/i), 'zz');
    await user.click(screen.getByRole('button', { name: '' }));

    await waitFor(() => {
      expect(screen.getByText('search failed')).toBeInTheDocument();
    });
  });

  it('shows the server-provided detail message when the error has a body.detail', async () => {
    vi.mocked(TeamMemberLinkService.searchOidcUsers).mockRejectedValue({
      body: { detail: 'Conta já associada a outra equipa.' },
    });

    const user = userEvent.setup();
    render(
      <LinkMemberPanel teamId={1} placeholderUserId={2} onLinked={onLinked} />,
      { wrapper: createWrapper() },
    );

    await user.type(screen.getByPlaceholderText(/Procurar conta NEI/i), 'zz');
    await user.click(screen.getByRole('button', { name: '' }));

    await waitFor(() => {
      expect(screen.getByText('Conta já associada a outra equipa.')).toBeInTheDocument();
    });
  });

  it('falls back to a generic message for a non-Error, non-body rejection', async () => {
    vi.mocked(TeamMemberLinkService.searchOidcUsers).mockRejectedValue('oops');

    const user = userEvent.setup();
    render(
      <LinkMemberPanel teamId={1} placeholderUserId={2} onLinked={onLinked} />,
      { wrapper: createWrapper() },
    );

    await user.type(screen.getByPlaceholderText(/Procurar conta NEI/i), 'zz');
    await user.click(screen.getByRole('button', { name: '' }));

    await waitFor(() => {
      expect(screen.getByText('Não foi possível ligar a conta.')).toBeInTheDocument();
    });
  });

  it('shows the server-provided detail message when linking fails with body.detail', async () => {
    vi.mocked(TeamMemberLinkService.searchOidcUsers).mockResolvedValue([
      { name: 'Carlos', email: 'carlos@x.com', authentik_sub: 'sub-1' },
    ]);
    vi.mocked(TeamMemberLinkService.linkMember).mockRejectedValue({
      body: { detail: 'Placeholder já foi ligado.' },
    });

    const user = userEvent.setup();
    render(
      <LinkMemberPanel teamId={1} placeholderUserId={2} onLinked={onLinked} />,
      { wrapper: createWrapper() },
    );

    await user.type(screen.getByPlaceholderText(/Procurar conta NEI/i), 'Carlos');
    await user.click(screen.getByRole('button', { name: '' }));

    await waitFor(() => expect(screen.getByText('Carlos')).toBeInTheDocument());
    await user.click(screen.getByText('Carlos').closest('button')!);

    await waitFor(() => {
      expect(screen.getByText('Placeholder já foi ligado.')).toBeInTheDocument();
    });
  });
});

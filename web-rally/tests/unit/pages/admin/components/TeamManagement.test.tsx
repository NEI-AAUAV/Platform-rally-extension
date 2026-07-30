import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TeamManagement from '@/pages/admin/components/teams/TeamManagement';

const {
  mockGetTeams,
  mockGetTeamById,
  mockCreateTeam,
  mockUpdateTeam,
  mockDeleteTeam,
  mockNavigate,
  mockToastSuccess,
  mockToastError,
} = vi.hoisted(() => ({
  mockGetTeams: vi.fn(),
  mockGetTeamById: vi.fn(),
  mockCreateTeam: vi.fn(),
  mockUpdateTeam: vi.fn(),
  mockDeleteTeam: vi.fn(),
  mockNavigate: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('@/client', () => ({
  getTeams: (...args: unknown[]) => mockGetTeams(...args),
  getTeamById: (...args: unknown[]) => mockGetTeamById(...args),
  createTeam: (...args: unknown[]) => mockCreateTeam(...args),
  updateTeam: (...args: unknown[]) => mockUpdateTeam(...args),
  deleteTeam: (...args: unknown[]) => mockDeleteTeam(...args),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/hooks/use-toast', () => ({
  useAppToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

vi.mock('@/components/qr/QRCodeDisplay', () => ({
  default: ({ accessCode }: { accessCode: string }) => (
    <div data-testid="qr-code-display">{accessCode}</div>
  ),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const teamListItem = (overrides: Partial<any> = {}) => ({
  id: 1,
  name: 'Team Alpha',
  total: 100,
  num_members: 3,
  ...overrides,
});

describe('TeamManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockGetTeams.mockResolvedValue({ data: [] });
    mockGetTeamById.mockResolvedValue({ data: null });
    mockCreateTeam.mockResolvedValue({ data: { id: 1, name: 'New Team', access_code: 'ABC123' } });
    mockUpdateTeam.mockResolvedValue({ data: null });
    mockDeleteTeam.mockResolvedValue({ data: null });
  });

  it('renders create form and empty state when no teams', async () => {
    renderWithClient(<TeamManagement />);
    expect(screen.getByText('Criar Nova Equipa')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Nenhuma equipa criada ainda')).toBeInTheDocument();
    });
  });

  it('renders a list of existing teams', async () => {
    mockGetTeams.mockResolvedValue({ data: [teamListItem()] });
    renderWithClient(<TeamManagement />);
    expect(await screen.findByText('Team Alpha')).toBeInTheDocument();
    expect(screen.getByText('Pontuação: 100 • Membros: 3')).toBeInTheDocument();
  });

  it('shows validation error when submitting empty name', async () => {
    renderWithClient(<TeamManagement />);
    fireEvent.click(screen.getByText('Criar Equipa'));
    await waitFor(() => {
      expect(screen.getByText('Nome da equipa é obrigatório')).toBeInTheDocument();
    });
    expect(mockCreateTeam).not.toHaveBeenCalled();
  });

  it('creates a team and shows QR modal on success', async () => {
    const user = userEvent.setup();
    renderWithClient(<TeamManagement />);
    await user.type(screen.getByPlaceholderText('Ex: Equipa Alpha'), 'New Team');
    fireEvent.click(screen.getByText('Criar Equipa'));
    await waitFor(() => expect(mockCreateTeam).toHaveBeenCalled());
    expect(await screen.findByText('Equipa Criada!')).toBeInTheDocument();
    expect(mockToastSuccess).toHaveBeenCalledWith('Equipa criada com sucesso!');
    expect(screen.getByTestId('qr-code-display')).toHaveTextContent('ABC123');
  });

  it('shows error toast when team creation fails', async () => {
    mockCreateTeam.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    renderWithClient(<TeamManagement />);
    await user.type(screen.getByPlaceholderText('Ex: Equipa Alpha'), 'Failing Team');
    fireEvent.click(screen.getByText('Criar Equipa'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it('closes the QR modal', async () => {
    const user = userEvent.setup();
    renderWithClient(<TeamManagement />);
    await user.type(screen.getByPlaceholderText('Ex: Equipa Alpha'), 'New Team');
    fireEvent.click(screen.getByText('Criar Equipa'));
    expect(await screen.findByText('Equipa Criada!')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Fechar'));
    expect(screen.queryByText('Equipa Criada!')).not.toBeInTheDocument();
  });

  it('enters edit mode when clicking edit and updates the team', async () => {
    mockGetTeams.mockResolvedValue({ data: [teamListItem()] });
    const user = userEvent.setup();
    renderWithClient(<TeamManagement />);
    expect(await screen.findByText('Team Alpha')).toBeInTheDocument();

    const teamRow = screen.getByText('Team Alpha').closest('li')!;
    const rowButtons = teamRow.querySelectorAll('button');
    fireEvent.click(rowButtons[2]!); // edit button (QR, members, edit, delete)

    expect(screen.getByText('Editar Equipa')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Team Alpha')).toBeInTheDocument();

    await user.clear(screen.getByDisplayValue('Team Alpha'));
    await user.type(screen.getByPlaceholderText('Ex: Equipa Alpha'), 'Updated Team');
    fireEvent.click(screen.getByText('Atualizar Equipa'));

    await waitFor(() => expect(mockUpdateTeam).toHaveBeenCalledWith({
      path: { id: 1 },
      body: { name: 'Updated Team' },
    }));
    expect(mockToastSuccess).toHaveBeenCalledWith('Equipa atualizada com sucesso!');
  });

  it('cancels edit mode', async () => {
    mockGetTeams.mockResolvedValue({ data: [teamListItem()] });
    renderWithClient(<TeamManagement />);
    expect(await screen.findByText('Team Alpha')).toBeInTheDocument();

    const teamRow = screen.getByText('Team Alpha').closest('li')!;
    const rowButtons = teamRow.querySelectorAll('button');
    fireEvent.click(rowButtons[2]!);
    expect(screen.getByText('Editar Equipa')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancelar'));
    expect(screen.getByText('Criar Nova Equipa')).toBeInTheDocument();
  });

  it('shows error toast when update fails', async () => {
    mockGetTeams.mockResolvedValue({ data: [teamListItem()] });
    mockUpdateTeam.mockRejectedValue(new Error('boom'));
    renderWithClient(<TeamManagement />);
    expect(await screen.findByText('Team Alpha')).toBeInTheDocument();

    const teamRow = screen.getByText('Team Alpha').closest('li')!;
    const rowButtons = teamRow.querySelectorAll('button');
    fireEvent.click(rowButtons[2]!);
    fireEvent.click(screen.getByText('Atualizar Equipa'));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it('deletes a team after confirm', async () => {
    mockGetTeams.mockResolvedValue({ data: [teamListItem()] });
    renderWithClient(<TeamManagement />);
    expect(await screen.findByText('Team Alpha')).toBeInTheDocument();

    const teamRow = screen.getByText('Team Alpha').closest('li')!;
    const rowButtons = teamRow.querySelectorAll('button');
    fireEvent.click(rowButtons[3]!);

    await waitFor(() => expect(mockDeleteTeam).toHaveBeenCalledWith({ path: { id: 1 } }));
    expect(mockToastSuccess).toHaveBeenCalledWith('Equipa deletada com sucesso!');
  });

  it('does not delete a team when confirm is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockGetTeams.mockResolvedValue({ data: [teamListItem()] });
    renderWithClient(<TeamManagement />);
    expect(await screen.findByText('Team Alpha')).toBeInTheDocument();

    const teamRow = screen.getByText('Team Alpha').closest('li')!;
    const rowButtons = teamRow.querySelectorAll('button');
    fireEvent.click(rowButtons[3]!);
    expect(mockDeleteTeam).not.toHaveBeenCalled();
  });

  it('shows error toast when delete fails', async () => {
    mockGetTeams.mockResolvedValue({ data: [teamListItem()] });
    mockDeleteTeam.mockRejectedValue(new Error('boom'));
    renderWithClient(<TeamManagement />);
    expect(await screen.findByText('Team Alpha')).toBeInTheDocument();

    const teamRow = screen.getByText('Team Alpha').closest('li')!;
    const rowButtons = teamRow.querySelectorAll('button');
    fireEvent.click(rowButtons[3]!);

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it('navigates to team-members page when clicking members button', async () => {
    mockGetTeams.mockResolvedValue({ data: [teamListItem()] });
    renderWithClient(<TeamManagement />);
    expect(await screen.findByText('Team Alpha')).toBeInTheDocument();

    const teamRow = screen.getByText('Team Alpha').closest('li')!;
    const rowButtons = teamRow.querySelectorAll('button');
    fireEvent.click(rowButtons[1]!);

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/team-members' });
  });

  it('opens QR code modal for an existing team', async () => {
    mockGetTeams.mockResolvedValue({ data: [teamListItem()] });
    mockGetTeamById.mockResolvedValue({
      data: { id: 1, name: 'Team Alpha', access_code: 'XYZ789' },
    });
    renderWithClient(<TeamManagement />);
    expect(await screen.findByText('Team Alpha')).toBeInTheDocument();

    const teamRow = screen.getByText('Team Alpha').closest('li')!;
    const rowButtons = teamRow.querySelectorAll('button');
    fireEvent.click(rowButtons[0]!);

    expect(await screen.findByText('Código QR da Equipa')).toBeInTheDocument();
    expect(screen.getByTestId('qr-code-display')).toHaveTextContent('XYZ789');
  });
});

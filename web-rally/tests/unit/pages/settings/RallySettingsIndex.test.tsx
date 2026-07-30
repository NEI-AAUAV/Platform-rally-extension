import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RallySettings from '@/pages/settings/index';

const {
  mockUseUser,
  mockUseFallbackNavigation,
  mockViewRallySettings,
  mockUpdateRallySettings,
  mockToastSuccess,
  mockToastError,
} = vi.hoisted(() => ({
  mockUseUser: vi.fn(),
  mockUseFallbackNavigation: vi.fn(),
  mockViewRallySettings: vi.fn(),
  mockUpdateRallySettings: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('@/hooks/useUser', () => ({
  default: () => mockUseUser(),
}));

vi.mock('@/hooks/useFallbackNavigation', () => ({
  default: () => mockUseFallbackNavigation(),
}));

vi.mock('@/client', () => ({
  viewRallySettings: (...args: unknown[]) => mockViewRallySettings(...args),
  updateRallySettings: (...args: unknown[]) => mockUpdateRallySettings(...args),
}));

vi.mock('@tanstack/react-router', () => ({
  Navigate: ({ to }: { to: string }) => <div>Navigate to {to}</div>,
}));

vi.mock('@/hooks/use-toast', () => ({
  useAppToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

vi.mock('@/pages/settings/components', () => ({
  DisplaySettings: () => <div>DisplaySettings</div>,
  TeamSettings: () => <div>TeamSettings</div>,
  RallyTimingSettings: () => <div>RallyTimingSettings</div>,
  ScoringSettings: () => <div>ScoringSettings</div>,
  HomeLayoutSettings: () => <div>HomeLayoutSettings</div>,
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const baseSettings = {
  max_teams: 16,
  max_members_per_team: 10,
  enable_versus: false,
  rally_start_time: null,
  rally_end_time: null,
  penalty_per_puke: -5,
  penalty_per_not_drinking: -2,
  bonus_per_extra_shot: 1,
  max_extra_shots_per_member: 5,
  checkpoint_order_matters: true,
  enable_staff_scoring: true,
  show_live_leaderboard: true,
  show_team_details: true,
  show_checkpoint_map: true,
  rally_theme: 'bloody',
  public_access_enabled: false,
  home_layout: [],
  ticker_items: [],
};

describe('RallySettings index page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFallbackNavigation.mockReturnValue('/');
    mockViewRallySettings.mockResolvedValue({ data: baseSettings });
  });

  it('shows loading state while user data is loading', () => {
    mockUseUser.mockReturnValue({ isLoading: true, isRallyAdmin: false });
    renderWithClient(<RallySettings />);
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('redirects non-admins when not embedded', () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: false });
    renderWithClient(<RallySettings />);
    expect(screen.getByText('Navigate to /')).toBeInTheDocument();
  });

  it('does not redirect non-admins when embedded', async () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: false });
    renderWithClient(<RallySettings embedded />);
    await waitFor(() => {
      expect(screen.getByText('DisplaySettings')).toBeInTheDocument();
    });
  });

  it('shows loading state while settings are loading', () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true });
    mockViewRallySettings.mockReturnValue(new Promise(() => {}));
    renderWithClient(<RallySettings />);
    expect(screen.getByText('Carregando configurações...')).toBeInTheDocument();
  });

  it('shows error state and retries on button click', async () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true });
    mockViewRallySettings.mockRejectedValue(new Error('boom'));
    renderWithClient(<RallySettings />);
    expect(
      await screen.findByText('Erro ao Carregar Configurações', {}, { timeout: 5000 }),
    ).toBeInTheDocument();

    mockViewRallySettings.mockResolvedValue({ data: baseSettings });
    await userEvent.click(screen.getByText('Tentar Novamente'));
    await waitFor(
      () => {
        expect(mockViewRallySettings.mock.calls.length).toBeGreaterThan(0);
      },
      { timeout: 5000 },
    );
  });

  it('renders settings sections and toggles edit mode', async () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true });
    renderWithClient(<RallySettings />);

    expect(await screen.findByText('DisplaySettings')).toBeInTheDocument();
    expect(screen.getByText('TeamSettings')).toBeInTheDocument();
    expect(screen.getByText('RallyTimingSettings')).toBeInTheDocument();
    expect(screen.getByText('ScoringSettings')).toBeInTheDocument();
    expect(screen.getByText('HomeLayoutSettings')).toBeInTheDocument();

    expect(screen.getByText('Configurações')).toBeInTheDocument();

    const editButton = screen.getByText('Editar Configurações');
    await userEvent.click(editButton);

    expect(
      screen.getByText('Modo de edição ativo — clique em "Guardar" para aplicar as alterações'),
    ).toBeInTheDocument();
    expect(screen.getByText('Guardar')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Cancelar'));
    expect(screen.queryByText('Guardar')).not.toBeInTheDocument();
  });

  it('hides page header when embedded', async () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true });
    renderWithClient(<RallySettings embedded />);
    await screen.findByText('DisplaySettings');
    expect(screen.queryByText('Configurações')).not.toBeInTheDocument();
  });

  it('submits updated settings successfully', async () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true });
    mockUpdateRallySettings.mockResolvedValue({ data: baseSettings });
    renderWithClient(<RallySettings />);

    await screen.findByText('DisplaySettings');
    await userEvent.click(screen.getByText('Editar Configurações'));
    await userEvent.click(screen.getByText('Guardar'));

    await waitFor(() => {
      expect(mockUpdateRallySettings).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('Configurações atualizadas com sucesso!');
    });
  });

  it('shows error toast when update fails', async () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true });
    mockUpdateRallySettings.mockRejectedValue(new Error('nope'));
    renderWithClient(<RallySettings />);

    await screen.findByText('DisplaySettings');
    await userEvent.click(screen.getByText('Editar Configurações'));
    await userEvent.click(screen.getByText('Guardar'));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
    });
  });
});

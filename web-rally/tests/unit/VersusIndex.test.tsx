import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Versus from '@/pages/versus/index';

const {
  mockUseUser,
  mockUseRallySettings,
  mockUseFallbackNavigation,
  mockUseQuery,
  mockGetTeams,
  mockListVersusGroups,
} = vi.hoisted(() => ({
  mockUseUser: vi.fn(),
  mockUseRallySettings: vi.fn(),
  mockUseFallbackNavigation: vi.fn(),
  mockUseQuery: vi.fn(),
  mockGetTeams: vi.fn(),
  mockListVersusGroups: vi.fn(),
}));

vi.mock('@/hooks/useUser', () => ({
  default: () => mockUseUser(),
}));

vi.mock('@/hooks/useRallySettings', () => ({
  default: () => mockUseRallySettings(),
}));

vi.mock('@/hooks/useFallbackNavigation', () => ({
  default: () => mockUseFallbackNavigation(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock('@tanstack/react-router', () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
}));

vi.mock('@/components/shared', () => ({
  LoadingState: ({ message }: { message: string }) => <div>{message}</div>,
  FeatureDisabledAlert: ({ featureName }: { featureName: string }) => (
    <div>Disabled: {featureName}</div>
  ),
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock('@/pages/versus/components', () => ({
  VersusPairForm: ({ onSuccess }: { onSuccess: () => void }) => (
    <button data-testid="versus-pair-form" onClick={onSuccess}>
      form
    </button>
  ),
  VersusGroupList: () => <div data-testid="versus-group-list" />,
}));

vi.mock('@/client', () => ({
  getTeams: mockGetTeams,
  listVersusGroups: mockListVersusGroups,
}));

describe('Versus index page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFallbackNavigation.mockReturnValue('/scoreboard');
    mockUseQuery.mockReturnValue({ data: [], refetch: vi.fn() });
  });

  it('shows loading state', () => {
    mockUseUser.mockReturnValue({ isLoading: true, isRallyAdmin: false });
    mockUseRallySettings.mockReturnValue({ settings: {} });
    render(<Versus />);
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('redirects non-admins when not embedded', () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: false });
    mockUseRallySettings.mockReturnValue({ settings: { enable_versus: true } });
    render(<Versus />);
    expect(screen.getByTestId('navigate')).toHaveTextContent('/scoreboard');
  });

  it('shows feature-disabled alert when versus disabled', () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true });
    mockUseRallySettings.mockReturnValue({ settings: { enable_versus: false } });
    render(<Versus />);
    expect(screen.getByText(/Disabled: modo versus/)).toBeInTheDocument();
  });

  it('renders versus page content for admins', () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true });
    mockUseRallySettings.mockReturnValue({ settings: { enable_versus: true } });
    render(<Versus />);
    expect(screen.getByText('Modo Versus')).toBeInTheDocument();
    expect(screen.getByTestId('versus-pair-form')).toBeInTheDocument();
    expect(screen.getByTestId('versus-group-list')).toBeInTheDocument();
  });

  it('does not render page header when embedded', () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true });
    mockUseRallySettings.mockReturnValue({ settings: { enable_versus: true } });
    render(<Versus embedded />);
    expect(screen.queryByText('Modo Versus')).not.toBeInTheDocument();
  });

  it('refetches teams and versus groups on child success', () => {
    const refetchTeams = vi.fn();
    const refetchVersusGroups = vi.fn();
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true });
    mockUseRallySettings.mockReturnValue({ settings: { enable_versus: true } });
    mockUseQuery
      .mockReturnValueOnce({ data: [], refetch: refetchTeams })
      .mockReturnValueOnce({ data: { groups: [] }, refetch: refetchVersusGroups });

    render(<Versus />);
    fireEvent.click(screen.getByTestId('versus-pair-form'));

    expect(refetchVersusGroups).toHaveBeenCalled();
    expect(refetchTeams).toHaveBeenCalled();
  });

  it('executes teams and versus groups query functions', async () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true });
    mockUseRallySettings.mockReturnValue({ settings: { enable_versus: true } });
    mockGetTeams.mockResolvedValue({ data: [{ id: 1, name: 'Team A' }] });
    mockListVersusGroups.mockResolvedValue({ data: { groups: [] } });

    render(<Versus />);

    const teamsCallArgs = mockUseQuery.mock.calls[0]![0]!;
    const versusCallArgs = mockUseQuery.mock.calls[1]![0]!;

    expect(teamsCallArgs.queryKey).toEqual(['teams']);
    await expect(teamsCallArgs.queryFn()).resolves.toEqual([{ id: 1, name: 'Team A' }]);
    expect(mockGetTeams).toHaveBeenCalled();

    expect(versusCallArgs.queryKey).toEqual(['versusGroups']);
    expect(versusCallArgs.enabled).toBe(true);
    await expect(versusCallArgs.queryFn()).resolves.toEqual({ groups: [] });
    expect(mockListVersusGroups).toHaveBeenCalled();
  });
});

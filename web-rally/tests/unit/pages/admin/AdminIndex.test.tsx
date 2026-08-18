import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Admin from '@/pages/admin/index';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const { mockUseUser, mockGetCheckpoints, mockUseSearch, mockNavigate } = vi.hoisted(() => ({
  mockUseUser: vi.fn(),
  mockGetCheckpoints: vi.fn(),
  mockUseSearch: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock('@/hooks/useUser', () => ({
  default: () => mockUseUser(),
}));

vi.mock('@/hooks/useFallbackNavigation', () => ({
  default: () => '/scoreboard',
}));

vi.mock('@tanstack/react-router', () => ({
  Navigate: ({ to }: { to: string }) => <div>Navigate to {to}</div>,
}));

vi.mock('@/router/routes', () => ({
  adminRoute: {
    useSearch: () => mockUseSearch(),
    useNavigate: () => mockNavigate,
  },
}));

vi.mock('@/client', () => ({
  getCheckpoints: (...args: unknown[]) => mockGetCheckpoints(...args),
}));

vi.mock('@/components/shared', () => ({
  PageHeader: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  ),
  LoadingState: ({ message }: { message: string }) => <div>{message}</div>,
}));

vi.mock('@/pages/admin/components', () => ({
  TeamManagement: () => <div data-testid="tab-teams">TeamManagement</div>,
  CheckpointManagement: () => <div data-testid="tab-checkpoints">CheckpointManagement</div>,
  ActivityManagement: () => <div data-testid="tab-activities">ActivityManagement</div>,
  BrandingSettings: () => <div data-testid="tab-branding">BrandingSettings</div>,
  EventsManagement: () => <div data-testid="tab-events">EventsManagement</div>,
  DeferredJudgingTab: () => <div data-testid="tab-judging">DeferredJudgingTab</div>,
  BadgeAdminTab: () => <div data-testid="tab-badges">BadgeAdminTab</div>,
  DynamicScoringTab: () => <div data-testid="tab-scoring">DynamicScoringTab</div>,
}));

vi.mock('@/pages/admin/components/dashboard/LiveDashboard', () => ({
  default: () => <div data-testid="tab-dashboard">LiveDashboard</div>,
}));

vi.mock('@/pages/settings', () => ({
  default: () => <div data-testid="tab-settings">RallySettings</div>,
}));
vi.mock('@/pages/assignment', () => ({
  default: () => <div data-testid="tab-assignment">Assignment</div>,
}));
vi.mock('@/pages/guide-assignment', () => ({
  default: () => <div data-testid="tab-guide-assignment">GuideAssignment</div>,
}));
vi.mock('@/pages/versus', () => ({
  default: () => <div data-testid="tab-versus">Versus</div>,
}));
vi.mock('@/pages/team-members', () => ({
  default: () => <div data-testid="tab-members">TeamMembers</div>,
}));
vi.mock('@/pages/staff-evaluation/manager-only', () => ({
  default: () => <div data-testid="tab-evaluation">ManagerEvaluationPage</div>,
}));

describe('Admin index page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCheckpoints.mockResolvedValue({ data: [] });
    mockUseSearch.mockReturnValue({ tab: 'dashboard' });
  });

  it('shows a loading state while user session loads', () => {
    mockUseUser.mockReturnValue({ isLoading: true, isRallyAdmin: false, userStore: {} });
    renderWithClient(<Admin />);
    expect(screen.getByText('A carregar...')).toBeInTheDocument();
  });

  it('redirects non-admin users to the fallback path', () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: false, userStore: {} });
    renderWithClient(<Admin />);
    expect(screen.getByText('Navigate to /scoreboard')).toBeInTheDocument();
  });

  it('renders the page header and dashboard tab by default for admins', () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true, userStore: {} });
    renderWithClient(<Admin />);

    expect(screen.getByTestId('page-header')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Administração' })).toBeInTheDocument();
    expect(screen.getByTestId('tab-dashboard')).toBeInTheDocument();
  });

  it('renders all navigation tab buttons', () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true, userStore: {} });
    renderWithClient(<Admin />);

    const navs = screen.getAllByRole('navigation', { name: 'Secções de administração' });
    const nav = navs[navs.length - 1];
    expect(nav).toBeInTheDocument();
    [
      'Dashboard',
      'Equipas',
      'Postos',
      'Atividades',
      'Membros',
      'Atribuições',
      'Guias',
      'Avaliação',
      'Versus',
      'Julgamento',
      'Crachás',
      'Pontuação',
      'Identidade',
      'Edições',
      'Configurações',
    ].forEach((label) => {
      expect(within(nav).getByRole('button', { name: label })).toBeInTheDocument();
    });
  });

  it('navigates to a new tab when a nav button is clicked', () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true, userStore: {} });
    renderWithClient(<Admin />);

    fireEvent.click(screen.getByRole('button', { name: 'Equipas' }));
    expect(mockNavigate).toHaveBeenCalledWith({ search: { tab: 'teams' }, replace: true });
  });

  it('renders the activities tab content with fetched checkpoints', async () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true, userStore: {} });
    mockUseSearch.mockReturnValue({ tab: 'activities' });
    mockGetCheckpoints.mockResolvedValue({ data: [{ id: 1, name: 'CP1' }] });
    renderWithClient(<Admin />);

    expect(await screen.findByTestId('tab-activities')).toBeInTheDocument();
  });

  it.each([
    ['teams', 'tab-teams'],
    ['checkpoints', 'tab-checkpoints'],
    ['branding', 'tab-branding'],
    ['events', 'tab-events'],
    ['members', 'tab-members'],
    ['assignment', 'tab-assignment'],
    ['guide-assignment', 'tab-guide-assignment'],
    ['versus', 'tab-versus'],
    ['evaluation', 'tab-evaluation'],
    ['judging', 'tab-judging'],
    ['badges', 'tab-badges'],
    ['scoring', 'tab-scoring'],
    ['settings', 'tab-settings'],
  ])('renders the %s tab content', (tab, testId) => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true, userStore: {} });
    mockUseSearch.mockReturnValue({ tab });
    renderWithClient(<Admin />);
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });

  it('defaults to the dashboard tab when no tab is provided in search', () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true, userStore: {} });
    mockUseSearch.mockReturnValue({});
    renderWithClient(<Admin />);
    expect(screen.getByTestId('tab-dashboard')).toBeInTheDocument();
  });

  it('marks the active tab button with aria-current', () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true, userStore: {} });
    mockUseSearch.mockReturnValue({ tab: 'branding' });
    renderWithClient(<Admin />);

    const nav = screen.getAllByRole('navigation', { name: 'Secções de administração' })[0];
    expect(within(nav).getByRole('button', { name: 'Identidade' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('button', { name: 'Equipas' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});

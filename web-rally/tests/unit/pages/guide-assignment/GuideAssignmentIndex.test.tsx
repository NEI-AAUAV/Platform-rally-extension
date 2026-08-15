import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GuideAssignment from '@/pages/guide-assignment/index';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const { mockUseUser, mockGetTeams, mockGetGuideAssignments, mockUpdateGuideTeamAssignment } =
  vi.hoisted(() => ({
    mockUseUser: vi.fn(),
    mockGetTeams: vi.fn(),
    mockGetGuideAssignments: vi.fn(),
    mockUpdateGuideTeamAssignment: vi.fn(),
  }));

vi.mock('@/hooks/useUser', () => ({
  default: () => mockUseUser(),
}));

vi.mock('@/hooks/useFallbackNavigation', () => ({
  default: () => '/',
}));

vi.mock('@tanstack/react-router', () => ({
  Navigate: ({ to }: { to: string }) => <div>Navigate to {to}</div>,
}));

vi.mock('@/components/shared', () => ({
  LoadingState: ({ message }: { message: string }) => <div>{message}</div>,
  PageHeader: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('@/client', () => ({
  getTeams: (...args: unknown[]) => mockGetTeams(...args),
  getGuideAssignments: (...args: unknown[]) => mockGetGuideAssignments(...args),
  updateGuideTeamAssignment: (...args: unknown[]) => mockUpdateGuideTeamAssignment(...args),
}));

vi.mock('@/pages/assignment/components', async () => {
  const actual = await vi.importActual<typeof import('@/pages/assignment/components')>(
    '@/pages/assignment/components',
  );
  return {
    ...actual,
    GuideAssignmentList: ({
      assignments,
      onUpdateAssignment,
    }: {
      assignments: { user_id: number }[];
      onUpdateAssignment: (userId: number, teamId: number) => void;
    }) =>
      assignments.length === 0 ? (
        <div>Nenhuma atribuição de guia encontrada.</div>
      ) : (
        <div>
          {assignments.map((a) => (
            <div key={a.user_id}>
              {a.user_id === 5 && 'Carla'}
              <button onClick={() => onUpdateAssignment(a.user_id, 0)}>Remover atribuição</button>
            </div>
          ))}
        </div>
      ),
  };
});

describe('GuideAssignment index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTeams.mockResolvedValue({ data: [] });
    mockGetGuideAssignments.mockResolvedValue({ data: [] });
  });

  it('shows loading state', () => {
    mockUseUser.mockReturnValue({ isLoading: true, isRallyAdmin: false });
    renderWithClient(<GuideAssignment />);
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('redirects non-admin users when not embedded', () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: false });
    renderWithClient(<GuideAssignment />);
    expect(screen.getByText('Navigate to /')).toBeInTheDocument();
  });

  it('renders page header and list for admin', async () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true });
    mockGetGuideAssignments.mockResolvedValue({
      data: [
        {
          id: 1,
          user_id: 5,
          user_name: 'Carla',
          user_email: null,
          team_id: null,
          team_name: null,
        },
      ],
    });
    renderWithClient(<GuideAssignment />);
    expect(screen.getByText('Atribuição de guias')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Carla')).toBeInTheDocument();
    });
  });

  it('renders without page header when embedded', () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: false });
    renderWithClient(<GuideAssignment embedded />);
    expect(screen.queryByText('Atribuição de guias')).not.toBeInTheDocument();
    expect(screen.getByText('Nenhuma atribuição de guia encontrada.')).toBeInTheDocument();
  });

  it('triggers mutation and refetches assignments on successful update', async () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true });
    mockGetGuideAssignments.mockResolvedValue({
      data: [
        {
          id: 1,
          user_id: 5,
          user_name: 'Carla',
          user_email: null,
          team_id: null,
          team_name: null,
        },
      ],
    });
    mockUpdateGuideTeamAssignment.mockResolvedValue({ data: { id: 1 } });

    renderWithClient(<GuideAssignment />);

    await waitFor(() => {
      expect(screen.getByText('Carla')).toBeInTheDocument();
    });

    const removeButton = screen.getByText('Remover atribuição');
    const { default: userEvent } = await import('@testing-library/user-event');
    await userEvent.setup().click(removeButton);

    await waitFor(() => {
      expect(mockUpdateGuideTeamAssignment).toHaveBeenCalledWith({
        path: { user_id: 5 },
        body: { team_id: null },
      });
    });

    await waitFor(() => {
      expect(mockGetGuideAssignments).toHaveBeenCalledTimes(2);
    });
  });
});

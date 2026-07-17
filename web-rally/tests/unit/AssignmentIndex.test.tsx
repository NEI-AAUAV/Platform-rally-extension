import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Assignment from '@/pages/assignment/index';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const { mockUseUser, mockGetCheckpoints, mockGetStaffAssignments, mockUpdateCheckpointAssignment } =
  vi.hoisted(() => ({
    mockUseUser: vi.fn(),
    mockGetCheckpoints: vi.fn(),
    mockGetStaffAssignments: vi.fn(),
    mockUpdateCheckpointAssignment: vi.fn(),
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
  getCheckpoints: (...args: unknown[]) => mockGetCheckpoints(...args),
  getStaffAssignments: (...args: unknown[]) => mockGetStaffAssignments(...args),
  updateCheckpointAssignment: (...args: unknown[]) => mockUpdateCheckpointAssignment(...args),
}));

describe('Assignment index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCheckpoints.mockResolvedValue({ data: [] });
    mockGetStaffAssignments.mockResolvedValue({ data: [] });
  });

  it('shows loading state', () => {
    mockUseUser.mockReturnValue({ isLoading: true, isRallyAdmin: false });
    renderWithClient(<Assignment />);
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('redirects non-admin users when not embedded', () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: false });
    renderWithClient(<Assignment />);
    expect(screen.getByText('Navigate to /')).toBeInTheDocument();
  });

  it('renders page header and list for admin', async () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true });
    mockGetStaffAssignments.mockResolvedValue({
      data: [
        {
          id: 1,
          user_id: 5,
          user_name: 'Bob',
          user_email: null,
          checkpoint_id: null,
          checkpoint_name: null,
        },
      ],
    });
    renderWithClient(<Assignment />);
    expect(screen.getByText('Atribuição de postos')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });
  });

  it('renders without page header when embedded and allows non-admins', () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: false });
    renderWithClient(<Assignment embedded />);
    expect(screen.queryByText('Atribuição de postos')).not.toBeInTheDocument();
    expect(screen.getByText('Nenhuma atribuição de staff encontrada.')).toBeInTheDocument();
  });
});

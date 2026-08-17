import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StaffEvaluation from '@/pages/staff-evaluation/index';

const { mockUseUser } = vi.hoisted(() => ({
  mockUseUser: vi.fn(),
}));

vi.mock('@/hooks/useUser', () => ({
  default: () => mockUseUser(),
}));

vi.mock('@/components/shared', () => ({
  LoadingState: ({ message }: { message: string }) => <div>{message}</div>,
}));

vi.mock('@/pages/staff-evaluation/staff-only', () => ({
  default: () => <div>StaffOnlyPage</div>,
}));

vi.mock('@/pages/staff-evaluation/manager-only', () => ({
  default: () => <div>ManagerOnlyPage</div>,
}));

vi.mock('@/pages/staff-evaluation/components/OfflineQueueBanner', () => ({
  default: () => <div>QueueBanner</div>,
}));

describe('StaffEvaluation index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state', () => {
    mockUseUser.mockReturnValue({ isLoading: true, isRallyAdmin: false });
    render(<StaffEvaluation />);
    expect(screen.getByText('A carregar...')).toBeInTheDocument();
  });

  it('renders manager page for rally admin', () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: true });
    render(<StaffEvaluation />);
    expect(screen.getByText('ManagerOnlyPage')).toBeInTheDocument();
    expect(screen.getByText('QueueBanner')).toBeInTheDocument();
  });

  it('renders staff page for non-admin', () => {
    mockUseUser.mockReturnValue({ isLoading: false, isRallyAdmin: false });
    render(<StaffEvaluation />);
    expect(screen.getByText('StaffOnlyPage')).toBeInTheDocument();
  });
});

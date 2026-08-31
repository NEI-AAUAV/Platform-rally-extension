import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StaffEvaluation from '@/pages/staff-evaluation/index';

const { mockUseUser } = vi.hoisted(() => ({
  mockUseUser: vi.fn(),
}));

vi.mock('@/hooks/useUser', () => ({
  default: () => mockUseUser(),
}));

vi.mock('@tanstack/react-router', () => ({
  Navigate: ({ to }: { to: string }) => <div>Navigate:{to}</div>,
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

function userFixture(overrides: Record<string, unknown> = {}) {
  return { isLoading: false, isRallyAdmin: false, userStore: { scopes: [] }, ...overrides };
}

describe('StaffEvaluation index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state', () => {
    mockUseUser.mockReturnValue(userFixture({ isLoading: true }));
    render(<StaffEvaluation />);
    expect(screen.getByText('A carregar...')).toBeInTheDocument();
  });

  it('renders manager page for rally admin', () => {
    mockUseUser.mockReturnValue(
      userFixture({ isRallyAdmin: true, userStore: { scopes: ['admin'] } }),
    );
    render(<StaffEvaluation />);
    expect(screen.getByText('ManagerOnlyPage')).toBeInTheDocument();
    expect(screen.getByText('QueueBanner')).toBeInTheDocument();
  });

  it('renders staff page for plain staff', () => {
    mockUseUser.mockReturnValue(userFixture({ userStore: { scopes: ['rally-staff'] } }));
    render(<StaffEvaluation />);
    expect(screen.getByText('StaffOnlyPage')).toBeInTheDocument();
  });

  it('H6 regression: redirects home when the identity has no privileged scope', () => {
    mockUseUser.mockReturnValue(userFixture({ userStore: { scopes: [] } }));
    render(<StaffEvaluation />);
    expect(screen.getByText('Navigate:/')).toBeInTheDocument();
    expect(screen.queryByText('StaffOnlyPage')).not.toBeInTheDocument();
    expect(screen.queryByText('ManagerOnlyPage')).not.toBeInTheDocument();
  });

  it('H6 regression: redirects home for a team-authenticated identity with no staff scope', () => {
    mockUseUser.mockReturnValue(userFixture({ userStore: { scopes: undefined } }));
    render(<StaffEvaluation />);
    expect(screen.getByText('Navigate:/')).toBeInTheDocument();
  });
});

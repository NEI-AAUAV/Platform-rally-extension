import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StaffEvaluationPage from '@/pages/staff-evaluation/staff-only';

const { mockUseUserStore, mockNavigate, mockGetMyCheckpoint, mockUseQuery } = vi.hoisted(() => ({
  mockUseUserStore: vi.fn(),
  mockNavigate: vi.fn(),
  mockGetMyCheckpoint: vi.fn(),
  mockUseQuery: vi.fn(),
}));

vi.mock('@/stores/useUserStore', () => ({
  useUserStore: () => mockUseUserStore(),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock('@/client', () => ({
  getMyCheckpoint: mockGetMyCheckpoint,
}));

describe('StaffEvaluationPage (staff-only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUserStore.mockReturnValue({ token: 'tok' });
  });

  it('shows no-checkpoint state when there is no myCheckpoint', () => {
    mockUseQuery.mockReturnValue({ data: undefined });
    render(<StaffEvaluationPage />);
    expect(screen.getByText('Sem posto atribuído')).toBeInTheDocument();
  });

  it('navigates and shows redirect message when checkpoint assigned', () => {
    mockUseQuery.mockReturnValue({ data: { id: 42 } });
    render(<StaffEvaluationPage />);
    expect(screen.getByText('A redirecionar para a avaliação do teu posto...')).toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/staff-evaluation/checkpoint/$checkpointId',
      params: { checkpointId: '42' },
    });
  });
});

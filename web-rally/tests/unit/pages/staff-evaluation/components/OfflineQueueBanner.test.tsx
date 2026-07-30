import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import OfflineQueueBanner from '@/pages/staff-evaluation/components/OfflineQueueBanner';

const { mockUseOfflineSync, mockUseEvalQueueStatus } = vi.hoisted(() => ({
  mockUseOfflineSync: vi.fn(),
  mockUseEvalQueueStatus: vi.fn(),
}));

vi.mock('@/offline/useOfflineSync', () => ({
  useOfflineSync: () => mockUseOfflineSync(),
}));

vi.mock('@/offline/useEvalQueueStatus', () => ({
  useEvalQueueStatus: () => mockUseEvalQueueStatus(),
}));

describe('OfflineQueueBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when queue is empty', () => {
    mockUseOfflineSync.mockReturnValue({ syncNow: vi.fn() });
    mockUseEvalQueueStatus.mockReturnValue({ pending: 0, failed: 0 });
    const { container } = render(<OfflineQueueBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows pending count', () => {
    mockUseOfflineSync.mockReturnValue({ syncNow: vi.fn() });
    mockUseEvalQueueStatus.mockReturnValue({ pending: 3, failed: 0 });
    render(<OfflineQueueBanner />);
    expect(screen.getByText('3 avaliação(ões) por sincronizar')).toBeInTheDocument();
  });

  it('shows failed count', () => {
    mockUseOfflineSync.mockReturnValue({ syncNow: vi.fn() });
    mockUseEvalQueueStatus.mockReturnValue({ pending: 0, failed: 2 });
    render(<OfflineQueueBanner />);
    expect(screen.getByText('· 2 com falha')).toBeInTheDocument();
  });

  it('calls syncNow when button clicked', () => {
    const syncNow = vi.fn();
    mockUseOfflineSync.mockReturnValue({ syncNow });
    mockUseEvalQueueStatus.mockReturnValue({ pending: 1, failed: 1 });
    render(<OfflineQueueBanner />);
    fireEvent.click(screen.getByText('Sincronizar'));
    expect(syncNow).toHaveBeenCalled();
  });
});

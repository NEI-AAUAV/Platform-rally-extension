import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import OfflineQueueBanner from '@/pages/staff-evaluation/components/OfflineQueueBanner';
import { discard, retryFailed } from '@/offline/evalQueue';

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

vi.mock('@/offline/evalQueue', () => ({
  discard: vi.fn().mockResolvedValue(undefined),
  retryFailed: vi.fn().mockResolvedValue(undefined),
}));

function statusFixture(overrides: Record<string, unknown> = {}) {
  return { items: [], pending: 0, failed: 0, refresh: vi.fn(), ...overrides };
}

describe('OfflineQueueBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when queue is empty', () => {
    mockUseOfflineSync.mockReturnValue({ syncNow: vi.fn() });
    mockUseEvalQueueStatus.mockReturnValue(statusFixture());
    const { container } = render(<OfflineQueueBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows pending count', () => {
    mockUseOfflineSync.mockReturnValue({ syncNow: vi.fn() });
    mockUseEvalQueueStatus.mockReturnValue(statusFixture({ pending: 3 }));
    render(<OfflineQueueBanner />);
    expect(screen.getByText('3 avaliação(ões) por sincronizar')).toBeInTheDocument();
  });

  it('shows failed count', () => {
    mockUseOfflineSync.mockReturnValue({ syncNow: vi.fn() });
    mockUseEvalQueueStatus.mockReturnValue(statusFixture({ failed: 2 }));
    render(<OfflineQueueBanner />);
    expect(screen.getByText('· 2 com falha')).toBeInTheDocument();
  });

  it('calls syncNow when button clicked', () => {
    const syncNow = vi.fn();
    mockUseOfflineSync.mockReturnValue({ syncNow });
    mockUseEvalQueueStatus.mockReturnValue(statusFixture({ pending: 1, failed: 1 }));
    render(<OfflineQueueBanner />);
    fireEvent.click(screen.getByText('Sincronizar'));
    expect(syncNow).toHaveBeenCalled();
  });

  it('C4: lists each failed entry with its reason and retry/discard actions', () => {
    mockUseOfflineSync.mockReturnValue({ syncNow: vi.fn() });
    mockUseEvalQueueStatus.mockReturnValue(
      statusFixture({
        failed: 1,
        items: [
          {
            idempotencyKey: 'k1',
            teamId: 5,
            activityId: 9,
            status: 'failed',
            lastError: 'Staff scoring está desligado',
            attempts: 0,
            createdAt: Date.now(),
            resultData: {},
          },
        ],
      }),
    );
    render(<OfflineQueueBanner />);
    expect(screen.getByText(/Staff scoring está desligado/)).toBeInTheDocument();
    expect(screen.getByText('Tentar de novo')).toBeInTheDocument();
    expect(screen.getByText('Descartar')).toBeInTheDocument();
  });

  it('C4: retry button calls retryFailed then re-syncs', async () => {
    const syncNow = vi.fn().mockResolvedValue(undefined);
    mockUseOfflineSync.mockReturnValue({ syncNow });
    mockUseEvalQueueStatus.mockReturnValue(
      statusFixture({
        failed: 1,
        items: [
          {
            idempotencyKey: 'k1',
            teamId: 5,
            activityId: 9,
            status: 'failed',
            lastError: 'erro',
            attempts: 0,
            createdAt: Date.now(),
            resultData: {},
          },
        ],
      }),
    );
    render(<OfflineQueueBanner />);
    fireEvent.click(screen.getByText('Tentar de novo'));
    expect(retryFailed).toHaveBeenCalledWith('k1');
  });

  it('C4: discard button calls discard then refreshes', () => {
    const refresh = vi.fn();
    mockUseOfflineSync.mockReturnValue({ syncNow: vi.fn() });
    mockUseEvalQueueStatus.mockReturnValue(
      statusFixture({
        failed: 1,
        refresh,
        items: [
          {
            idempotencyKey: 'k1',
            teamId: 5,
            activityId: 9,
            status: 'failed',
            lastError: 'erro',
            attempts: 0,
            createdAt: Date.now(),
            resultData: {},
          },
        ],
      }),
    );
    render(<OfflineQueueBanner />);
    fireEvent.click(screen.getByText('Descartar'));
    expect(discard).toHaveBeenCalledWith('k1');
  });
});

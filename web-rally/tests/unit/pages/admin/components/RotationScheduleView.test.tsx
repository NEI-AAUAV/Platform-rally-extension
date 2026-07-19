import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RotationScheduleView from '@/pages/admin/components/RotationScheduleView';

const { mockGetTeams, mockGetCheckpoints } = vi.hoisted(() => ({
  mockGetTeams: vi.fn(),
  mockGetCheckpoints: vi.fn(),
}));

vi.mock('@/client', () => ({
  getTeams: (...args: unknown[]) => mockGetTeams(...args),
  getCheckpoints: (...args: unknown[]) => mockGetCheckpoints(...args),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('RotationScheduleView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTeams.mockResolvedValue({ data: [{ id: 1, name: 'Team Alpha' }] });
    mockGetCheckpoints.mockResolvedValue({ data: [{ id: 2, name: 'CP Beta' }] });
  });

  it('shows empty message when rounds is empty', () => {
    renderWithClient(<RotationScheduleView rounds={[]} />);
    expect(screen.getByText('Escalonamento vazio.')).toBeInTheDocument();
  });

  it('renders a single round with a single pair using fallback names before load', () => {
    renderWithClient(
      <RotationScheduleView rounds={[[{ team_id: 1, checkpoint_id: 2 }]]} />,
    );
    expect(screen.getByText('Ronda 1')).toBeInTheDocument();
    expect(screen.getByText(/Equipa #1|Team Alpha/)).toBeInTheDocument();
  });

  it('resolves team and checkpoint names once loaded', async () => {
    renderWithClient(
      <RotationScheduleView rounds={[[{ team_id: 1, checkpoint_id: 2 }]]} />,
    );
    expect(await screen.findByText('Team Alpha')).toBeInTheDocument();
    expect(await screen.findByText('CP Beta')).toBeInTheDocument();
  });

  it('renders multiple rounds and multiple pairs', async () => {
    mockGetTeams.mockResolvedValue({ data: [] });
    mockGetCheckpoints.mockResolvedValue({ data: [] });
    renderWithClient(
      <RotationScheduleView
        rounds={[
          [
            { team_id: 1, checkpoint_id: 2 },
            { team_id: 3, checkpoint_id: 4 },
          ],
          [{ team_id: 1, checkpoint_id: 4 }],
        ]}
      />,
    );
    expect(screen.getByText('Ronda 1')).toBeInTheDocument();
    expect(screen.getByText('Ronda 2')).toBeInTheDocument();
    expect(await screen.findByText('Equipa #3')).toBeInTheDocument();
    expect(screen.getAllByText('Checkpoint #4').length).toBeGreaterThan(0);
  });

  it('filters out invalid pairs missing team_id or checkpoint_id', () => {
    mockGetTeams.mockResolvedValue({ data: [] });
    mockGetCheckpoints.mockResolvedValue({ data: [] });
    renderWithClient(
      <RotationScheduleView
        rounds={[[{ team_id: 1 }, { checkpoint_id: 2 }, { team_id: 5, checkpoint_id: 6 }]]}
      />,
    );
    expect(screen.getByText('Equipa #5')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventStatsRibbon } from '@/pages/home/EventStatsRibbon';

const { mockGetTeams, mockGetCheckpoints, mockUseCountdown } = vi.hoisted(() => ({
  mockGetTeams: vi.fn(),
  mockGetCheckpoints: vi.fn(),
  mockUseCountdown: vi.fn(),
}));

vi.mock('@/client', () => ({
  getTeams: (...args: unknown[]) => mockGetTeams(...args),
  getCheckpoints: (...args: unknown[]) => mockGetCheckpoints(...args),
}));

vi.mock('@/pages/home/useCountdown', () => ({
  useCountdown: (...args: unknown[]) => mockUseCountdown(...args),
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('EventStatsRibbon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCountdown.mockReturnValue({ phase: 'live' });
    mockGetCheckpoints.mockResolvedValue([]);
  });

  it('renders nothing when there are no teams', async () => {
    mockGetTeams.mockResolvedValue([]);
    const { container } = renderWithClient(
      <EventStatsRibbon settings={null} checkpointsPublic={false} />,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(container.firstChild).toBeNull();
  });

  it('renders team count, total points and phase when teams are present', async () => {
    mockGetTeams.mockResolvedValue([
      { id: 1, name: 'A', total: 40 },
      { id: 2, name: 'B', total: 60 },
    ]);
    renderWithClient(<EventStatsRibbon settings={null} checkpointsPublic={false} />);

    expect(await screen.findByText('Equipas')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Pontos em jogo')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('Estado')).toBeInTheDocument();
    expect(screen.getByText('A decorrer')).toBeInTheDocument();
  });

  it('includes checkpoint count cell when checkpointsPublic is true', async () => {
    mockGetTeams.mockResolvedValue([{ id: 1, name: 'A', total: 10 }]);
    mockGetCheckpoints.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    renderWithClient(<EventStatsRibbon settings={null} checkpointsPublic />);

    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(screen.getByText(/Tascas|Postos/)).toBeInTheDocument();
  });

  it('omits checkpoint count cell when checkpointsPublic is false', async () => {
    mockGetTeams.mockResolvedValue([{ id: 1, name: 'A', total: 10 }]);
    renderWithClient(<EventStatsRibbon settings={null} checkpointsPublic={false} />);

    await screen.findByText('Equipas');
    expect(mockGetCheckpoints).not.toHaveBeenCalled();
  });

  it('falls back to em-dash for unknown phase', async () => {
    mockUseCountdown.mockReturnValue({ phase: 'unknown-phase' });
    mockGetTeams.mockResolvedValue([{ id: 1, name: 'A', total: 10 }]);
    renderWithClient(<EventStatsRibbon settings={null} checkpointsPublic={false} />);

    await screen.findByText('Equipas');
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders "Por começar" and "Terminada" phase labels', async () => {
    mockGetTeams.mockResolvedValue([{ id: 1, name: 'A', total: 10 }]);
    mockUseCountdown.mockReturnValue({ phase: 'pre' });
    const { rerender } = renderWithClient(
      <EventStatsRibbon settings={null} checkpointsPublic={false} />,
    );
    expect(await screen.findByText('Por começar')).toBeInTheDocument();

    mockUseCountdown.mockReturnValue({ phase: 'post' });
    rerender(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <EventStatsRibbon settings={null} checkpointsPublic={false} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Terminada')).toBeInTheDocument();
  });

  it('handles teams without a total value by defaulting to 0', async () => {
    mockGetTeams.mockResolvedValue([{ id: 1, name: 'A' }, { id: 2, name: 'B', total: 5 }]);
    renderWithClient(<EventStatsRibbon settings={null} checkpointsPublic={false} />);

    expect(await screen.findByText('5')).toBeInTheDocument();
  });
});

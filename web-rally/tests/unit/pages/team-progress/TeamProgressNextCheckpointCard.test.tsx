import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NextCheckpointCard from '@/pages/team-progress/NextCheckpointCard';
import { arriveAtCheckpoint } from '@/client';
import type { DetailedCheckPoint } from '@/client';

const { mockUseCheckpointMedia } = vi.hoisted(() => ({
  mockUseCheckpointMedia: vi.fn(),
}));

vi.mock('@/hooks/useCheckpointMedia', () => ({
  useCheckpointMedia: (...args: unknown[]) => mockUseCheckpointMedia(...args),
}));

vi.mock('@/client', () => ({
  arriveAtCheckpoint: vi.fn(),
}));

vi.mock('@/components/shared', () => ({
  CheckpointDiscovery: () => <div data-testid="discovery" />,
}));

const checkpoint = {
  id: 1,
  name: 'Posto 1',
  latitude: 41.1,
  longitude: -8.6,
  arrival_radius_m: 50,
  description: 'Um posto',
} as DetailedCheckPoint;

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('team-progress NextCheckpointCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCheckpointMedia.mockReturnValue({ photos: [], funFacts: [] });
  });

  it('renders checkpoint name and coordinates when showMap is true', () => {
    render(<NextCheckpointCard checkpoint={checkpoint} showMap />, { wrapper: createWrapper() });
    expect(screen.getByText(/Próximo Posto — Posto 1/)).toBeInTheDocument();
    expect(screen.getByText(/41\.100000/)).toBeInTheDocument();
  });

  it('hides coordinates when showMap is false', () => {
    render(<NextCheckpointCard checkpoint={checkpoint} showMap={false} />, {
      wrapper: createWrapper(),
    });
    expect(screen.queryByText(/41\.100000/)).not.toBeInTheDocument();
  });

  it('shows discovery section when description is present', () => {
    render(<NextCheckpointCard checkpoint={checkpoint} showMap />, { wrapper: createWrapper() });
    expect(screen.getByTestId('discovery')).toBeInTheDocument();
  });

  it('does not render checkin button when checkpoint has no coordinates', () => {
    const cpNoCoords = { ...checkpoint, latitude: null, longitude: null } as DetailedCheckPoint;
    render(<NextCheckpointCard checkpoint={cpNoCoords} showMap />, { wrapper: createWrapper() });
    expect(screen.queryByRole('button', { name: /Check-in GPS/ })).not.toBeInTheDocument();
  });

  it('shows an error when geolocation is unsupported', async () => {
    const originalGeo = navigator.geolocation;
    // @ts-expect-error - simulate unsupported browser
    delete navigator.geolocation;
    const user = userEvent.setup();
    render(<NextCheckpointCard checkpoint={checkpoint} showMap />, { wrapper: createWrapper() });

    await user.click(screen.getByRole('button', { name: /Check-in GPS/ }));
    expect(screen.getByText('Geolocalização não suportada pelo browser.')).toBeInTheDocument();

    Object.defineProperty(navigator, 'geolocation', { value: originalGeo, configurable: true });
  });

  it('handles a successful check-in and shows the auto-completed message', async () => {
    vi.mocked(arriveAtCheckpoint).mockResolvedValue({
      data: { auto_completed: true, already_registered: false, distance_m: 10 },
    } as never);
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 41.1, longitude: -8.6 } }),
    );
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    });

    const user = userEvent.setup();
    render(<NextCheckpointCard checkpoint={checkpoint} showMap />, { wrapper: createWrapper() });
    await user.click(screen.getByRole('button', { name: /Check-in GPS/ }));

    await vi.waitFor(() =>
      expect(screen.getByText(/Posto concluído/)).toBeInTheDocument(),
    );
  });

  it('handles already-registered check-in response', async () => {
    vi.mocked(arriveAtCheckpoint).mockResolvedValue({
      data: { auto_completed: false, already_registered: true, distance_m: 12.4 },
    } as never);
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 41.1, longitude: -8.6 } }),
    );
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    });

    const user = userEvent.setup();
    render(<NextCheckpointCard checkpoint={checkpoint} showMap />, { wrapper: createWrapper() });
    await user.click(screen.getByRole('button', { name: /Check-in GPS/ }));

    await vi.waitFor(() =>
      expect(screen.getByText(/Já registado. Distância: 12 m\./)).toBeInTheDocument(),
    );
  });

  it('translates a "too far" error into a friendly message', async () => {
    vi.mocked(arriveAtCheckpoint).mockRejectedValue({
      body: { detail: 'Too far from checkpoint: 240m (max 50m)' },
    });
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 41.1, longitude: -8.6 } }),
    );
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    });

    const user = userEvent.setup();
    render(<NextCheckpointCard checkpoint={checkpoint} showMap />, { wrapper: createWrapper() });
    await user.click(screen.getByRole('button', { name: /Check-in GPS/ }));

    await vi.waitFor(() =>
      expect(screen.getByText(/Ainda estás longe do posto: 240 m/)).toBeInTheDocument(),
    );
  });

  it('shows a geolocation permission error and allows clearing it', async () => {
    const getCurrentPosition = vi.fn((_success, error) =>
      error({ message: 'User denied Geolocation' }),
    );
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    });

    const user = userEvent.setup();
    render(<NextCheckpointCard checkpoint={checkpoint} showMap />, { wrapper: createWrapper() });
    await user.click(screen.getByRole('button', { name: /Check-in GPS/ }));

    await vi.waitFor(() =>
      expect(screen.getByText(/Sem acesso à localização/)).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /Limpar erro/ }));
    expect(screen.queryByText(/Sem acesso à localização/)).not.toBeInTheDocument();
  });
});

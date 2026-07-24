import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RealMap from '@/pages/checkpoints/components/RealMap';

vi.mock('leaflet/dist/leaflet.css', () => ({}));

vi.mock('leaflet', () => ({
  default: {
    divIcon: vi.fn(() => ({})),
    latLngBounds: vi.fn(() => ({})),
  },
}));

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ eventHandlers }: { eventHandlers?: { click?: () => void } }) => (
    <button type="button" data-testid="marker" onClick={() => eventHandlers?.click?.()} />
  ),
  Polyline: () => <div data-testid="polyline" />,
  useMap: () => ({
    invalidateSize: vi.fn(),
    flyTo: vi.fn(),
    getZoom: vi.fn(() => 14),
    setView: vi.fn(),
    fitBounds: vi.fn(),
  }),
}));

describe('RealMap', () => {
  const checkpoints = [
    { id: 1, name: 'Checkpoint A', latitude: 40.1, longitude: -8.4, order: 1 },
    { id: 2, name: 'Checkpoint B', latitude: 40.2, longitude: -8.5, order: 2 },
  ];

  it('renders the map container with markers for checkpoints with coordinates', () => {
    render(<RealMap checkpoints={checkpoints} selectedCheckpoint={null} onSelect={vi.fn()} />);
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.getAllByTestId('marker')).toHaveLength(2);
  });

  it('calls onSelect when a marker is clicked', async () => {
    const onSelect = vi.fn();
    render(<RealMap checkpoints={checkpoints} selectedCheckpoint={null} onSelect={onSelect} />);
    const markers = screen.getAllByTestId('marker');
    markers[0]!.click();
    expect(onSelect).toHaveBeenCalled();
  });

  it('renders with no checkpoints without crashing (fallback center)', () => {
    render(<RealMap checkpoints={[]} selectedCheckpoint={null} onSelect={vi.fn()} />);
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.queryAllByTestId('marker')).toHaveLength(0);
  });
});

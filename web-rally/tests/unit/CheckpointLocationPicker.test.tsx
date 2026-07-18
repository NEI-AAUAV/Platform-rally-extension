import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CheckpointLocationPicker from '@/pages/admin/components/CheckpointLocationPicker';

vi.mock('leaflet/dist/leaflet.css', () => ({}));

vi.mock('leaflet', () => ({
  default: {
    divIcon: vi.fn(() => ({})),
  },
}));

const mockMap = {
  invalidateSize: vi.fn(),
  flyTo: vi.fn(),
  getZoom: vi.fn(() => 14),
};

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({
    eventHandlers,
  }: {
    eventHandlers?: { dragend?: (e: { target: { getLatLng: () => { lat: number; lng: number } } }) => void };
  }) => (
    <button
      type="button"
      data-testid="marker"
      onClick={() =>
        eventHandlers?.dragend?.({
          target: { getLatLng: () => ({ lat: 41, lng: -9 }) },
        })
      }
    />
  ),
  useMap: () => mockMap,
  useMapEvents: (handlers: { click?: (e: { latlng: { lat: number; lng: number } } ) => void }) => {
    (globalThis as any).__mapClickHandler = handlers.click;
    return null;
  },
}));

describe('CheckpointLocationPicker', () => {
  it('renders the map without a marker when no position is set', () => {
    render(<CheckpointLocationPicker latitude={null} longitude={null} onChange={vi.fn()} />);
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.queryByTestId('marker')).not.toBeInTheDocument();
  });

  it('renders a marker when latitude/longitude are provided', () => {
    render(<CheckpointLocationPicker latitude={40.5} longitude={-8.5} onChange={vi.fn()} />);
    expect(screen.getByTestId('marker')).toBeInTheDocument();
  });

  it('calls onChange when the marker is dragged', () => {
    const onChange = vi.fn();
    render(<CheckpointLocationPicker latitude={40.5} longitude={-8.5} onChange={onChange} />);
    screen.getByTestId('marker').click();
    expect(onChange).toHaveBeenCalledWith(41, -9);
  });

  it('calls onChange when the map is clicked', () => {
    const onChange = vi.fn();
    render(<CheckpointLocationPicker latitude={null} longitude={null} onChange={onChange} />);
    const handler = (globalThis as any).__mapClickHandler;
    expect(typeof handler).toBe('function');
    handler({ latlng: { lat: 42, lng: -7 } });
    expect(onChange).toHaveBeenCalledWith(42, -7);
  });

  it('shows the helper instructions text', () => {
    render(<CheckpointLocationPicker latitude={null} longitude={null} onChange={vi.fn()} />);
    expect(
      screen.getByText('Clica no mapa para definir coordenadas, ou arrasta o marcador.'),
    ).toBeInTheDocument();
  });
});

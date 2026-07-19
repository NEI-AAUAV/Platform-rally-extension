import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import MapSection from "@/pages/postos/components/MapSection";

vi.mock("leaflet/dist/leaflet.css", () => ({}));

vi.mock("leaflet", () => ({
  default: {
    divIcon: vi.fn(() => ({})),
    latLngBounds: vi.fn(() => ({})),
  },
}));

vi.mock("react-leaflet", () => ({
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

interface Checkpoint {
  id: number;
  name: string;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  order: number;
}

const withCoords: Checkpoint[] = [
  { id: 1, name: "Checkpoint A", latitude: 40.1, longitude: -8.4, order: 1 },
  { id: 2, name: "Checkpoint B", latitude: 40.2, longitude: -8.5, order: 2 },
];

const withoutCoords: Checkpoint[] = [
  { id: 1, name: "Checkpoint A", order: 1 },
  { id: 2, name: "Checkpoint B", order: 2 },
  { id: 3, name: "Checkpoint C", order: 3 },
];

describe("MapSection", () => {
  it("renders nothing when showMap is false", () => {
    const { container } = render(
      <MapSection checkpoints={withCoords} selectedCheckpoint={null} showMap={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there are no checkpoints", () => {
    const { container } = render(<MapSection checkpoints={[]} selectedCheckpoint={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the real map (lazy loaded) when at least one checkpoint has coordinates", async () => {
    render(<MapSection checkpoints={withCoords} selectedCheckpoint={null} />);
    await waitFor(() => expect(screen.getByTestId("map-container")).toBeInTheDocument());
  });

  it("renders the schematic SVG fallback when no checkpoints have coordinates", () => {
    const { container } = render(
      <MapSection checkpoints={withoutCoords} selectedCheckpoint={null} />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByTestId("map-container")).not.toBeInTheDocument();
  });

  it("renders a single-node schematic layout without dividing by zero", () => {
    const single: Checkpoint[] = [{ id: 1, name: "Solo", order: 1 }];
    const { container } = render(<MapSection checkpoints={single} selectedCheckpoint={null} />);
    expect(container.querySelectorAll("circle")).toHaveLength(1);
  });

  it("shows the selected checkpoint overlay label", () => {
    render(<MapSection checkpoints={withoutCoords} selectedCheckpoint={withoutCoords[1] ?? null} />);
    expect(screen.getByText("Posto selecionado")).toBeInTheDocument();
    expect(screen.getByText("Checkpoint B")).toBeInTheDocument();
  });

  it("falls back to the first checkpoint label when nothing is selected", () => {
    render(<MapSection checkpoints={withoutCoords} selectedCheckpoint={null} />);
    expect(screen.getByText("Primeiro posto")).toBeInTheDocument();
    expect(screen.getByText("Checkpoint A")).toBeInTheDocument();
  });

  it("renders a Google Maps link when any checkpoint has coordinates", () => {
    render(<MapSection checkpoints={withCoords} selectedCheckpoint={null} />);
    const link = screen.getByRole("link", { name: /Abrir no Google Maps/i });
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("https://www.google.com/maps/dir/?api=1&waypoints="),
    );
  });

  it("does not render a Google Maps link when no checkpoint has coordinates", () => {
    render(<MapSection checkpoints={withoutCoords} selectedCheckpoint={null} />);
    expect(screen.queryByRole("link", { name: /Abrir no Google Maps/i })).not.toBeInTheDocument();
  });

  it("invokes onSelectCheckpoint when a marker is clicked on the real map", async () => {
    const onSelectCheckpoint = vi.fn();
    render(
      <MapSection
        checkpoints={withCoords}
        selectedCheckpoint={null}
        onSelectCheckpoint={onSelectCheckpoint}
      />,
    );
    await waitFor(() => expect(screen.getAllByTestId("marker").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId("marker")[0]!);
    expect(onSelectCheckpoint).toHaveBeenCalled();
  });

  it("uses partial-coordinate checkpoints via the real map when at least one has coords", async () => {
    const mixed: Checkpoint[] = [
      { id: 1, name: "Has coords", latitude: 40.1, longitude: -8.4, order: 1 },
      { id: 2, name: "No coords", order: 2 },
    ];
    render(<MapSection checkpoints={mixed} selectedCheckpoint={null} />);
    await waitFor(() => expect(screen.getByTestId("map-container")).toBeInTheDocument());
  });
});

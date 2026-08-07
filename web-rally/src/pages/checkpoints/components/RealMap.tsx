import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Checkpoint {
  id: number;
  name: string;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  order: number;
  // Search circle for a post whose coordinates are withheld. Deliberately not
  // centred on the post — see the API's CheckpointService._search_area.
  search_latitude?: number | null;
  search_longitude?: number | null;
  search_radius_m?: number | null;
}

type RealMapProps = Readonly<{
  checkpoints: Checkpoint[];
  selectedCheckpoint: Checkpoint | null;
  onSelect: (cp: Checkpoint) => void;
}>;

function resolveAccent(): string {
  if (typeof window === "undefined") return "#008542";
  const root = getComputedStyle(document.documentElement);
  return (
    root.getPropertyValue("--rally-accent").trim() ||
    root.getPropertyValue("--rally-accent-fallback").trim() ||
    "#008542"
  );
}

/** Numbered pin styled with the rally accent. `selected` enlarges + rings it. */
function pinIcon(order: number, selected: boolean, accent: string): L.DivIcon {
  const size = selected ? 40 : 32;
  return L.divIcon({
    className: "",
    html: `<div style="
      display:grid;place-items:center;
      height:${size}px;width:${size}px;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      background:${accent};
      color:#fff;
      font-family:'Space Grotesk',sans-serif;font-weight:700;
      font-size:${selected ? 16 : 13}px;
      border:2px solid #fff;
      box-shadow:0 6px 16px -4px rgba(0,0,0,.5);
    "><span style="transform:rotate(45deg)">${order}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
}

function FitBounds({
  checkpoints,
  selected,
}: {
  checkpoints: Checkpoint[];
  selected: Checkpoint | null;
}) {
  const map = useMap();

  // Leaflet renders 0×0 when mounted inside a freshly-laid-out flex/grid cell
  // (or a lazy Suspense boundary). Force a resize once the container is sized.
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 0);
    return () => clearTimeout(id);
  }, [map]);

  useEffect(() => {
    if (selected?.latitude != null && selected.longitude != null) {
      map.flyTo([selected.latitude, selected.longitude], Math.max(map.getZoom(), 16), {
        duration: 0.6,
      });
      return;
    }
    const pts = checkpoints
      .filter((c) => c.latitude != null && c.longitude != null)
      .map((c) => [c.latitude as number, c.longitude as number] as [number, number]);
    if (pts.length === 1 && pts[0]) {
      map.setView(pts[0], 15);
    } else if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
    }
  }, [map, checkpoints, selected]);

  return null;
}

export default function RealMap({ checkpoints, selectedCheckpoint, onSelect }: RealMapProps) {
  const coords = useMemo(
    () =>
      checkpoints
        .filter((c) => c.latitude != null && c.longitude != null)
        .map((c) => ({
          cp: c,
          pos: [c.latitude as number, c.longitude as number] as [number, number],
        })),
    [checkpoints],
  );

  // Posts whose coordinates are withheld still get a circle to search in, so
  // a team that does not know the city has somewhere to start.
  const searchAreas = useMemo(
    () =>
      checkpoints.filter(
        (c) =>
          c.latitude == null &&
          c.search_latitude != null &&
          c.search_longitude != null &&
          (c.search_radius_m ?? 0) > 0,
      ),
    [checkpoints],
  );

  const center =
    coords[0]?.pos ??
    (searchAreas[0]
      ? ([searchAreas[0].search_latitude as number, searchAreas[0].search_longitude as number] as [
          number,
          number,
        ])
      : ([40.6304, -8.6574] as [number, number])); // UA Campus de Santiago
  const accent = useMemo(resolveAccent, []);

  return (
    <MapContainer
      center={center}
      zoom={14}
      scrollWheelZoom={false}
      style={{ height: 340, width: "100%" }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <Polyline
        positions={coords.map((c) => c.pos)}
        pathOptions={{ color: accent, weight: 4, dashArray: "2 10", lineCap: "round" }}
      />
      {searchAreas.map((cp) => (
        <Circle
          key={`search-${cp.id}`}
          center={[cp.search_latitude as number, cp.search_longitude as number]}
          radius={cp.search_radius_m as number}
          pathOptions={{ color: accent, weight: 2, dashArray: "6 8", fillOpacity: 0.08 }}
        />
      ))}
      {coords.map(({ cp, pos }) => (
        <Marker
          key={cp.id}
          position={pos}
          icon={pinIcon(cp.order, selectedCheckpoint?.id === cp.id, accent)}
          eventHandlers={{ click: () => onSelect(cp) }}
        />
      ))}
      <FitBounds checkpoints={checkpoints} selected={selectedCheckpoint} />
    </MapContainer>
  );
}

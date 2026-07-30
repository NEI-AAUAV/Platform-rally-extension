import { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Circle,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER: [number, number] = [40.6304, -8.6574]; // UA Campus de Santiago
const DEFAULT_ZOOM = 15;
const SELECTED_ZOOM = 16;

const pinIcon = L.divIcon({
  className: "",
  html: `<div style="
    height:32px;width:32px;border-radius:50% 50% 50% 0;
    transform:rotate(-45deg);
    background:#008542;border:2px solid #fff;
    box-shadow:0 6px 16px -4px rgba(0,0,0,.5);
  "></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

/** Muted numbered pin for the other, already-placed checkpoints (context only). */
function contextPinIcon(order: number): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="
      display:grid;place-items:center;
      height:24px;width:24px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      background:#64748b;color:#fff;
      font-family:sans-serif;font-weight:600;font-size:11px;
      border:2px solid #fff;opacity:.9;
      box-shadow:0 3px 8px -2px rgba(0,0,0,.45);
    "><span style="transform:rotate(45deg)">${order}</span></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
  });
}

type ContextCheckpoint = Readonly<{
  id: number;
  latitude?: number | null;
  longitude?: number | null;
  order: number;
  arrival_radius_m?: number | null;
}>;

type CheckpointLocationPickerProps = Readonly<{
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number, longitude: number) => void;
  /** Already-placed checkpoints, drawn as muted numbered pins joined by a line. */
  checkpoints?: ReadonlyArray<ContextCheckpoint>;
  /** Id of the checkpoint currently being edited, excluded from the context pins. */
  currentId?: number | null;
  /** GPS geofence radius (m) of the checkpoint being placed; drawn as a circle. */
  radiusM?: number | null;
}>;

function ClickHandler({ onChange }: Pick<CheckpointLocationPickerProps, "onChange">) {
  useMapEvents({
    click: (e) => onChange(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

function RecenterOnChange({ position }: { position: [number, number] | null }) {
  const map = useMap();

  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 0);
    return () => clearTimeout(id);
  }, [map]);

  useEffect(() => {
    if (position) {
      map.flyTo(position, Math.max(map.getZoom(), SELECTED_ZOOM), { duration: 0.4 });
    }
  }, [map, position]);

  return null;
}

export default function CheckpointLocationPicker({
  latitude,
  longitude,
  onChange,
  checkpoints,
  currentId,
  radiusM,
}: CheckpointLocationPickerProps) {
  const position = useMemo<[number, number] | null>(
    () => (latitude != null && longitude != null ? [latitude, longitude] : null),
    [latitude, longitude],
  );

  const others = useMemo(
    () =>
      (checkpoints ?? [])
        .filter((c) => c.id !== currentId && c.latitude != null && c.longitude != null)
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((c) => ({
          id: c.id,
          order: c.order,
          radius: c.arrival_radius_m ?? 0,
          pos: [c.latitude as number, c.longitude as number] as [number, number],
        })),
    [checkpoints, currentId],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <MapContainer
        center={position ?? others[0]?.pos ?? DEFAULT_CENTER}
        zoom={position ? SELECTED_ZOOM : DEFAULT_ZOOM}
        scrollWheelZoom={false}
        style={{ height: 260, width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        {others.length > 1 && (
          <Polyline
            positions={others.map((o) => o.pos)}
            pathOptions={{
              color: "#64748b",
              weight: 2,
              opacity: 0.7,
              dashArray: "2 8",
              lineCap: "round",
            }}
          />
        )}
        {others.map((o) =>
          o.radius > 0 ? (
            <Circle
              key={`r-${o.id}`}
              center={o.pos}
              radius={o.radius}
              pathOptions={{
                color: "#64748b",
                weight: 1,
                opacity: 0.5,
                fillColor: "#64748b",
                fillOpacity: 0.06,
              }}
            />
          ) : null,
        )}
        {others.map((o) => (
          <Marker key={o.id} position={o.pos} icon={contextPinIcon(o.order)} interactive={false} />
        ))}
        {position && radiusM != null && radiusM > 0 && (
          <Circle
            center={position}
            radius={radiusM}
            pathOptions={{
              color: "#008542",
              weight: 1.5,
              opacity: 0.9,
              fillColor: "#008542",
              fillOpacity: 0.12,
            }}
          />
        )}
        {position && (
          <Marker
            position={position}
            icon={pinIcon}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const marker = e.target as L.Marker;
                const { lat, lng } = marker.getLatLng();
                onChange(lat, lng);
              },
            }}
          />
        )}
        <ClickHandler onChange={onChange} />
        <RecenterOnChange position={position} />
      </MapContainer>
      <p className="bg-muted px-3 py-2 text-xs text-muted-foreground">
        Clica no mapa para definir coordenadas, ou arrasta o marcador.
      </p>
    </div>
  );
}

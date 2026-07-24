import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER: [number, number] = [40.2056, -8.4196]; // Coimbra fallback
const DEFAULT_ZOOM = 14;
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

type CheckpointLocationPickerProps = Readonly<{
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number, longitude: number) => void;
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
}: CheckpointLocationPickerProps) {
  const position = useMemo<[number, number] | null>(
    () => (latitude != null && longitude != null ? [latitude, longitude] : null),
    [latitude, longitude],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <MapContainer
        center={position ?? DEFAULT_CENTER}
        zoom={position ? SELECTED_ZOOM : DEFAULT_ZOOM}
        scrollWheelZoom={false}
        style={{ height: 260, width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
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

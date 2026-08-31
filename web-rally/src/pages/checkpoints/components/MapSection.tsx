import { lazy, Suspense } from "react";
import { Navigation } from "lucide-react";
import { routeUrl, type MapCoordinates } from "@/lib/mapLinks";
import type { DetailedCheckPoint } from "@/client";

const RealMap = lazy(() => import("./RealMap"));

/** The generated schema, not a local shape.
 *
 * The hand-written interface omitted `is_redacted`, `clue` and the `search_*`
 * circle fields, so TypeScript could not warn about code that ignored
 * redaction — and the search circles RealMap draws were invisible to every
 * caller's types.
 */
type Checkpoint = DetailedCheckPoint;

type MapSectionProps = Readonly<{
  checkpoints: Checkpoint[];
  selectedCheckpoint: Checkpoint | null;
  showMap?: boolean;
  onSelectCheckpoint?: (cp: Checkpoint) => void;
}>;

const ACCENT = "var(--rally-accent, #008542)";

function hasValidCoordinates(cp: Checkpoint): cp is Checkpoint & MapCoordinates {
  return (
    cp.latitude != null &&
    cp.longitude != null &&
    !Number.isNaN(cp.latitude) &&
    !Number.isNaN(cp.longitude)
  );
}

/** Map raw checkpoints to schematic node positions inside the 400x340 viewbox.
 *  Uses real lat/lng (normalised to bounds) when present, otherwise lays the
 *  nodes along a gentle diagonal so the route always reads as a path. */
function layoutNodes(checkpoints: Checkpoint[]): { x: number; y: number; cp: Checkpoint }[] {
  const withCoords = checkpoints.filter(hasValidCoordinates);
  const useReal = withCoords.length === checkpoints.length && checkpoints.length > 1;

  if (useReal) {
    const lats = checkpoints.map((c) => c.latitude as number);
    const lngs = checkpoints.map((c) => c.longitude as number);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const spanLat = maxLat - minLat || 1;
    const spanLng = maxLng - minLng || 1;
    return checkpoints.map((cp) => ({
      cp,
      x: 40 + (((cp.longitude as number) - minLng) / spanLng) * 320,
      // invert lat so north is up
      y: 40 + (1 - ((cp.latitude as number) - minLat) / spanLat) * 260,
    }));
  }

  // schematic diagonal fallback
  const n = Math.max(checkpoints.length, 1);
  return checkpoints.map((cp, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    return {
      cp,
      x: 50 + t * 300,
      y: 290 - t * 240 + Math.sin(t * Math.PI * 2) * 26,
    };
  });
}

function buildPath(nodes: { x: number; y: number }[]): string {
  if (nodes.length === 0) return "";
  return nodes
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
}

export default function MapSection({
  checkpoints,
  selectedCheckpoint,
  showMap = true,
  onSelectCheckpoint,
}: MapSectionProps) {
  if (!showMap || checkpoints.length === 0) return null;

  const nodes = layoutNodes(checkpoints);
  const path = buildPath(nodes);
  const overlay = selectedCheckpoint ?? checkpoints[0];
  const withCoords = checkpoints.filter(hasValidCoordinates);
  const useRealMap = withCoords.length >= 1;
  const mapUrl = routeUrl(withCoords);

  return (
    <div className="isolate overflow-hidden rounded-[20px] border border-border bg-card">
      <div className="relative h-[340px] bg-muted/40">
        {useRealMap ? (
          <Suspense
            fallback={
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                A carregar mapa...
              </div>
            }
          >
            <RealMap
              checkpoints={checkpoints}
              selectedCheckpoint={selectedCheckpoint}
              onSelect={(cp) => onSelectCheckpoint?.(cp)}
            />
          </Suspense>
        ) : (
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 400 340"
            preserveAspectRatio="xMidYMid slice"
            className="block"
          >
            {/* grid */}
            <g stroke="var(--border)" strokeWidth={1} opacity={0.6}>
              <path d="M0 70 H400 M0 150 H400 M0 230 H400 M0 300 H400 M70 0 V340 M160 0 V340 M250 0 V340 M330 0 V340" />
            </g>
            {/* route */}
            <path
              d={path}
              fill="none"
              stroke={ACCENT}
              strokeWidth={3.5}
              strokeDasharray="2 9"
              strokeLinecap="round"
            />
            {/* nodes */}
            {nodes.map(({ x, y, cp }) => {
              const isSel = overlay?.id === cp.id;
              return (
                <circle
                  key={cp.id}
                  cx={x}
                  cy={y}
                  r={isSel ? 11 : 8}
                  fill={ACCENT}
                  stroke="var(--card)"
                  strokeWidth={isSel ? 3 : 0}
                  opacity={isSel ? 1 : 0.85}
                />
              );
            })}
          </svg>
        )}

        {/* overlay card */}
        {overlay && (
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-[1000] rounded-[13px] border border-border bg-card px-[14px] py-3 shadow-[0_12px_30px_-14px_rgba(0,0,0,0.4)]">
            <div className="rally-accent text-[11px] font-bold uppercase tracking-[0.14em]">
              {selectedCheckpoint ? "Posto selecionado" : "Primeiro posto"}
            </div>
            <div className="mt-0.5 truncate text-[15px] font-bold text-foreground">
              {overlay.name}
            </div>
          </div>
        )}
      </div>

      {mapUrl && (
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rally-accent flex items-center justify-center gap-2 border-t border-border px-4 py-3 text-sm font-bold transition-colors hover:bg-muted/40"
        >
          <Navigation className="h-4 w-4" />
          Abrir no mapa
        </a>
      )}
    </div>
  );
}

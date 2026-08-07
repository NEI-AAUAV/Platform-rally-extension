import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Compass, Loader2, Thermometer } from "lucide-react";
import { readCheckpointProximity, type ProximityReading } from "@/client";
import { getErrorMessage } from "@/utils/errorHandling";

type Props = Readonly<{ checkpointId: number }>;

/** Warmer as you get closer — the band names come from the server. */
const BAND_TONE: Record<string, string> = {
  "menos de 100m": "text-red-500",
  "menos de 500m": "text-amber-600",
  "menos de 2km": "text-sky-600",
  "mais de 2km": "text-muted-foreground",
};

/**
 * "Am I getting warmer?" for a team that does not know the city.
 *
 * The server answers with a coarse band and, only once the team is already
 * inside the closest one, a compass sector. Nothing here ever receives a
 * coordinate or a metre count — see the API's ProximityService for why.
 */
export default function ProximityButton({ checkpointId }: Props) {
  const [reading, setReading] = useState<ProximityReading | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useMutation({
    mutationFn: async ({ lat, lng }: { lat: number; lng: number }) =>
      (
        await readCheckpointProximity({
          path: { checkpoint_id: checkpointId },
          body: { latitude: lat, longitude: lng },
        })
      ).data,
    onSuccess: (data) => setReading(data),
    onError: (err: unknown) =>
      setError(getErrorMessage(err, "Não foi possível medir a distância.")),
  });

  const handleCheck = () => {
    if (!navigator.geolocation) {
      setError("Geolocalização não suportada pelo browser.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        check.mutate({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (geoError) => {
        setLocating(false);
        setError(`Sem acesso à localização: ${geoError.message}`);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const busy = locating || check.isPending;

  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border p-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Thermometer className="h-3.5 w-3.5" />
        Estou perto?
      </div>

      {reading && (
        <p className="text-center">
          <span
            className={`rally-display text-2xl font-bold ${BAND_TONE[reading.band] ?? "text-foreground"}`}
          >
            {reading.band}
          </span>
          {reading.direction && (
            <span className="ml-2 inline-flex items-center gap-1 text-sm font-semibold text-foreground">
              <Compass className="h-4 w-4" />
              {reading.direction}
            </span>
          )}
        </p>
      )}

      {reading?.is_within_radius && (
        <p className="text-center text-xs text-emerald-600">
          Estás dentro do raio — podes fazer check-in.
        </p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={handleCheck}
        className="rally-press w-full rounded-xl border border-border px-4 py-3 text-sm font-semibold transition-all hover:bg-accent/40 disabled:opacity-60"
      >
        {busy ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />A medir…
          </span>
        ) : (
          "Verificar distância"
        )}
      </button>

      <p className="text-center text-xs text-muted-foreground">
        Diz-te se estás a aquecer, nunca onde é o sítio.
      </p>

      {error && <p className="text-center text-xs text-red-500">{error}</p>}
    </div>
  );
}

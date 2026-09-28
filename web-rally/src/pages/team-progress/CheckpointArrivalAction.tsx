import { LocateFixed, CheckCircle2, AlertCircle, CloudOff } from "lucide-react";
import { Spinner } from "@/components/shared";
import type { GpsState } from "./useCheckpointArrival";

const BUTTON_CLASSES: Record<GpsState, string> = {
  idle: "border border-border bg-card text-foreground hover:bg-accent/40",
  locating: "border border-border bg-card text-foreground hover:bg-accent/40",
  done: "cursor-default bg-green-500/15 text-green-600",
  queued: "bg-amber-500/15 text-amber-600",
  error: "bg-red-500/10 text-red-500",
};

const MESSAGE_CLASSES: Record<GpsState, string> = {
  idle: "text-red-500",
  locating: "text-red-500",
  done: "text-green-600",
  queued: "text-amber-600",
  error: "text-red-500",
};

function ButtonContent({
  gpsState,
  isPending,
  idleLabel,
}: Readonly<{ gpsState: GpsState; isPending: boolean; idleLabel: string }>) {
  if (gpsState === "locating" || isPending) {
    return (
      <>
        <Spinner size="sm" label="" />A localizar…
      </>
    );
  }
  if (gpsState === "done") {
    return (
      <>
        <CheckCircle2 className="h-5 w-5" />
        Check-in feito
      </>
    );
  }
  if (gpsState === "queued") {
    return (
      <>
        <CloudOff className="h-5 w-5" />
        Guardado — tentar novamente
      </>
    );
  }
  if (gpsState === "error") {
    return (
      <>
        <AlertCircle className="h-5 w-5" />
        Tentar novamente
      </>
    );
  }
  return (
    <>
      <LocateFixed className="h-5 w-5" />
      {idleLabel}
    </>
  );
}

interface CheckpointArrivalActionProps {
  openingNotice: string | null;
  settingsUnavailable: boolean;
  canCheckin: boolean;
  gpsState: GpsState;
  gpsMsg: string;
  isQueuedHere: boolean;
  isPending: boolean;
  onCheckin: () => void;
  onClearError: () => void;
  onRetrySettings: () => void;
  /** Idle-state button text. Defaults to "Check-in GPS" — override when a
   * screen renders several of these at once (a free-choice stage) so each
   * control reads as pointing somewhere specific, e.g. "Check-in GPS aqui". */
  idleLabel?: string;
  /** Accessible name for the idle button, for when several check-in controls
   * render on the same screen and need distinct names for screen readers.
   * Callers must never pass a redacted checkpoint's name here — pass
   * `undefined` (falls back to `idleLabel`) in that case. */
  ariaLabel?: string;
}

/**
 * Everything about *asking to check in*: why the button might be hidden
 * (opening hours, settings unavailable), the GPS button itself, and its
 * outcome messages. Access is gated here for UX only — the arrival endpoint
 * independently re-validates every attempt server-side.
 */
export default function CheckpointArrivalAction({
  openingNotice,
  settingsUnavailable,
  canCheckin,
  gpsState,
  gpsMsg,
  isQueuedHere,
  isPending,
  onCheckin,
  onClearError,
  onRetrySettings,
  idleLabel = "Check-in GPS",
  ariaLabel,
}: Readonly<CheckpointArrivalActionProps>) {
  return (
    <>
      {openingNotice && (
        <p className="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {openingNotice}
        </p>
      )}

      {settingsUnavailable && (
        <div className="space-y-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <p>
            Não foi possível carregar as definições da prova, por isso o check-in está indisponível.
          </p>
          <button
            type="button"
            onClick={onRetrySettings}
            className="rally-press w-full rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-accent/40"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {canCheckin && (
        <div className="space-y-2 border-t border-border pt-4">
          <button
            type="button"
            disabled={gpsState === "locating" || isPending || gpsState === "done"}
            onClick={onCheckin}
            aria-label={gpsState === "idle" ? (ariaLabel ?? idleLabel) : undefined}
            className={[
              "rally-press flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 font-bold transition-all",
              BUTTON_CLASSES[gpsState],
            ].join(" ")}
          >
            <ButtonContent gpsState={gpsState} isPending={isPending} idleLabel={idleLabel} />
          </button>
          {gpsMsg && (
            <p className={["text-center text-xs", MESSAGE_CLASSES[gpsState]].join(" ")}>{gpsMsg}</p>
          )}
          {isQueuedHere && gpsState !== "queued" && (
            <p className="text-center text-xs text-amber-600">
              Há um check-in por enviar para este local. Será enviado assim que houver ligação.
            </p>
          )}
          {gpsState === "error" && (
            <button
              type="button"
              className="w-full text-xs text-muted-foreground underline"
              onClick={onClearError}
            >
              Limpar erro
            </button>
          )}
        </div>
      )}
    </>
  );
}

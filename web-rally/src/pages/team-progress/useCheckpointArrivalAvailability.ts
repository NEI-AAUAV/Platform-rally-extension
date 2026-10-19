import type { CheckpointProgress, DetailedCheckPoint } from "@/client";
import useRallySettings from "@/hooks/useRallySettings";
import { checkpointOpeningNotice } from "./checkpointHours";

/** Shared UX gates for GPS arrival; the server remains the authority. */
export function useCheckpointArrivalAvailability(
  checkpoint: DetailedCheckPoint,
  checkpointProgress?: CheckpointProgress,
  notYetDeparted: string | null = null,
) {
  const { settings, error: settingsError, refetch: refetchSettings } = useRallySettings();
  const status = checkpointProgress?.status ?? "pending";
  const hasCoords = checkpoint.latitude != null && checkpoint.longitude != null;
  const isRedacted = checkpoint.is_redacted === true;
  const checkpointNotice = checkpointOpeningNotice(
    checkpoint,
    undefined,
    settings?.checkpoint_hours_enabled !== false,
  );
  const openingNotice = notYetDeparted ?? checkpointNotice;
  const settingsUnavailable = !settings && !!settingsError;
  const terminal = status === "completed" || status === "skipped";
  const hasArrived = status === "arrived" || status === "completed";
  const canCheckin =
    !terminal &&
    !hasArrived &&
    settings?.gps_checkin_enabled === true &&
    (hasCoords || isRedacted) &&
    (checkpoint.arrival_radius_m ?? 0) > 0 &&
    openingNotice === null;

  return {
    canCheckin,
    openingNotice,
    settingsUnavailable,
    refetchSettings,
    hasCoords,
    isRedacted,
    status,
    terminal,
    hasArrived,
  };
}

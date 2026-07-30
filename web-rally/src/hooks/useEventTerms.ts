import { getEventTerms, type EventTerms } from "@/lib/eventTerms";
import useRallySettings from "@/hooks/useRallySettings";

/**
 * Resolve event-type-aware terminology for the current event.
 *
 * Reads the current event's `event_type` from the public settings and maps it
 * to a terminology set (see {@link getEventTerms}). Falls back to the classic
 * rally terms while settings are loading or when the type is unknown.
 */
export default function useEventTerms(): EventTerms {
  const { settings } = useRallySettings();
  return getEventTerms(settings?.event_type);
}

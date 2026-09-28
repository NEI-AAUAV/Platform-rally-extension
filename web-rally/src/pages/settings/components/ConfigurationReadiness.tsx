import EventReadinessSummary from "@/pages/admin/components/readiness/EventReadinessSummary";
import EventReadinessChecklist from "@/pages/admin/components/readiness/EventReadinessChecklist";
import { useEventConfiguration } from "./useEventConfiguration";

/** Admin-only summary. It deliberately reads the event-scoped preflight instead of guessing from switches. */
export default function ConfigurationReadiness() {
  const query = useEventConfiguration();

  if (query.isLoading || !query.data) return null;
  const { ready, issues, capabilities } = query.data;

  return (
    <section
      className="rounded-xl border border-border bg-card p-4"
      aria-label="Estado da configuração"
    >
      <EventReadinessSummary ready={ready} issues={issues} capabilities={capabilities} />
      <EventReadinessChecklist issues={issues} />
    </section>
  );
}

import useEventTerms from "@/hooks/useEventTerms";
import useRallySettings from "@/hooks/useRallySettings";
import type { EventTerms } from "@/lib/eventTerms";

interface Step {
  n: string;
  title: string;
  body: string;
}

/**
 * How a team's arrival gets recorded, as told on the landing page. Only GPS is
 * a team-side check-in visible in the public settings; otherwise the staff at
 * the checkpoint records it when they evaluate.
 */
function arrivalSentence(terms: EventTerms, gpsCheckinEnabled: boolean): string {
  if (gpsCheckinEnabled) {
    return `Vai a cada ${terms.checkpoint}, faz check-in pelo GPS e completa cada ${terms.activity}.`;
  }
  return `Vai a cada ${terms.checkpoint} e completa cada ${terms.activity}. O staff regista a tua passagem.`;
}

function buildSteps(terms: EventTerms, gpsCheckinEnabled: boolean): Step[] {
  return [
    {
      n: "1",
      title: "Entra com a equipa",
      body: "Usa o código da tua equipa para aceder ao percurso e ao progresso ao vivo.",
    },
    {
      n: "2",
      title: `Percorre os ${terms.checkpoints}`,
      body: arrivalSentence(terms, gpsCheckinEnabled),
    },
    {
      n: "3",
      title: "Sobe na classificação",
      body: `Cada ${terms.checkpoint} soma pontos. Acompanha a pontuação e luta pelo pódio.`,
    },
  ];
}

/** Three-step explainer matching the prototype composition. */
export function HowItWorks() {
  const terms = useEventTerms();
  const { settings } = useRallySettings();
  const steps = buildSteps(terms, settings?.gps_checkin_enabled === true);

  return (
    <section aria-labelledby="how-heading">
      <h2 id="how-heading" className="rally-display mb-5 text-5xl text-foreground sm:text-6xl">
        Como funciona
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {steps.map((step) => (
          <div
            key={step.n}
            className="rally-surface flex items-start gap-4 p-5 md:flex-col md:gap-6 md:p-6"
          >
            <span className="rally-display rally-accent w-8 shrink-0 text-5xl leading-none md:w-auto md:text-7xl">
              {step.n}
            </span>
            <div>
              <div className="rally-display text-2xl text-foreground md:text-3xl">{step.title}</div>
              <div className="mt-1 text-sm leading-relaxed text-muted-foreground md:mt-2">
                {step.body}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default HowItWorks;

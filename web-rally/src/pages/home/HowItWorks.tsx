import { LogIn, Map, Trophy } from "lucide-react";
import type { ComponentType } from "react";

interface Step {
  readonly Icon: ComponentType<{ className?: string }>;
  readonly title: string;
  readonly body: string;
}

const STEPS: Step[] = [
  {
    Icon: LogIn,
    title: "Entra com a equipa",
    body: "Usa o código da tua equipa para aceder ao percurso e acompanhar o progresso.",
  },
  {
    Icon: Map,
    title: "Percorre os postos",
    body: "Passa por cada posto, completa os desafios e regista o teu check-in.",
  },
  {
    Icon: Trophy,
    title: "Sobe na classificação",
    body: "Cada posto soma pontos. Acompanha a pontuação ao vivo e luta pelo topo.",
  },
];

/** Three-step explainer of how the event works, on the new design system. */
export function HowItWorks() {
  return (
    <section aria-labelledby="how-heading">
      <h2
        id="how-heading"
        className="rally-display text-2xl font-bold text-foreground sm:text-3xl"
      >
        Como funciona
      </h2>
      <ol className="mt-6 grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="rally-surface rally-press p-5">
            <div className="flex items-center gap-3">
              <span className="rally-bg-accent-soft rally-accent grid h-10 w-10 place-items-center rounded-lg">
                <step.Icon className="h-5 w-5" />
              </span>
              <span className="rally-display text-3xl font-bold text-muted-foreground/40">
                {index + 1}
              </span>
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">{step.title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default HowItWorks;

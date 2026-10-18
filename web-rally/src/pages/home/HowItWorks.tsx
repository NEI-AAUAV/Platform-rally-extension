import useEventTerms from "@/hooks/useEventTerms";
import SectionHeader from "./SectionHeader";

function buildSteps(terms: ReturnType<typeof useEventTerms>) {
  return [
    {
      n: "01",
      title: "Entra com a equipa",
      body: "Usa o código da tua equipa para aceder ao percurso e ao progresso ao vivo.",
    },
    {
      n: "02",
      title: `Percorre os ${terms.checkpoints}`,
      body: `Vai a cada ${terms.checkpoint}, completa o ${terms.activity} e faz check-in com o QR code.`,
    },
    {
      n: "03",
      title: "Sobe na classificação",
      body: `Cada ${terms.checkpoint} soma pontos. Acompanha a pontuação e luta pelo pódio.`,
    },
  ];
}

/** Three-step explainer laid out as a numbered route: stacked on mobile, a row on desktop. */
export function HowItWorks() {
  const terms = useEventTerms();
  const steps = buildSteps(terms);

  return (
    <section aria-labelledby="how-heading">
      <SectionHeader id="how-heading" eyebrow="Percurso" title="Como funciona" />
      <ol className="grid gap-3 md:grid-cols-3">
        {steps.map((step) => (
          <li
            key={step.n}
            className="group relative overflow-hidden rounded-[20px] border border-border bg-card p-6 transition-colors hover:border-foreground/20"
          >
            <span
              aria-hidden
              className="rally-display block text-[56px] font-bold leading-none text-foreground/10 transition-colors group-hover:text-foreground/20"
            >
              {step.n}
            </span>
            <h3 className="mt-4 text-base font-bold text-foreground">{step.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            <span
              aria-hidden
              className="rally-bg-accent absolute inset-x-0 bottom-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
            />
          </li>
        ))}
      </ol>
    </section>
  );
}

export default HowItWorks;

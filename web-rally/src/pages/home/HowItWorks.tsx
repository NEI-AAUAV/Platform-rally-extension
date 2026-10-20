import useEventTerms from "@/hooks/useEventTerms";

function buildSteps(terms: ReturnType<typeof useEventTerms>) {
  return [
    {
      n: "1",
      title: "Entra com a equipa",
      body: "Usa o código da tua equipa para aceder ao percurso e ao progresso ao vivo.",
    },
    {
      n: "2",
      title: `Percorre os ${terms.checkpoints}`,
      body: `Vai a cada ${terms.checkpoint}, completa o ${terms.activity} e faz check-in com o QR code.`,
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
  const steps = buildSteps(terms);

  return (
    <section aria-labelledby="how-heading">
      <h2 id="how-heading" className="rally-display mb-5 text-5xl text-foreground sm:text-6xl">
        Como funciona
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((step) => (
          <div
            key={step.n}
            className="rally-surface flex flex-col gap-6 p-6"
          >
            <span className="rally-display rally-accent text-7xl leading-none">
              {step.n}
            </span>
            <div>
              <div className="rally-display text-3xl text-foreground">{step.title}</div>
              <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default HowItWorks;

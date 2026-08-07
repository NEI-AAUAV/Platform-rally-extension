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
      <h2 id="how-heading" className="rally-display mb-4 text-xl font-bold text-foreground">
        Como funciona
      </h2>
      <div className="flex flex-col gap-3">
        {steps.map((step) => (
          <div
            key={step.n}
            className="flex gap-3.5 rounded-[16px] border border-border bg-card p-[18px]"
          >
            <span className="rally-bg-accent-soft rally-display grid h-[42px] w-[42px] flex-shrink-0 place-items-center rounded-[12px] text-lg font-bold text-foreground">
              {step.n}
            </span>
            <div>
              <div className="text-[15px] font-bold text-foreground">{step.title}</div>
              <div className="mt-0.5 text-sm leading-[1.45] text-muted-foreground">{step.body}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default HowItWorks;

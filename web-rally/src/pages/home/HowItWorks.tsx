const STEPS = [
  {
    n: "1",
    title: "Entra com a equipa",
    body: "Usa o código da tua equipa para aceder ao percurso e ao progresso ao vivo.",
  },
  {
    n: "2",
    title: "Percorre os postos",
    body: "Vai a cada tasca, completa o desafio e faz check-in com o QR code.",
  },
  {
    n: "3",
    title: "Sobe na classificação",
    body: "Cada posto soma pontos. Acompanha a pontuação e luta pelo pódio.",
  },
];

/** Three-step explainer matching the prototype composition. */
export function HowItWorks() {
  return (
    <section aria-labelledby="how-heading">
      <h2
        id="how-heading"
        className="rally-display text-xl font-bold text-foreground mb-4"
      >
        Como funciona
      </h2>
      <div className="flex flex-col gap-3">
        {STEPS.map((step) => (
          <div key={step.n} className="flex gap-3.5 p-[18px] rounded-[16px] bg-card border border-border">
            <span className="grid place-items-center h-[42px] w-[42px] rounded-[12px] rally-bg-accent-soft rally-accent rally-display font-bold text-lg flex-shrink-0">
              {step.n}
            </span>
            <div>
              <div className="font-bold text-[15px] text-foreground">{step.title}</div>
              <div className="text-sm text-muted-foreground mt-0.5 leading-[1.45]">{step.body}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default HowItWorks;

import { useState } from "react";
import { HelpCircle, ChevronDown, FileDown } from "lucide-react";
import useRallySettings from "@/hooks/useRallySettings";
import { PageHeader } from "@/components/shared";
import { cn } from "@/lib/utils";
import { ruleSectionIcon } from "@/lib/ruleSectionIcons";

/** Shown until an admin authors at least one section in Settings → Regras. */
const STARTER_SECTIONS = [
  {
    id: "how",
    title: "Como funciona",
    icon: "MapPin",
    body: "Cada equipa percorre os postos do rally. Em cada posto há uma ou mais atividades avaliadas pelo staff, que somam pontos à classificação da equipa.",
  },
  {
    id: "score",
    title: "Pontuação",
    icon: "Trophy",
    body: "A pontuação de cada equipa resulta das atividades concluídas em cada posto. A classificação atualiza em tempo real no leaderboard.",
  },
  {
    id: "checkin",
    title: "Check-in nos postos",
    icon: "QrCode",
    body: "Em alguns postos, a equipa faz check-in lendo o código QR apresentado pelo staff — ou o staff lê o código da equipa. Confirma a chegada da equipa ao posto.",
  },
] as const;

/**
 * Public rules / FAQ. Fully admin-authored: every section (title, icon,
 * body) comes straight from settings.rules_sections, edited in
 * Settings → Regras. No hardcoded copy or live-computed text here — a
 * starter list only fills in before an admin has written anything.
 */
export default function Rules() {
  const { settings } = useRallySettings();
  const [open, setOpen] = useState<string | null>(null);

  const sections =
    settings?.rules_sections && settings.rules_sections.length > 0
      ? settings.rules_sections
      : STARTER_SECTIONS;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Antes de começar"
        icon={HelpCircle}
        title="Regras & FAQ"
        description="Como decorre o rally, como se pontua e o que precisas de saber."
      />

      {settings?.rules_pdf_url && (
        <div className="rally-surface space-y-3 rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <span className="rally-bg-accent-soft grid h-9 w-9 shrink-0 place-items-center rounded-lg">
              <FileDown className="rally-accent h-4 w-4" />
            </span>
            <span className="flex-1">
              <span className="block font-semibold text-foreground">Regulamento oficial</span>
              <span className="block text-sm text-muted-foreground">Documento completo em PDF</span>
            </span>
            <a
              href={settings.rules_pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rally-accent shrink-0 text-sm font-medium underline underline-offset-2"
            >
              Abrir numa nova aba
            </a>
          </div>
          <iframe
            src={settings.rules_pdf_url}
            title="Regulamento oficial (PDF)"
            className="h-[70vh] w-full rounded-xl border border-border"
          />
        </div>
      )}

      <div className="space-y-3">
        {sections.map(({ id, title, icon, body }) => {
          const isOpen = open === id;
          const Icon = ruleSectionIcon(icon);
          return (
            <div key={id} className="rally-surface overflow-hidden rounded-2xl">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-accent/40"
              >
                <span className="rally-bg-accent-soft grid h-9 w-9 shrink-0 place-items-center rounded-lg">
                  <Icon className="rally-accent h-4 w-4" />
                </span>
                <span className="flex-1 font-semibold text-foreground">{title}</span>
                <ChevronDown
                  className={cn(
                    "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </button>
              {isOpen && (
                <div className="border-t border-border px-5 py-4">
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{body}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rally-surface flex items-start gap-3 rounded-2xl p-6">
        <HelpCircle className="rally-accent mt-0.5 h-5 w-5 shrink-0" />
        <p className="text-sm text-muted-foreground">
          Dúvidas durante o evento? Fala com o staff no posto mais próximo ou com a organização do
          NEI.
        </p>
      </div>
    </div>
  );
}

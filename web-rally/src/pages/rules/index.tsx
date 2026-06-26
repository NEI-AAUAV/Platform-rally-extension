import { useState } from "react";
import {
  Trophy,
  MapPin,
  Swords,
  Award,
  QrCode,
  HelpCircle,
  ChevronDown,
} from "lucide-react";
import type { ComponentType } from "react";
import useRallySettings from "@/hooks/useRallySettings";
import { useThemedComponents } from "@/components/themes";
import { PageHeader } from "@/components/shared";
import { cn } from "@/lib/utils";

interface RuleSection {
  readonly id: string;
  readonly title: string;
  readonly Icon: ComponentType<{ className?: string }>;
  readonly body: React.ReactNode;
  readonly show: boolean;
}

/**
 * Public rules / FAQ. Copy is driven by the live event settings where possible
 * (scoring values, versus availability, score visibility) so it stays accurate
 * per edition. Rally soft-depth styling, accent accents.
 */
export default function Rules() {
  const { settings } = useRallySettings();
  const { Card } = useThemedComponents();
  const [open, setOpen] = useState<string | null>("how");

  const hasTascaMechanics =
    (settings?.penalty_per_puke ?? 0) !== 0 ||
    (settings?.bonus_per_extra_shot ?? 0) !== 0 ||
    (settings?.penalty_per_not_drinking ?? 0) !== 0;

  const sections: RuleSection[] = [
    {
      id: "how",
      title: "Como funciona",
      Icon: MapPin,
      show: true,
      body: (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Cada equipa percorre os postos do rally. Em cada posto há uma ou mais
            atividades avaliadas pelo staff, que somam pontos à classificação da
            equipa.
          </p>
          <p>
            {settings?.checkpoint_order_matters
              ? "Os postos devem ser visitados pela ordem definida."
              : "Os postos podem ser visitados por qualquer ordem."}
          </p>
        </div>
      ),
    },
    {
      id: "score",
      title: "Pontuação",
      Icon: Trophy,
      show: true,
      body: (
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            A pontuação de cada equipa resulta das atividades concluídas em cada
            posto. A classificação atualiza em tempo real
            {settings?.show_live_leaderboard === false
              ? ", mas o leaderboard ao vivo pode estar oculto pelo organizador."
              : " no leaderboard."}
          </p>
          {hasTascaMechanics && (
            <ul className="space-y-1.5">
              {(settings?.bonus_per_extra_shot ?? 0) > 0 && (
                <li>
                  <span className="rally-accent font-semibold">
                    +{settings?.bonus_per_extra_shot}
                  </span>{" "}
                  por cada shot extra (até {settings?.max_extra_shots_per_member} por membro).
                </li>
              )}
              {(settings?.penalty_per_puke ?? 0) !== 0 && (
                <li>
                  <span className="font-semibold text-destructive">
                    {settings?.penalty_per_puke}
                  </span>{" "}
                  por cada vómito.
                </li>
              )}
              {(settings?.penalty_per_not_drinking ?? 0) !== 0 && (
                <li>
                  <span className="font-semibold text-destructive">
                    {settings?.penalty_per_not_drinking}
                  </span>{" "}
                  por cada membro que não bebe.
                </li>
              )}
            </ul>
          )}
        </div>
      ),
    },
    {
      id: "versus",
      title: "Modo Versus",
      Icon: Swords,
      show: settings?.enable_versus === true,
      body: (
        <p className="text-sm text-muted-foreground">
          Em determinados postos, equipas enfrentam-se diretamente. O resultado
          do confronto influencia a pontuação de ambas as equipas.
        </p>
      ),
    },
    {
      id: "badges",
      title: "Distintivos",
      Icon: Award,
      show: true,
      body: (
        <p className="text-sm text-muted-foreground">
          As equipas ganham distintivos por feitos especiais durante o rally
          (vitórias em versus, rapidez, liderança). Aparecem no perfil da equipa.
        </p>
      ),
    },
    {
      id: "checkin",
      title: "Check-in nos postos",
      Icon: QrCode,
      show: true,
      body: (
        <p className="text-sm text-muted-foreground">
          Em alguns postos, a equipa faz check-in lendo o código QR apresentado
          pelo staff — ou o staff lê o código da equipa. Confirma a chegada da
          equipa ao posto.
        </p>
      ),
    },
  ].filter((s) => s.show);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Regras & FAQ"
        description="Como decorre o rally, como se pontua e o que precisas de saber."
      />

      <div className="space-y-3">
        {sections.map(({ id, title, Icon, body }) => {
          const isOpen = open === id;
          return (
            <Card key={id} variant="default" padding="none" rounded="2xl" className="overflow-hidden">
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
              {isOpen && <div className="border-t border-border px-5 py-4">{body}</div>}
            </Card>
          );
        })}
      </div>

      <Card variant="default" padding="lg" rounded="2xl" className="flex items-start gap-3">
        <HelpCircle className="rally-accent mt-0.5 h-5 w-5 shrink-0" />
        <p className="text-sm text-muted-foreground">
          Dúvidas durante o evento? Fala com o staff no posto mais próximo ou com
          a organização do NEI.
        </p>
      </Card>
    </div>
  );
}

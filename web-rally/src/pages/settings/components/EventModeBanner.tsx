/**
 * Says which game the current event is, at the top of the settings page.
 *
 * `event_type` is chosen once when the event is created and then never shown
 * again, which leaves an admin reading two dozen switches with no idea which of
 * them the format actually cares about. This states the format and the one
 * consequence that explains most of the settings below it.
 */
import { Compass, Info } from "lucide-react";
import { EVENT_TYPE_LABELS, type EventType } from "@/types/event";

const MODE_SUMMARY: Record<EventType, string> = {
  peddy_paper:
    "O local de cada posto é a resposta do enigma: a rota fica tapada até a equipa confirmar a chegada ao posto. As pistas e a desistência são as saídas para quem encalha.",
  rally_tascas:
    "Percurso de tascas com staff em cada paragem: a rota é conhecida e a pontuação vem das provas e das mecânicas de bebida.",
  generic: "Jogo de postos genérico — liga apenas as mecânicas que este evento precisa.",
  olympic: "Competição por estações, pontuada prova a prova.",
};

type EventModeBannerProps = Readonly<{
  eventType?: string | null;
  eventProfile?: string | null;
}>;

const PROFILE_LABELS: Record<string, string> = {
  autonomous: "Autónomo",
  guided: "Guiado",
  staffed: "Com staff",
  self_checkin: "Auto check-in",
  rotation: "Rotação",
  custom: "Personalizado",
};

export default function EventModeBanner({ eventType, eventProfile }: EventModeBannerProps) {
  const isKnown = !!eventType && eventType in EVENT_TYPE_LABELS;
  if (!isKnown) return null;

  const type = eventType as EventType;

  return (
    <div className="rally-bg-accent-soft flex items-start gap-3 rounded-xl border border-border p-4">
      <Compass className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="space-y-1">
        <p className="text-sm font-semibold">
          Este evento corre como{" "}
          <strong>
            {EVENT_TYPE_LABELS[type]}
            {eventProfile ? ` · ${PROFILE_LABELS[eventProfile] ?? eventProfile}` : ""}
          </strong>
        </p>
        <p className="text-sm text-muted-foreground">{MODE_SUMMARY[type]}</p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Info className="h-3 w-3 shrink-0" />O perfil define capacidades obrigatórias, opcionais e
          indisponíveis. A verificação de configuração mostra os dados que ainda faltam.
        </p>
      </div>
    </div>
  );
}

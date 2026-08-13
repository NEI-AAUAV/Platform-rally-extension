/**
 * The switches that turn a route into a treasure hunt.
 *
 * These used to be split between the display card (redaction, participant view)
 * and the scoring card (GPS, hints, skips), which meant nobody could see the
 * mechanic whole. They belong together: redaction is what makes a clue a puzzle,
 * GPS check-in is the only proof of arrival that redaction leaves available, and
 * hints and skips are the two exits for a team that cannot solve it.
 */
import { MapPinned } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { SettingNumber, SettingSwitch, SettingsCard } from "./SettingFields";

type PeddyPaperSettingsProps = Readonly<{
  className?: string;
  disabled?: boolean;
}>;

export default function PeddyPaperSettings({
  className = "",
  disabled = false,
}: PeddyPaperSettingsProps) {
  const { watch } = useFormContext();
  const hintsEnabled = watch("hints_enabled");
  const skipEnabled = watch("skip_enabled");

  return (
    <SettingsCard
      className={className}
      title="Enigmas e chegadas"
      description="Como a equipa descobre o próximo posto e prova que lá chegou"
      icon={<MapPinned className="h-5 w-5" />}
    >
      <SettingSwitch
        name="reveal_next_checkpoint"
        label="Revelar o próximo posto antes da chegada"
        defaultValue={true}
        disabled={disabled}
        help="Desliga num peddy paper: o local do próximo posto é a resposta do enigma, por isso nome, descrição e coordenadas ficam escondidos até a equipa fazer check-in. Só a pista é enviada."
      />

      <SettingSwitch
        name="gps_checkin_enabled"
        label="Check-in por GPS feito pela equipa"
        disabled={disabled}
        help="Com a rota tapada, é a única prova de chegada que a equipa consegue dar sozinha. Requer coordenadas e raio de chegada definidos em cada posto."
      />

      <SettingSwitch
        name="guide_manual_arrival_enabled"
        label="Guias podem marcar chegadas"
        defaultValue={true}
        disabled={disabled}
        help="A alternativa ao check-in por GPS quando este falha — sem bateria, sem rede, ou dentro de um edifício."
      />

      <SettingSwitch
        name="reveal_on_arrival"
        label="Revelar o posto ao chegar"
        defaultValue={true}
        disabled={disabled}
        help="Ligado, chegar ao posto revela-o mesmo antes de o staff avaliar a prova. Desligado, só é revelado depois da avaliação."
      />

      <SettingSwitch
        name="participant_view_enabled"
        label="Ativar visualização para participantes"
        disabled={disabled}
        help="Manda as equipas para o ecrã de percurso (pista, check-in, pistas pagas) em vez do placar."
      />

      <div className="space-y-4 rounded-xl border border-border p-4">
        <p className="text-sm font-medium">Saídas para quem encalha</p>
        <p className="text-xs text-muted-foreground">
          Custo 0 torna a saída gratuita; desligar o interruptor remove-a por completo. São coisas
          diferentes.
        </p>

        <SettingSwitch
          name="hints_enabled"
          label="Permitir pedir pistas"
          defaultValue={true}
          disabled={disabled}
          help="A escada de indicações do posto, da mais vaga para a mais concreta, desbloqueada uma a uma."
        />
        {hintsEnabled && (
          <SettingNumber
            name="hint_penalty"
            label="Custo de uma pista"
            min={-100}
            max={0}
            disabled={disabled}
            help="Pontos perdidos por cada pista desbloqueada (deve ser negativo). 0 torna as pistas gratuitas."
          />
        )}

        <SettingSwitch
          name="skip_enabled"
          label="Permitir desistir de um posto"
          defaultValue={true}
          disabled={disabled}
          help="Desliga só se tiveres a certeza: sem esta saída, uma equipa que não resolva o enigma fica presa nesse posto até ao fim do evento."
        />
        {skipEnabled && (
          <SettingNumber
            name="skip_penalty"
            label="Custo de desistir de um posto"
            min={-100}
            max={0}
            disabled={disabled}
            help="A equipa não pontua o posto, paga isto e recebe a pista seguinte (deve ser negativo)."
          />
        )}
      </div>
    </SettingsCard>
  );
}

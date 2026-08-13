/**
 * What actually moves the score.
 *
 * This card used to hold every switch that was not obviously "display": GPS
 * check-in, compass, opening hours, route stages. Those moved to the cards that
 * name them. What is left is scoring, and the drinking half of it only applies
 * to the pub-crawl format.
 */
import { Target } from "lucide-react";
import { hasDrinkingMechanics } from "@/lib/eventTerms";
import { SettingNumber, SettingSwitch, SettingsCard } from "./SettingFields";

type ScoringSettingsProps = Readonly<{
  className?: string;
  disabled?: boolean;
  eventType?: string | null;
}>;

export default function ScoringSettings({
  className = "",
  disabled = false,
  eventType,
}: ScoringSettingsProps) {
  const showDrinking = hasDrinkingMechanics(eventType);

  return (
    <SettingsCard
      className={className}
      title="Pontuação"
      description="Penalizações e bónus aplicados à pontuação das equipas"
      icon={<Target className="h-5 w-5" />}
    >
      <SettingSwitch
        name="enable_staff_scoring"
        label="Permitir pontuação manual pelos staff"
        defaultValue={true}
        disabled={disabled}
        help="O staff no posto atribui os pontos da prova diretamente."
      />

      {showDrinking && (
        <div className="space-y-4 rounded-xl border border-border p-4">
          <div>
            <p className="text-sm font-medium">Mecânicas de bebida</p>
            <p className="text-xs text-muted-foreground">
              Só se aplicam ao formato de rally de tascas.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SettingNumber
              name="penalty_per_puke"
              label="Penalização por vómito"
              min={-100}
              max={0}
              disabled={disabled}
              help="Pontos perdidos por cada vómito (deve ser negativo)."
            />
            <SettingNumber
              name="penalty_per_not_drinking"
              label="Penalização por não beber"
              min={-100}
              max={0}
              disabled={disabled}
              help="Pontos perdidos por não beber obrigatório (deve ser negativo)."
            />
            <SettingNumber
              name="bonus_per_extra_shot"
              label="Bónus por shot extra"
              min={0}
              max={100}
              disabled={disabled}
              help="Pontos ganhos por cada shot extra."
            />
            <SettingNumber
              name="max_extra_shots_per_member"
              label="Máximo shots extra por membro"
              min={1}
              max={20}
              disabled={disabled}
              help="Número máximo de shots extra por membro da equipa."
            />
          </div>
        </div>
      )}
    </SettingsCard>
  );
}

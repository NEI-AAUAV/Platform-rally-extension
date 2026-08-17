/**
 * What actually moves the score.
 *
 * This group used to hold every switch that was not obviously "display": GPS
 * check-in, compass, opening hours, route stages. Those moved to the groups that
 * name them. What is left is scoring, and the drinking half of it only applies
 * to the pub-crawl format.
 */
import { Target } from "lucide-react";
import { hasDrinkingMechanics } from "@/lib/eventTerms";
import { SettingGroup, SettingNumber, SettingSubGroup, SettingSwitch } from "./SettingFields";

type ScoringSettingsProps = Readonly<{
  className?: string;
  eventType?: string | null;
}>;

export default function ScoringSettings({ className = "", eventType }: ScoringSettingsProps) {
  const showDrinking = hasDrinkingMechanics(eventType);

  return (
    <SettingGroup
      className={className}
      title="Pontuação"
      description="Penalizações e bónus aplicados à pontuação das equipas"
      icon={<Target className="h-4 w-4" />}
    >
      <SettingSwitch
        name="enable_staff_scoring"
        label="Permitir pontuação manual pelos staff"
        defaultValue={true}
        help="O staff no posto atribui os pontos da prova diretamente."
      />

      {showDrinking && (
        <SettingSubGroup
          title="Mecânicas de bebida"
          description="Só se aplicam ao formato de rally de tascas."
        >
          <SettingNumber
            name="penalty_per_puke"
            label="Penalização por vómito"
            min={-100}
            max={0}
            unit="pts"
            help="Pontos perdidos por cada vómito (deve ser negativo)."
          />
          <SettingNumber
            name="penalty_per_not_drinking"
            label="Penalização por não beber"
            min={-100}
            max={0}
            unit="pts"
            help="Pontos perdidos por não beber obrigatório (deve ser negativo)."
          />
          <SettingNumber
            name="bonus_per_extra_shot"
            label="Bónus por shot extra"
            min={0}
            max={100}
            unit="pts"
            help="Pontos ganhos por cada shot extra."
          />
          <SettingNumber
            name="max_extra_shots_per_member"
            label="Máximo shots extra por membro"
            min={1}
            max={20}
            help="Número máximo de shots extra por membro da equipa."
          />
        </SettingSubGroup>
      )}
    </SettingGroup>
  );
}

/**
 * What actually moves the score.
 *
 * This group used to hold every switch that was not obviously "display": GPS
 * check-in, compass, opening hours, route stages. Those moved to the groups that
 * name them. What is left is scoring, and the drinking half of it only applies
 * to the pub-crawl format.
 */
import { Target } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { hasDrinkingMechanics } from "@/lib/eventTerms";
import { SettingGroup, SettingNumber, SettingSubGroup, SettingSwitch } from "./SettingFields";
import { useEventConfiguration, useUpdateEventCapabilities } from "./useEventConfiguration";

type ScoringSettingsProps = Readonly<{
  className?: string;
  eventType?: string | null;
}>;

export default function ScoringSettings({ className = "", eventType }: ScoringSettingsProps) {
  const configQuery = useEventConfiguration();
  const updateCapabilities = useUpdateEventCapabilities();
  const drinkingCap = configQuery.data?.capabilities?.drinking_scoring;

  // If policy is explicitly defined, forbidden hides drinking mechanics entirely.
  // Otherwise, fallback to formatHasDrinkingMechanics.
  const isForbidden = drinkingCap
    ? drinkingCap.policy === "forbidden"
    : !hasDrinkingMechanics(eventType);
  const isOptional = drinkingCap?.policy === "optional";
  const isEffective = drinkingCap ? drinkingCap.effective : hasDrinkingMechanics(eventType);

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

      {!isForbidden && isOptional && (
        <div
          data-admin-search-key="drinking_scoring"
          className="flex items-start justify-between gap-4 py-3"
        >
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-2">
              <label htmlFor="drinking_scoring" className="text-sm font-medium leading-snug">
                Ativar mecânicas de bebida
              </label>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Opcional
              </span>
            </div>
            <p className="text-xs leading-snug text-muted-foreground">
              Ativa penalties de vómito, não beber e bónus de shots extra no percurso.
            </p>
          </div>
          <div className="mt-0.5 shrink-0">
            <Switch
              id="drinking_scoring"
              checked={drinkingCap.configured}
              disabled={updateCapabilities.isPending}
              onCheckedChange={(checked) => {
                updateCapabilities.mutate({ drinking_scoring: checked });
              }}
            />
          </div>
        </div>
      )}

      {!isForbidden && isEffective && (
        <SettingSubGroup
          title="Mecânicas de bebida"
          description="Penalizações e bónus aplicados às bebidas consumidas pelas equipas."
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

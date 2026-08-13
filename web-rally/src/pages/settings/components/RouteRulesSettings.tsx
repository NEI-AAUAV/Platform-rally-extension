/**
 * Rules about the shape of the route: what order it runs in, when each post is
 * open, and whether the walk between posts is itself scored.
 *
 * These sat in the scoring card, where "respeitar horários dos postos" read as a
 * points setting. Only the leg-time block below actually touches the score.
 */
import { Route } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { SettingNumber, SettingSwitch, SettingsCard } from "./SettingFields";

type RouteRulesSettingsProps = Readonly<{
  className?: string;
  disabled?: boolean;
}>;

export default function RouteRulesSettings({
  className = "",
  disabled = false,
}: RouteRulesSettingsProps) {
  const { watch } = useFormContext();
  const legTimeEnabled = watch("leg_time_scoring_enabled");

  return (
    <SettingsCard
      className={className}
      title="Regras da rota"
      description="Ordem, etapas, horários e tempo de percurso"
      icon={<Route className="h-5 w-5" />}
    >
      <SettingSwitch
        name="checkpoint_order_matters"
        label="A ordem dos postos importa"
        defaultValue={true}
        disabled={disabled}
        help="Ligado, a equipa tem de seguir a rota pela ordem definida. Desligado, pode apanhar os postos por qualquer ordem."
      />

      <SettingSwitch
        name="route_stages_enabled"
        label="Etapas da rota"
        disabled={disabled}
        help="Divide a rota em blocos com regras diferentes — ex: universidade por ordem, depois bares à escolha (3 de 5). Cria e configura as etapas na aba de Checkpoints. Sem etapas criadas, a rota corre como um bloco só e vale a regra acima. Desligar a meio do evento abre tudo sem apagar as etapas."
      />

      <SettingSwitch
        name="checkpoint_hours_enabled"
        label="Respeitar horários dos postos"
        defaultValue={true}
        disabled={disabled}
        help="Recusa check-ins fora da janela de cada posto. Desliga isto se um bar abriu mais cedo — é mais rápido do que limpar os horários um a um."
      />

      <div className="space-y-4 rounded-xl border border-border p-4">
        <SettingSwitch
          name="leg_time_scoring_enabled"
          label="Pontuar tempo de percurso entre postos"
          disabled={disabled}
          help="Ao chegar a um posto, compara o tempo desde a chegada anterior com o esperado e soma um bónus (mais rápida) ou penalização (mais lenta)."
        />

        {legTimeEnabled && (
          <div className="grid gap-4 sm:grid-cols-2">
            <SettingNumber
              name="leg_time_target_minutes"
              label="Tempo esperado entre postos (min)"
              min={1}
              max={240}
              disabled={disabled}
              help="Referência para calcular o bónus/penalização."
            />
            <SettingNumber
              name="leg_time_points_per_minute"
              label="Pontos por minuto de desvio"
              min={0}
              max={50}
              disabled={disabled}
              help="Por cada minuto mais rápido a equipa ganha isto; por cada minuto mais lento, perde isto. 0 desativa o efeito mesmo com o interruptor ligado."
            />
            <SettingNumber
              name="leg_time_max_adjustment"
              label="Limite do ajuste por percurso"
              min={0}
              max={500}
              disabled={disabled}
              help="Trava o bónus/penalização de cada percurso neste valor, para uma equipa que parou para jantar entre dois postos não disparar o placar."
            />
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

/**
 * Rules about the shape of the route: what order it runs in, when each post is
 * open, and whether the walk between posts is itself scored.
 *
 * These sat in the scoring card, where "respeitar horários dos postos" read as a
 * points setting. Only the leg-time group below actually touches the score, so
 * it is kept separate rather than nested in with the ordering rules.
 */
import { Clock, Route } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { SettingGroup, SettingNumber, SettingSwitch } from "./SettingFields";

type RouteRulesSettingsProps = Readonly<{
  className?: string;
}>;

export default function RouteRulesSettings({ className = "" }: RouteRulesSettingsProps) {
  const { watch } = useFormContext();
  const legTimeEnabled = watch("leg_time_scoring_enabled");

  return (
    <div className={className}>
      <div className="space-y-8">
        <SettingGroup
          title="Ordem e horários"
          description="Por que ordem a rota corre e quando cada posto aceita chegadas"
          icon={<Route className="h-4 w-4" />}
        >
          <SettingSwitch
            name="checkpoint_order_matters"
            label="A ordem dos postos importa"
            defaultValue={true}
            help="Ligado, a equipa tem de seguir a rota pela ordem definida. Desligado, pode apanhar os postos por qualquer ordem."
          />
          <SettingSwitch
            name="route_stages_enabled"
            label="Etapas da rota"
            help="Divide a rota em blocos com regras diferentes — ex: universidade por ordem, depois bares à escolha (3 de 5). Cria e configura as etapas na aba de Checkpoints. Sem etapas criadas, a rota corre como um bloco só e vale a regra acima. Desligar a meio do evento abre tudo sem apagar as etapas."
          />
          <SettingSwitch
            name="checkpoint_hours_enabled"
            label="Respeitar horários dos postos"
            defaultValue={true}
            help="Recusa check-ins fora da janela de cada posto. Desliga isto se um bar abriu mais cedo — é mais rápido do que limpar os horários um a um."
          />
        </SettingGroup>

        <SettingGroup
          title="Tempo de percurso"
          description="Pontuar o caminho entre dois postos, não só o que acontece neles"
          icon={<Clock className="h-4 w-4" />}
        >
          <SettingSwitch
            name="leg_time_scoring_enabled"
            label="Pontuar tempo de percurso entre postos"
            help="Ao chegar a um posto, compara o tempo desde a chegada anterior com o esperado e soma um bónus (mais rápida) ou penalização (mais lenta)."
          />

          {legTimeEnabled && (
            <>
              <SettingNumber
                name="leg_time_target_minutes"
                label="Tempo esperado entre postos (min)"
                min={1}
                max={240}
                help="Referência para calcular o bónus/penalização."
              />
              <SettingNumber
                name="leg_time_points_per_minute"
                label="Pontos por minuto de desvio"
                min={0}
                max={50}
                help="Por cada minuto mais rápido a equipa ganha isto; por cada minuto mais lento, perde isto. 0 desativa o efeito mesmo com o interruptor ligado."
              />
              <SettingNumber
                name="leg_time_max_adjustment"
                label="Limite do ajuste por percurso"
                min={0}
                max={500}
                help="Trava o bónus/penalização de cada percurso neste valor, para uma equipa que parou para jantar entre dois postos não disparar o placar."
              />
            </>
          )}
        </SettingGroup>
      </div>
    </div>
  );
}

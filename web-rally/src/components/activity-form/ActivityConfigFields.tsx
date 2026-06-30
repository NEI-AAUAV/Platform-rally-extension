import type { ReactNode } from "react";
import { ActivityType } from "@/types/activityTypes";
import { ConfigNumberField, type ConfigValue } from "./ConfigNumberField";

interface ConfigSectionProps {
  title: string;
  children: ReactNode;
}

function ConfigSection({ title, children }: ConfigSectionProps) {
  return (
    <div className="space-y-4 p-4 bg-muted border border-border rounded-lg">
      <h4 className="font-medium text-foreground">{title}</h4>
      {children}
    </div>
  );
}

interface ActivityConfigFieldsProps {
  activityType: ActivityType;
  configData: Record<string, ConfigValue>;
  updateConfig: (key: string, value: number) => void;
}

export function ActivityConfigFields({
  activityType,
  configData,
  updateConfig,
}: ActivityConfigFieldsProps) {
  const field = (
    id: string,
    label: string,
    configKey: string,
    defaultValue: number,
    placeholder: string,
    extra?: { helpText?: string; testId?: string },
  ) => (
    <ConfigNumberField
      id={id}
      label={label}
      configKey={configKey}
      value={configData[configKey]}
      defaultValue={defaultValue}
      placeholder={placeholder}
      onChange={updateConfig}
      helpText={extra?.helpText}
      testId={extra?.testId}
    />
  );

  switch (activityType) {
    case ActivityType.TIME_BASED:
      return (
        <ConfigSection title="Configurações de Atividade Baseada em Tempo">
          <div className="grid grid-cols-2 gap-4">
            {field("config-tb-max-points", "Pontos Máximos (1º lugar)", "max_points", 100, "100")}
            {field("config-tb-min-points", "Pontos Mínimos (último lugar)", "min_points", 10, "10")}
          </div>
        </ConfigSection>
      );

    case ActivityType.SCORE_BASED:
      return (
        <ConfigSection title="Configurações de Atividade Baseada em Pontuação">
          <div className="grid grid-cols-2 gap-4">
            {field("config-sb-max-points", "Pontuação Máxima", "max_points", 100, "100")}
            {field("config-sb-base-score", "Pontuação Base", "base_score", 50, "50")}
          </div>
        </ConfigSection>
      );

    case ActivityType.BOOLEAN:
      return (
        <ConfigSection title="Configurações de Atividade Sim/Não">
          <div className="grid grid-cols-2 gap-4">
            {field("config-bool-success", "Pontos por Sucesso", "success_points", 100, "100")}
            {field("config-bool-failure", "Pontos por Falha", "failure_points", 0, "0")}
          </div>
        </ConfigSection>
      );

    case ActivityType.GENERAL:
      return (
        <ConfigSection title="Configurações de Atividade Geral">
          <div className="grid grid-cols-3 gap-4">
            {field("config-gen-min-points", "Pontos Mínimos", "min_points", 0, "0")}
            {field("config-gen-max-points", "Pontos Máximos", "max_points", 100, "100")}
            {field("config-gen-default-points", "Pontos Padrão", "default_points", 50, "50")}
          </div>
        </ConfigSection>
      );

    case ActivityType.TEAM_VS:
      return (
        <ConfigSection title="Configurações de Atividade Equipa vs Equipa">
          <div className="space-y-4">
            <div className="border-b border-border pb-4 mb-4">
              <h5 className="text-sm font-medium text-muted-foreground mb-3">
                Pontuação Tiered (Opcional)
              </h5>
              <div className="grid grid-cols-2 gap-4">
                {field("config-tv-base-points", "Pontos Base (Participação)", "base_points", 0, "0", {
                  helpText: "Pontos dados apenas por participar",
                  testId: "input-base-points",
                })}
                {field("config-tv-completion-points", "Pontos por Completar", "completion_points", 0, "0", {
                  helpText: "Bônus por completar o desafio",
                  testId: "input-completion-points",
                })}
              </div>
            </div>

            <div className="space-y-3">
              <h5 className="text-sm font-medium text-muted-foreground">Pontuação do Resultado</h5>
              {field("config-tv-win-points", "Pontos por Vitória", "win_points", 100, "100", {
                testId: "input-win-points",
              })}
              {field("config-tv-draw-points", "Pontos por Empate", "draw_points", 50, "50")}
              {field("config-tv-lose-points", "Pontos por Derrota", "lose_points", 0, "0")}
            </div>
          </div>
        </ConfigSection>
      );

    case ActivityType.DEFERRED_JUDGED:
      return (
        <ConfigSection title="Configurações de Avaliação Posterior">
          <div className="grid grid-cols-2 gap-4">
            {field("config-dj-min-points", "Pontos Mínimos", "min_points", 0, "0")}
            {field("config-dj-max-points", "Pontos Máximos", "max_points", 100, "100")}
          </div>
        </ConfigSection>
      );

    default:
      return null;
  }
}

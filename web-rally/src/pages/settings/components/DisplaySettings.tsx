/**
 * What participants and the public get to see.
 *
 * Ten switches in one column was the worst offender on the old page: the two
 * guide-mode gates read as unrelated to each other, and the access switch sat
 * between feature kill-switches. Grouped by who is looking and at what.
 */
import { Lock, Map, Puzzle, Trophy } from "lucide-react";
import { SettingGroup, SettingSelect, SettingSwitch } from "./SettingFields";

type DisplaySettingsProps = Readonly<{
  className?: string;
}>;

const ROUTE_MODE_OPTIONS = [
  { value: "focused", label: "Apenas próximo posto" },
  { value: "complete", label: "Trajeto completo" },
] as const;

const SCORE_MODE_OPTIONS = [
  { value: "hidden", label: "Oculto" },
  { value: "individual", label: "Apenas própria pontuação" },
  { value: "competitive", label: "Classificação completa" },
] as const;

export default function DisplaySettings({ className = "" }: DisplaySettingsProps) {
  return (
    <div className={className}>
      <div className="space-y-8">
        <SettingGroup
          title="Pontuações"
          description="Quanto do placar as equipas conseguem ver"
          icon={<Trophy className="h-4 w-4" />}
        >
          <SettingSelect
            name="show_score_mode"
            label="Modo de Visualização da Pontuação"
            defaultValue="hidden"
            options={SCORE_MODE_OPTIONS}
            help="Controla o que as equipas veem das pontuações"
          />
          <SettingSwitch
            name="show_live_leaderboard"
            label="Mostrar leaderboard em tempo real"
            defaultValue={true}
          />
          <SettingSwitch
            name="show_team_details"
            label="Mostrar detalhes das equipas"
            defaultValue={true}
          />
        </SettingGroup>

        <SettingGroup
          title="Mapa e trajeto"
          description="O que aparece no mapa das equipas"
          icon={<Map className="h-4 w-4" />}
        >
          <SettingSelect
            name="show_route_mode"
            label="Modo de Visualização do Trajeto"
            defaultValue="focused"
            options={ROUTE_MODE_OPTIONS}
            help="Controla o que as equipas veem do trajeto"
          />
          <SettingSwitch
            name="show_checkpoint_map"
            label="Mostrar mapa dos checkpoints"
            defaultValue={true}
          />
          {/* "Revelar o próximo posto" and "visualização para participantes"
              live in the Jogo section: they define the treasure-hunt mechanic
              rather than merely styling what is on screen. */}
        </SettingGroup>

        <SettingGroup
          title="Acesso"
          description="Quem consegue abrir as páginas do rally"
          icon={<Lock className="h-4 w-4" />}
        >
          <SettingSwitch name="public_access_enabled" label="Permitir acesso público (sem login)" />
        </SettingGroup>

        <SettingGroup
          title="Funcionalidades"
          description="Interruptores gerais de módulos do rally"
          icon={<Puzzle className="h-4 w-4" />}
        >
          <SettingSwitch
            name="guide_mode_enabled"
            label="Ativar funcionalidade de modo guia"
            help="Liga o módulo. Sem isto, o interruptor abaixo não tem efeito."
          />
          <SettingSwitch
            name="guide_mode_active"
            label="Modo guia ativo neste evento"
            help="Põe o modo guia a correr neste evento em concreto."
          />
          <SettingSwitch
            name="badges_enabled"
            label="Ativar crachás / conquistas"
            defaultValue={true}
          />
          <SettingSwitch
            name="allow_photo_as_team_photo"
            label="Permitir staff definir foto de atividade como foto da equipa"
          />
        </SettingGroup>
      </div>
    </div>
  );
}

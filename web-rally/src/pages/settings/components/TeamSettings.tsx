import { Users } from "lucide-react";
import { SettingGroup, SettingNumber, SettingSwitch } from "./SettingFields";

type TeamSettingsProps = Readonly<{
  className?: string;
}>;

export default function TeamSettings({ className = "" }: TeamSettingsProps) {
  return (
    <SettingGroup
      className={className}
      title="Gestão de Equipas"
      description="Configurações relacionadas com equipas e membros"
      icon={<Users className="h-4 w-4" />}
    >
      <SettingNumber name="max_teams" label="Número máximo de equipas" min={1} max={100} />
      <SettingNumber
        name="max_members_per_team"
        label="Máximo de membros por equipa"
        min={1}
        max={50}
      />
      <SettingSwitch
        name="enable_versus"
        label="Ativar modo versus (competição entre equipas)"
        help="As equipas competem diretamente umas contra as outras."
      />
      <SettingSwitch
        name="allow_staff_registration"
        label="Inscrições no local pelo staff"
        help="Permite ao staff acrescentar membros a uma equipa durante o evento, para quem apareça sem se ter inscrito antes."
      />
    </SettingGroup>
  );
}

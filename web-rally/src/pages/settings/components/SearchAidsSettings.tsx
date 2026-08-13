/**
 * Navigation aids for teams who do not know the city.
 *
 * Every one of these is a deliberate compromise: they help someone who is lost
 * without handing over the coordinates the clue is protecting. Grouped so that
 * tension is visible in one place rather than scattered among scoring switches.
 */
import { Radar } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { SettingNumber, SettingSwitch, SettingsCard } from "./SettingFields";

type SearchAidsSettingsProps = Readonly<{
  className?: string;
  disabled?: boolean;
}>;

export default function SearchAidsSettings({
  className = "",
  disabled = false,
}: SearchAidsSettingsProps) {
  const { watch } = useFormContext();
  const proximityEnabled = watch("proximity_enabled");

  return (
    <SettingsCard
      className={className}
      title="Ajudas de busca"
      description="Aproximar a equipa do posto sem entregar o sítio"
      icon={<Radar className="h-5 w-5" />}
    >
      <SettingSwitch
        name="proximity_enabled"
        label="Botão: estou perto?"
        disabled={disabled}
        help="Dá à equipa uma banda de distância (por exemplo, menos de 500m), nunca metros exatos nem coordenadas."
      />

      <SettingSwitch
        name="compass_enabled"
        label="Bússola (só muito perto)"
        disabled={disabled}
        help={
          proximityEnabled
            ? "Acrescenta uma direção em 8 setores, e só quando a equipa já está dentro da banda mais próxima. Um rumo preciso, tirado de dois sítios, dava o ponto exato — por isso é grosseiro e tardio."
            : "Depende do botão de proximidade acima, que está desligado — liga-o para a bússola ter efeito."
        }
      />

      <SettingNumber
        name="search_radius_m"
        label="Raio da zona de busca (metros)"
        min={0}
        max={5000}
        disabled={disabled}
        help="Desenha no mapa um círculo onde o posto está algures. 0 não mostra círculo nenhum. O círculo não está centrado no posto, de propósito."
      />
    </SettingsCard>
  );
}

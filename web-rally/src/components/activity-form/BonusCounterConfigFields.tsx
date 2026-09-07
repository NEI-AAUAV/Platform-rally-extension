import CounterConfigFields from "@/components/activity-form/CounterConfigFields";
import type { BonusCounterConfig } from "@/lib/penaltyCounters";

type Props = Readonly<{
  counters: readonly BonusCounterConfig[];
  onChange: (counters: BonusCounterConfig[]) => void;
}>;

/** Per-activity "each X earns Y points" counters — e.g. "cada momento de
 * performance". Stored in `config.bonus_counters`; the staff evaluation form
 * renders one count input per entry (see BonusesFieldset), and the summed
 * award is truncated by `config.max_bonus_points`.
 *
 * This is what makes a pass/fail challenge tie-breakable: "completou = 5
 * pontos, mais até 5 pontos por performance". */
export default function BonusCounterConfigFields({ counters, onChange }: Props) {
  return (
    <CounterConfigFields
      counters={counters}
      onChange={onChange}
      copy={{
        idPrefix: "bonus-counter",
        title: "Contadores de bónus (opcional)",
        description:
          "Pontos extra que o staff pode atribuir por performance — úteis para desempatar equipas que completaram o desafio na mesma. O total é limitado pelo máximo definido abaixo.",
        labelFieldLabel: "Nome do bónus",
        pointsFieldLabel: "Pontos por ocorrência",
        labelPlaceholder: "Ex: Performance",
        addButtonLabel: "Adicionar bónus",
        removeButtonLabel: (name) => `Remover bónus ${name}`,
      }}
    />
  );
}

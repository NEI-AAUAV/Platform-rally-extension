import CounterConfigFields from "@/components/activity-form/CounterConfigFields";
import type { PenaltyCounterConfig } from "@/lib/penaltyCounters";

type Props = Readonly<{
  counters: readonly PenaltyCounterConfig[];
  onChange: (counters: PenaltyCounterConfig[]) => void;
}>;

/** Any per-activity "each miss costs X points" counters — e.g. "cada falha
 * na baliza". Stored in `config.penalty_counters`; the staff evaluation form
 * renders one count input per entry alongside the built-in vomit/not-drinking
 * ones (see PenaltiesFieldset). */
export default function PenaltyCounterConfigFields({ counters, onChange }: Props) {
  return (
    <CounterConfigFields
      counters={counters}
      onChange={onChange}
      copy={{
        idPrefix: "penalty-counter",
        title: "Contadores de falhas (opcional)",
        description:
          'Para desafios do tipo "cada falha bebe": o staff regista quantas vezes aconteceu, e cada uma desconta os pontos definidos aqui.',
        labelFieldLabel: "Nome",
        pointsFieldLabel: "Pontos cada",
        labelPlaceholder: "Ex: Falha na baliza",
        addButtonLabel: "Adicionar contador",
        removeButtonLabel: (name) => `Remover contador ${name}`,
      }}
    />
  );
}

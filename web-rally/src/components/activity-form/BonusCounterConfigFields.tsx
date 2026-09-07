import CounterConfigFields from "@/components/activity-form/CounterConfigFields";
import { Input } from "@/components/ui/input";
import type { BonusCounterConfig } from "@/lib/penaltyCounters";

type Props = Readonly<{
  counters: readonly BonusCounterConfig[];
  onChange: (counters: BonusCounterConfig[]) => void;
  /** Ceiling on the summed bonus; undefined inherits the event's default. */
  maxBonusPoints?: number;
  onMaxBonusPointsChange: (value: number | undefined) => void;
}>;

/** Per-activity "each X earns Y points" counters — e.g. "cada momento de
 * performance". Stored in `config.bonus_counters`; the staff evaluation form
 * renders one count input per entry (see BonusesFieldset), and the summed
 * award is truncated by `config.max_bonus_points`.
 *
 * This is what makes a pass/fail challenge tie-breakable: "completou = 5
 * pontos, mais até 5 pontos por performance".
 *
 * The ceiling lives here rather than loose at the bottom of the form, next to
 * the counters it actually limits. Leaving it empty inherits the event-wide
 * default from Admin → Pontuação; a 0 is a real ceiling, not "unset". */
export default function BonusCounterConfigFields({
  counters,
  onChange,
  maxBonusPoints,
  onMaxBonusPointsChange,
}: Props) {
  return (
    <div className="space-y-3">
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
      >
        <div className="w-full max-w-xs">
          <label htmlFor="max-bonus-points" className="mb-1 block text-xs text-muted-foreground">
            Máximo de pontos de bónus (opcional)
          </label>
          <Input
            id="max-bonus-points"
            type="number"
            min={0}
            value={maxBonusPoints ?? ""}
            placeholder="Teto do evento"
            onChange={(e) => {
              const raw = e.target.value;
              onMaxBonusPointsChange(raw === "" ? undefined : Number.parseInt(raw, 10) || 0);
            }}
            className="border-border bg-card"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Em branco usa o teto definido em Pontuação, para todo o evento.
          </p>
        </div>
      </CounterConfigFields>
    </div>
  );
}

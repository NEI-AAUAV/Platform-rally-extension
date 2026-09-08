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
 * renders one count input per entry (see BonusesFieldset).
 *
 * Two independent ceilings, and conflating them is what the per-counter field
 * exists to fix: each entry's own `max_points` caps what that single bónus may
 * ever award (the staff input stops there), while `config.max_bonus_points`
 * below caps the sum of all of them.
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
            "Pontos extra que o staff pode atribuir por performance — úteis para desempatar equipas que completaram o desafio na mesma. Cada bónus pode ter o seu próprio limite; o somatório de todos é ainda limitado pelo máximo definido abaixo.",
          labelFieldLabel: "Nome do bónus",
          pointsFieldLabel: "Pontos por ocorrência",
          maxPointsFieldLabel: "Máx. deste bónus",
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

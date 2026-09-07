import type { BonusCounterConfig } from "@/lib/penaltyCounters";

type BonusMap = { [key: string]: number };

interface BonusesFieldsetProps {
  idPrefix: string;
  bonuses: BonusMap;
  onChange: (value: BonusMap) => void;
  /** This activity's own counters (e.g. "cada momento de performance"). */
  bonusCounters?: readonly BonusCounterConfig[];
  /** Counters that apply at every checkpoint (admin-defined). */
  globalBonusCounters?: readonly BonusCounterConfig[];
  /** Ceiling on the summed bonus; undefined means uncapped. */
  maxBonusPoints?: number;
}

interface CounterRowProps {
  idPrefix: string;
  counter: BonusCounterConfig;
  bonuses: BonusMap;
  onChange: (value: BonusMap) => void;
}

function CounterRow({ idPrefix, counter, bonuses, onChange }: Readonly<CounterRowProps>) {
  return (
    <div className="flex items-center space-x-3">
      <input
        id={`${idPrefix}-${counter.key}`}
        type="number"
        min="0"
        value={bonuses[counter.key] || 0}
        onChange={(e) =>
          onChange({ ...bonuses, [counter.key]: Number.parseInt(e.target.value, 10) || 0 })
        }
        className="w-20 rounded border border-border bg-muted p-2 text-foreground focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
        placeholder="0"
        aria-label={`Contagem de ${counter.label}`}
      />
      <label htmlFor={`${idPrefix}-${counter.key}`} className="text-sm text-muted-foreground">
        {counter.label} (+{Math.abs(counter.points)} pts cada)
      </label>
    </div>
  );
}

/**
 * The additive mirror of PenaltiesFieldset: staff enter occurrence counts and
 * the server prices them. The totals shown here are for orientation only —
 * the server applies `max_bonus_points` whatever this form displays.
 */
export default function BonusesFieldset({
  idPrefix,
  bonuses,
  onChange,
  bonusCounters = [],
  globalBonusCounters = [],
  maxBonusPoints,
}: Readonly<BonusesFieldsetProps>) {
  const sumCounters = (counters: readonly BonusCounterConfig[]) =>
    counters.reduce(
      (sum, counter) => sum + (bonuses[counter.key] || 0) * Math.abs(counter.points),
      0,
    );

  const total = sumCounters(bonusCounters) + sumCounters(globalBonusCounters);
  const isCapped = maxBonusPoints !== undefined;
  const awarded = isCapped ? Math.min(total, maxBonusPoints) : total;
  const isOverCap = isCapped && total > maxBonusPoints;

  return (
    <fieldset>
      <legend className="mb-2 block text-sm font-medium text-foreground">
        Bónus de performance
        {isCapped && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            (máximo {maxBonusPoints} pontos)
          </span>
        )}
      </legend>

      {globalBonusCounters.length > 0 && (
        <div className="mb-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Disponível em todos os postos
          </p>
          {globalBonusCounters.map((counter) => (
            <CounterRow
              key={counter.key}
              idPrefix={`${idPrefix}-global`}
              counter={counter}
              bonuses={bonuses}
              onChange={onChange}
            />
          ))}
        </div>
      )}

      {bonusCounters.length > 0 && (
        <div className="space-y-2">
          {globalBonusCounters.length > 0 && (
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Específico desta prova
            </p>
          )}
          {bonusCounters.map((counter) => (
            <CounterRow
              key={counter.key}
              idPrefix={idPrefix}
              counter={counter}
              bonuses={bonuses}
              onChange={onChange}
            />
          ))}
        </div>
      )}

      <p className="mt-1 text-sm text-muted-foreground">
        O bónus aumenta a pontuação final. Bónus total: {awarded} pontos
      </p>
      {isOverCap && (
        <output className="mt-1 block text-sm text-amber-600">
          Introduziste {total} pontos de bónus; serão contados apenas {maxBonusPoints}.
        </output>
      )}
    </fieldset>
  );
}

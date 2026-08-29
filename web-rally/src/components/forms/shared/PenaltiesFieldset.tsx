import type { PenaltyCounterConfig } from "@/lib/penaltyCounters";

type PenaltyMap = { [key: string]: number };

interface PenaltiesFieldsetProps {
  idPrefix: string;
  penalties: PenaltyMap;
  onChange: (value: PenaltyMap) => void;
  penaltyValues: { vomit: number; not_drinking: number };
  showVomitPenalty: boolean;
  showNotDrinkingPenalty: boolean;
  /** This activity's own counters (e.g. "cada falha na baliza"), if any. */
  penaltyCounters?: readonly PenaltyCounterConfig[];
  /** Counters that apply at every checkpoint (admin-defined). */
  globalPenaltyCounters?: readonly PenaltyCounterConfig[];
}

interface CounterRowProps {
  idPrefix: string;
  counter: PenaltyCounterConfig;
  penalties: PenaltyMap;
  onChange: (value: PenaltyMap) => void;
}

function CounterRow({ idPrefix, counter, penalties, onChange }: Readonly<CounterRowProps>) {
  return (
    <div className="flex items-center space-x-3">
      <input
        id={`${idPrefix}-${counter.key}`}
        type="number"
        min="0"
        value={penalties[counter.key] || 0}
        onChange={(e) =>
          onChange({ ...penalties, [counter.key]: Number.parseInt(e.target.value, 10) || 0 })
        }
        className="w-20 rounded border border-border bg-muted p-2 text-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500"
        placeholder="0"
        aria-label={`Contagem de ${counter.label}`}
      />
      <label htmlFor={`${idPrefix}-${counter.key}`} className="text-sm text-muted-foreground">
        {counter.label} ({Math.abs(counter.points)} pts cada)
      </label>
    </div>
  );
}

export default function PenaltiesFieldset({
  idPrefix,
  penalties,
  onChange,
  penaltyValues,
  showVomitPenalty,
  showNotDrinkingPenalty,
  penaltyCounters = [],
  globalPenaltyCounters = [],
}: Readonly<PenaltiesFieldsetProps>) {
  const sumCounters = (counters: readonly PenaltyCounterConfig[]) =>
    counters.reduce(
      (sum, counter) => sum + (penalties[counter.key] || 0) * Math.abs(counter.points),
      0,
    );

  const total =
    (penalties.vomit || 0) * Math.abs(penaltyValues.vomit) +
    (penalties.not_drinking || 0) * Math.abs(penaltyValues.not_drinking) +
    sumCounters(penaltyCounters) +
    sumCounters(globalPenaltyCounters);

  const hasActivityGroup = showVomitPenalty || showNotDrinkingPenalty || penaltyCounters.length > 0;

  return (
    <fieldset>
      <legend className="mb-2 block text-sm font-medium text-foreground">Penalizações</legend>

      {globalPenaltyCounters.length > 0 && (
        <div className="mb-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Disponível em todos os postos
          </p>
          {globalPenaltyCounters.map((counter) => (
            <CounterRow
              key={counter.key}
              idPrefix={`${idPrefix}-global`}
              counter={counter}
              penalties={penalties}
              onChange={onChange}
            />
          ))}
        </div>
      )}

      {hasActivityGroup && (
        <div className="space-y-2">
          {globalPenaltyCounters.length > 0 && (
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Específico desta prova
            </p>
          )}
          {showVomitPenalty && (
            <div className="flex items-center space-x-3">
              <input
                id={`${idPrefix}-vomit`}
                type="number"
                min="0"
                value={penalties.vomit || 0}
                onChange={(e) =>
                  onChange({ ...penalties, vomit: Number.parseInt(e.target.value, 10) || 0 })
                }
                className="w-20 rounded border border-border bg-muted p-2 text-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500"
                placeholder="0"
                aria-label="Número de vezes que vomitou"
              />
              <label htmlFor={`${idPrefix}-vomit`} className="text-sm text-muted-foreground">
                Penalização por vómito ({penaltyValues.vomit} pts cada)
              </label>
            </div>
          )}
          {showNotDrinkingPenalty && (
            <div className="flex items-center space-x-3">
              <input
                id={`${idPrefix}-not-drinking`}
                type="number"
                min="0"
                value={penalties.not_drinking || 0}
                onChange={(e) =>
                  onChange({
                    ...penalties,
                    not_drinking: Number.parseInt(e.target.value, 10) || 0,
                  })
                }
                className="w-20 rounded border border-border bg-muted p-2 text-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500"
                placeholder="0"
                aria-label="Número de vezes que não bebeu"
              />
              <label htmlFor={`${idPrefix}-not-drinking`} className="text-sm text-muted-foreground">
                Penalização por não beber ({penaltyValues.not_drinking} pts cada)
              </label>
            </div>
          )}
          {penaltyCounters.map((counter) => (
            <CounterRow
              key={counter.key}
              idPrefix={idPrefix}
              counter={counter}
              penalties={penalties}
              onChange={onChange}
            />
          ))}
        </div>
      )}

      <p className="mt-1 text-sm text-muted-foreground">
        As penalizações reduzem a pontuação final. Penalização total: {total} pontos
      </p>
    </fieldset>
  );
}

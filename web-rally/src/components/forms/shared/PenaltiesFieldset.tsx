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
}

export default function PenaltiesFieldset({
  idPrefix,
  penalties,
  onChange,
  penaltyValues,
  showVomitPenalty,
  showNotDrinkingPenalty,
  penaltyCounters = [],
}: Readonly<PenaltiesFieldsetProps>) {
  const customTotal = penaltyCounters.reduce(
    (sum, counter) => sum + (penalties[counter.key] || 0) * Math.abs(counter.points),
    0,
  );

  return (
    <fieldset>
      <legend className="mb-2 block text-sm font-medium text-foreground">Penalizações</legend>
      <div className="space-y-2">
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
          <div key={counter.key} className="flex items-center space-x-3">
            <input
              id={`${idPrefix}-${counter.key}`}
              type="number"
              min="0"
              value={penalties[counter.key] || 0}
              onChange={(e) =>
                onChange({
                  ...penalties,
                  [counter.key]: Number.parseInt(e.target.value, 10) || 0,
                })
              }
              className="w-20 rounded border border-border bg-muted p-2 text-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500"
              placeholder="0"
              aria-label={`Contagem de ${counter.label}`}
            />
            <label htmlFor={`${idPrefix}-${counter.key}`} className="text-sm text-muted-foreground">
              {counter.label} ({Math.abs(counter.points)} pts cada)
            </label>
          </div>
        ))}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        As penalizações reduzem a pontuação final. Penalização total:{" "}
        {(penalties.vomit || 0) * Math.abs(penaltyValues.vomit) +
          (penalties.not_drinking || 0) * Math.abs(penaltyValues.not_drinking) +
          customTotal}{" "}
        pontos
      </p>
    </fieldset>
  );
}

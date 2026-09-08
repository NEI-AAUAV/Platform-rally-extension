import { useRef, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { BloodyButton } from "@/components/themes/bloody";
import { counterKeyFromLabel, type PenaltyCounterConfig } from "@/lib/penaltyCounters";

export type CounterCopy = Readonly<{
  /** Distinguishes the two editors' input ids and labels on the same page. */
  idPrefix: string;
  title: string;
  description: string;
  labelFieldLabel: string;
  pointsFieldLabel: string;
  /**
   * Label for the optional per-counter ceiling. Only the bonus editor sets it:
   * a penalty has no such limit, and rendering a dead field there would invite
   * an admin to configure something nothing reads.
   */
  maxPointsFieldLabel?: string;
  labelPlaceholder: string;
  addButtonLabel: string;
  removeButtonLabel: (name: string) => string;
}>;

type Props = Readonly<{
  counters: readonly PenaltyCounterConfig[];
  onChange: (counters: PenaltyCounterConfig[]) => void;
  copy: CounterCopy;
  /** Extra controls that belong to this list — e.g. the bonus ceiling. */
  children?: ReactNode;
}>;

/**
 * The editor behind both the penalty and the bonus counter lists. The two
 * differ only in wording and in which config key they are merged into, so the
 * list mechanics (add/remove/re-slug on rename) live here once.
 */
export default function CounterConfigFields({ counters, onChange, copy, children }: Props) {
  // React keys for the rows. The configs themselves have no stable identity —
  // `key` is re-slugged on every rename and two blank rows slug the same — so
  // rows get a client-side id that follows them across add/remove instead.
  const rowIdsRef = useRef<string[]>([]);
  const nextRowIdRef = useRef(0);
  while (rowIdsRef.current.length < counters.length) {
    rowIdsRef.current.push(`row-${nextRowIdRef.current++}`);
  }
  rowIdsRef.current.length = counters.length;
  const rowIds = rowIdsRef.current;

  const addCounter = () => {
    onChange([...counters, { key: `counter_${counters.length + 1}`, label: "", points: 5 }]);
  };

  const updateCounter = (index: number, patch: Partial<PenaltyCounterConfig>) => {
    onChange(counters.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const removeCounter = (index: number) => {
    rowIdsRef.current.splice(index, 1);
    onChange(counters.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted p-4">
      <div>
        <h4 className="font-medium text-foreground">{copy.title}</h4>
        <p className="mt-1 text-xs text-muted-foreground">{copy.description}</p>
      </div>

      {counters.map((counter, index) => (
        <div key={rowIds[index]} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[10rem] flex-1">
            <label
              htmlFor={`${copy.idPrefix}-label-${index}`}
              className="mb-1 block text-xs text-muted-foreground"
            >
              {copy.labelFieldLabel}
            </label>
            <Input
              id={`${copy.idPrefix}-label-${index}`}
              value={counter.label}
              placeholder={copy.labelPlaceholder}
              onChange={(e) =>
                updateCounter(index, {
                  label: e.target.value,
                  key: counterKeyFromLabel(e.target.value),
                })
              }
              className="border-border bg-card"
            />
          </div>
          <div className="w-28">
            <label
              htmlFor={`${copy.idPrefix}-points-${index}`}
              className="mb-1 block text-xs text-muted-foreground"
            >
              {copy.pointsFieldLabel}
            </label>
            <Input
              id={`${copy.idPrefix}-points-${index}`}
              type="number"
              min={0}
              value={counter.points}
              onChange={(e) =>
                updateCounter(index, { points: Number.parseInt(e.target.value, 10) || 0 })
              }
              className="border-border bg-card"
            />
          </div>
          {copy.maxPointsFieldLabel && (
            <div className="w-32">
              <label
                htmlFor={`${copy.idPrefix}-max-points-${index}`}
                className="mb-1 block text-xs text-muted-foreground"
              >
                {copy.maxPointsFieldLabel}
              </label>
              <Input
                id={`${copy.idPrefix}-max-points-${index}`}
                type="number"
                min={0}
                value={counter.maxPoints ?? ""}
                placeholder="Sem limite"
                onChange={(e) => {
                  const raw = e.target.value;
                  // Empty is "no ceiling"; 0 is a real ceiling, so the two must
                  // not collapse into the same value.
                  updateCounter(index, {
                    maxPoints: raw === "" ? undefined : Math.max(0, Number.parseInt(raw, 10) || 0),
                  });
                }}
                className="border-border bg-card"
              />
            </div>
          )}
          <BloodyButton
            type="button"
            variant="neutral"
            onClick={() => removeCounter(index)}
            aria-label={copy.removeButtonLabel(counter.label || String(index + 1))}
          >
            <Trash2 className="h-4 w-4" />
          </BloodyButton>
        </div>
      ))}

      <BloodyButton type="button" variant="neutral" onClick={addCounter}>
        <Plus className="h-4 w-4" />
        <span className="ml-1.5">{copy.addButtonLabel}</span>
      </BloodyButton>

      {children}
    </div>
  );
}

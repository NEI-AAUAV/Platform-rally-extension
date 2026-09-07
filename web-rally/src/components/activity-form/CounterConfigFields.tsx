import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { BloodyButton } from "@/components/themes/bloody";
import type { PenaltyCounterConfig } from "@/lib/penaltyCounters";

/** A key derived from the label: lowercase, spaces to underscores, stripped
 * of anything that isn't a letter/digit/underscore. Not shown to staff —
 * only used as the dict key the count is stored under. */
export function slugify(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // strip diacritics (á -> a)
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+/, "")
      .replace(/_+$/, "") || "counter"
  );
}

export type CounterCopy = Readonly<{
  /** Distinguishes the two editors' input ids and labels on the same page. */
  idPrefix: string;
  title: string;
  description: string;
  labelFieldLabel: string;
  pointsFieldLabel: string;
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
  const addCounter = () => {
    onChange([...counters, { key: `counter_${counters.length + 1}`, label: "", points: 5 }]);
  };

  const updateCounter = (index: number, patch: Partial<PenaltyCounterConfig>) => {
    onChange(counters.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const removeCounter = (index: number) => {
    onChange(counters.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted p-4">
      <div>
        <h4 className="font-medium text-foreground">{copy.title}</h4>
        <p className="mt-1 text-xs text-muted-foreground">{copy.description}</p>
      </div>

      {counters.map(
        (
          counter,
          index, // NOSONAR
        ) => (
          <div key={index} className="flex flex-wrap items-end gap-2">
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
                    key: slugify(e.target.value),
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
            <BloodyButton
              type="button"
              variant="neutral"
              onClick={() => removeCounter(index)}
              aria-label={copy.removeButtonLabel(counter.label || String(index + 1))}
            >
              <Trash2 className="h-4 w-4" />
            </BloodyButton>
          </div>
        ),
      )}

      <BloodyButton type="button" variant="neutral" onClick={addCounter}>
        <Plus className="h-4 w-4" />
        <span className="ml-1.5">{copy.addButtonLabel}</span>
      </BloodyButton>

      {children}
    </div>
  );
}

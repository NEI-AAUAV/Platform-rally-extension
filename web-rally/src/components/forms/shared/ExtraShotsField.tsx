import type { ChangeEvent } from "react";
import { AlertTriangle } from "lucide-react";
import { displayCount, parseCount } from "./numberField";

interface ExtraShotsFieldProps {
  idPrefix: string;
  extraShots: number;
  onChange: (value: number) => void;
  maxExtraShots: number;
  maxExtraShotsPerMember: number;
}

export default function ExtraShotsField({
  idPrefix,
  extraShots,
  onChange,
  maxExtraShots,
  maxExtraShotsPerMember,
}: Readonly<ExtraShotsFieldProps>) {
  const inputId = `${idPrefix}-extra-shots`;
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(parseCount(e.target.value));
  };

  return (
    <div>
      <label htmlFor={inputId} className="mb-2 block text-sm font-medium text-foreground">
        Shots extra
      </label>
      <input
        id={inputId}
        type="number"
        min="0"
        max={maxExtraShots}
        value={displayCount(extraShots)}
        onChange={handleChange}
        className="w-full rounded-xl border border-border bg-card p-3 text-foreground focus:border-ring focus:ring-1 focus:ring-ring"
        placeholder="Shots extra tomados"
      />
      <p className="mt-1 text-sm text-muted-foreground">
        Shots bónus tomados (adiciona pontos à pontuação final). Máx.: {maxExtraShots} shots (
        {maxExtraShotsPerMember} por membro da equipa)
      </p>
      {extraShots > maxExtraShots && (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle className="h-4 w-4" />
          Excede o máximo permitido de shots extra ({maxExtraShots})
        </p>
      )}
    </div>
  );
}

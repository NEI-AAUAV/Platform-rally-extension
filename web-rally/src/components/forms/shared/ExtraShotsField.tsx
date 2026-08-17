import type { ChangeEvent } from "react";
import { AlertTriangle } from "lucide-react";

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
    const parsed = Number.parseInt(e.target.value, 10);
    onChange(Number.isNaN(parsed) ? 0 : parsed);
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
        value={extraShots}
        onChange={handleChange}
        className="w-full rounded border border-border bg-muted p-3 text-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500"
        placeholder="Shots extra tomados"
      />
      <p className="mt-1 text-sm text-muted-foreground">
        Shots bónus tomados (adiciona pontos à pontuação final). Máx.: {maxExtraShots} shots (
        {maxExtraShotsPerMember} por membro da equipa)
      </p>
      {extraShots > maxExtraShots && (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4" />
          Excede o máximo permitido de shots extra ({maxExtraShots})
        </p>
      )}
    </div>
  );
}

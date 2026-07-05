import { Input } from "@/components/ui/input";

export type ConfigValue = string | number | boolean;

interface ConfigNumberFieldProps {
  readonly id: string;
  readonly label: string;
  readonly configKey: string;
  /** Raw value from configData[configKey] (may be undefined). */
  readonly value: ConfigValue | undefined;
  readonly defaultValue: number;
  readonly placeholder: string;
  readonly onChange: (key: string, value: number) => void;
  readonly helpText?: string;
  readonly testId?: string;
}

/** Resolve the displayed numeric value, matching the original inline logic. */
function resolveValue(value: ConfigValue | undefined, defaultValue: number): number {
  if (typeof value === "number") return value;
  return value ? Number(value) : defaultValue;
}

export function ConfigNumberField({
  id,
  label,
  configKey,
  value,
  defaultValue,
  placeholder,
  onChange,
  helpText,
  testId,
}: ConfigNumberFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground mb-2">
        {label}
      </label>
      <Input
        id={id}
        type="number"
        min="0"
        value={resolveValue(value, defaultValue)}
        onChange={(e) => onChange(configKey, Number(e.target.value))}
        className="bg-muted border-border text-foreground"
        placeholder={placeholder}
        data-testid={testId}
      />
      {helpText && <p className="text-xs text-muted-foreground mt-1">{helpText}</p>}
    </div>
  );
}

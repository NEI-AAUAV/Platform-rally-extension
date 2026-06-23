import { Input } from "@/components/ui/input";

export type ConfigValue = string | number | boolean;

interface ConfigNumberFieldProps {
  id: string;
  label: string;
  configKey: string;
  /** Raw value from configData[configKey] (may be undefined). */
  value: ConfigValue | undefined;
  defaultValue: number;
  placeholder: string;
  onChange: (key: string, value: number) => void;
  helpText?: string;
  testId?: string;
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
      <label htmlFor={id} className="block text-sm font-medium text-white mb-2">
        {label}
      </label>
      <Input
        id={id}
        type="number"
        min="0"
        value={resolveValue(value, defaultValue)}
        onChange={(e) => onChange(configKey, Number(e.target.value))}
        className="bg-[rgb(255,255,255,0.1)] border-[rgb(255,255,255,0.2)] text-white"
        placeholder={placeholder}
        data-testid={testId}
      />
      {helpText && <p className="text-xs text-[rgb(255,255,255,0.5)] mt-1">{helpText}</p>}
    </div>
  );
}

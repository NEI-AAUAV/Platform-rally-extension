/**
 * Field primitives shared by the settings sections.
 *
 * Every setting is a switch, a bounded number or a short choice, and each was
 * previously spelled out as ~15 lines of Controller/Switch/Label/help-text.
 * Collapsing the shapes here is what keeps a section short enough to read.
 *
 * All three render the same compact row — label and help on the left, control
 * on the right — so a section scans as a list rather than a stack of blocks.
 */
import { Controller, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type SettingRowProps = Readonly<{
  name: string;
  label: string;
  help?: string;
  /** The control itself, rendered to the right of the label. */
  children: React.ReactNode;
}>;

/** One setting: label + optional help on the left, control on the right. */
function SettingRow({ name, label, help, children }: SettingRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 flex-1 space-y-0.5">
        <Label htmlFor={name} className="text-sm font-medium leading-snug">
          {label}
        </Label>
        {help && <p className="text-xs leading-snug text-muted-foreground">{help}</p>}
      </div>
      <div className="mt-0.5 shrink-0">{children}</div>
    </div>
  );
}

type SettingSwitchProps = Readonly<{
  name: string;
  label: string;
  /** Why this switch exists and what flipping it does. */
  help?: string;
  defaultValue?: boolean;
}>;

export function SettingSwitch({ name, label, help, defaultValue = false }: SettingSwitchProps) {
  const { control } = useFormContext();

  return (
    <SettingRow name={name} label={label} help={help}>
      <Controller
        name={name}
        control={control}
        defaultValue={defaultValue}
        render={({ field }) => (
          <Switch id={name} checked={!!field.value} onCheckedChange={field.onChange} />
        )}
      />
    </SettingRow>
  );
}

type SettingNumberProps = Readonly<{
  name: string;
  label: string;
  help?: string;
  min: number;
  max: number;
  /** Suffix shown after the input, e.g. "m" or "min". */
  unit?: string;
}>;

export function SettingNumber({ name, label, help, min, max, unit }: SettingNumberProps) {
  const { register } = useFormContext();

  return (
    <SettingRow name={name} label={label} help={help}>
      <div className="flex items-center gap-2">
        <Input
          id={name}
          type="number"
          min={min}
          max={max}
          {...register(name, { valueAsNumber: true })}
          className="w-24 border-border bg-muted text-right"
        />
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
    </SettingRow>
  );
}

type SettingSelectProps = Readonly<{
  name: string;
  label: string;
  help?: string;
  defaultValue: string;
  options: readonly { readonly value: string; readonly label: string }[];
}>;

export function SettingSelect({ name, label, help, defaultValue, options }: SettingSelectProps) {
  const { control } = useFormContext();

  return (
    <SettingRow name={name} label={label} help={help}>
      <Controller
        name={name}
        control={control}
        defaultValue={defaultValue}
        render={({ field }) => (
          <Select value={field.value || defaultValue} onValueChange={field.onChange}>
            <SelectTrigger id={name} className="w-52 border-border bg-muted">
              <SelectValue placeholder="Selecione o modo" />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </SettingRow>
  );
}

type SettingTextareaProps = Readonly<{
  name: string;
  label: string;
  help?: string;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
}>;

/** A stacked (not row) field: label + help above a multi-line textarea. */
export function SettingTextarea({
  name,
  label,
  help,
  placeholder,
  maxLength,
  rows = 4,
}: SettingTextareaProps) {
  const { register } = useFormContext();

  return (
    <div className="space-y-1.5 py-3">
      <Label htmlFor={name} className="text-sm font-medium leading-snug">
        {label}
      </Label>
      {help && <p className="text-xs leading-snug text-muted-foreground">{help}</p>}
      <Textarea
        id={name}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        {...register(name)}
        className="border-border bg-muted"
      />
    </div>
  );
}

type SettingGroupProps = Readonly<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}>;

/**
 * A titled run of settings. Deliberately not a card: a section already frames
 * the content, so a second box around every group is what made the old page
 * read as an endless wall of panels.
 */
export function SettingGroup({
  title,
  description,
  icon,
  className = "",
  children,
}: SettingGroupProps) {
  return (
    <section className={cn("space-y-1", className)}>
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h3>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="divide-y divide-border/60">{children}</div>
    </section>
  );
}

/**
 * A group nested inside another, for settings that only make sense together
 * (the hint/skip costs, the leg-time numbers). Indented rather than boxed.
 */
export function SettingSubGroup({
  title,
  description,
  className = "",
  children,
}: Readonly<{
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}>) {
  return (
    <div className={cn("border-l-2 border-border/60 py-3 pl-4", className)}>
      <p className="text-xs font-semibold text-foreground">{title}</p>
      {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      <div className="divide-y divide-border/60">{children}</div>
    </div>
  );
}

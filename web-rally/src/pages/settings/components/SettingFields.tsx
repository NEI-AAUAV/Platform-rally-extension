/**
 * Field primitives shared by the settings cards.
 *
 * Every setting is either a switch or a bounded number, and each was previously
 * spelled out as ~15 lines of Controller/Switch/Label/help-text. Collapsing the
 * two shapes here is what makes the cards short enough to read as groups.
 */
import { Controller, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type SettingSwitchProps = Readonly<{
  name: string;
  label: string;
  /** Why this switch exists and what flipping it does. */
  help?: string;
  defaultValue?: boolean;
  disabled?: boolean;
}>;

export function SettingSwitch({
  name,
  label,
  help,
  defaultValue = false,
  disabled = false,
}: SettingSwitchProps) {
  const { control } = useFormContext();

  return (
    <div className="flex items-start space-x-2">
      <Controller
        name={name}
        control={control}
        defaultValue={defaultValue}
        render={({ field }) => (
          <Switch
            id={name}
            checked={field.value}
            onCheckedChange={field.onChange}
            disabled={disabled}
            className="mt-0.5"
          />
        )}
      />
      <div>
        <Label htmlFor={name}>{label}</Label>
        {help && <p className="text-xs text-muted-foreground">{help}</p>}
      </div>
    </div>
  );
}

type SettingNumberProps = Readonly<{
  name: string;
  label: string;
  help?: string;
  min: number;
  max: number;
  disabled?: boolean;
}>;

export function SettingNumber({
  name,
  label,
  help,
  min,
  max,
  disabled = false,
}: SettingNumberProps) {
  const { register } = useFormContext();

  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        type="number"
        min={min}
        max={max}
        disabled={disabled}
        {...register(name, { valueAsNumber: true })}
        className="border-border bg-muted"
      />
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

type SettingsCardProps = Readonly<{
  title: string;
  description: string;
  icon: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}>;

/** A titled group of settings. The description says what the group is for. */
export function SettingsCard({
  title,
  description,
  icon,
  className = "",
  children,
}: SettingsCardProps) {
  return (
    <div className={`rally-surface rounded-2xl ${className}`}>
      <div className="flex flex-col space-y-1.5 p-6">
        <h3 className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">
          {icon}
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-4 p-6 pt-0">{children}</div>
    </div>
  );
}

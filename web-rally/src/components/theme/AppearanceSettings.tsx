import { Monitor, Moon, Sun } from "lucide-react";
import { useColorMode } from "./useColorMode";
import type { ColorModePreference } from "./colorModeContext";

const OPTIONS: ReadonlyArray<{
  value: ColorModePreference;
  label: string;
  Icon: typeof Monitor;
}> = [
  { value: "system", label: "Sistema", Icon: Monitor },
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Escuro", Icon: Moon },
];

interface AppearanceSettingsProps {
  readonly className?: string;
}

/** Per-user appearance controls: colour mode, including following the OS. */
export function AppearanceSettings({ className = "" }: AppearanceSettingsProps) {
  const { preference, setMode } = useColorMode();

  return (
    <section className={`rally-surface p-6 ${className}`} aria-labelledby="appearance-heading">
      <h2 id="appearance-heading" className="rally-display text-lg font-bold text-foreground">
        Aparência
      </h2>
      <p className="mt-0.5 text-xs uppercase tracking-[0.14em] text-muted-foreground">
        Só neste dispositivo
      </p>

      <fieldset className="mt-4">
        <legend className="mb-2 text-sm font-medium text-foreground">Tema</legend>
        <div className="flex gap-2" role="radiogroup" aria-label="Tema">
          {OPTIONS.map(({ value, label, Icon }) => {
            const active = preference === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setMode(value)}
                className={`flex flex-1 flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition-colors ${
                  active
                    ? "rally-bg-accent-soft rally-border-accent text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>
    </section>
  );
}

export default AppearanceSettings;

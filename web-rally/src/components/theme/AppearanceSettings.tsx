import { Monitor, Moon, Sun } from "lucide-react";
import { useColorMode } from "./useColorMode";
import type { ColorModePreference, GlassPreference } from "./colorModeContext";

const GLASS_OPTIONS: ReadonlyArray<{ value: GlassPreference; label: string }> = [
  { value: "auto", label: "Automático" },
  { value: "on", label: "Ligado" },
  { value: "off", label: "Desligado" },
];

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

/**
 * Per-user appearance controls: colour mode (including following the OS) and a
 * manual "reduce transparency" switch for the translucent surfaces used on
 * Apple platforms, where the OS setting is not exposed to the web.
 */
export function AppearanceSettings({ className = "" }: AppearanceSettingsProps) {
  const {
    preference,
    setMode,
    reduceTransparency,
    setReduceTransparency,
    glass,
    glassActive,
    setGlass,
  } = useColorMode();

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

      <fieldset className="mt-5">
        <legend className="mb-2 text-sm font-medium text-foreground">Efeito de vidro</legend>
        <p className="mb-2 text-xs text-muted-foreground">
          Automático liga-o apenas em dispositivos Apple recentes, onde combina com o sistema.
          {glass === "auto" && !glassActive && " Neste dispositivo está desligado."}
        </p>
        <div className="flex gap-2" role="radiogroup" aria-label="Efeito de vidro">
          {GLASS_OPTIONS.map(({ value, label }) => {
            const active = glass === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setGlass(value)}
                className={`flex-1 rounded-xl border p-2.5 text-xs font-medium transition-colors ${
                  active
                    ? "rally-bg-accent-soft rally-border-accent text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="mt-5 flex items-start justify-between gap-4">
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">Reduzir transparência</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Torna opacas as superfícies translúcidas usadas em dispositivos Apple recentes.
          </span>
        </span>
        <input
          type="checkbox"
          checked={reduceTransparency}
          onChange={(e) => setReduceTransparency(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0 accent-[var(--rally-accent,#008542)]"
        />
      </label>
    </section>
  );
}

export default AppearanceSettings;

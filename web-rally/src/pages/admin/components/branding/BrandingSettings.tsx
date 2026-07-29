import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Palette, Upload, ImageIcon, Save } from "lucide-react";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  viewRallySettings,
  updateRallySettings,
  uploadRallyBanner,
  uploadRallyLogo,
  uploadRallyFavicon,
  type RallySettingsResponse,
  type RallySettingsUpdate,
  type VisualPreset,
} from "@/client";
import { useAppToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/utils/errorHandling";
import { LoadingState } from "@/components/shared";
import { cn } from "@/lib/utils";
import { RallyButton } from "@/components/themes/rally";
import type { CSSProperties } from "react";

type ButtonStyle = "plain" | "blood" | "glow" | "sharp" | "shine";

// Quick-pick accent colours for the Colour axis (custom hex still available).
const COLOR_PRESETS: ReadonlyArray<{ label: string; value: string }> = [
  { label: "NEI Verde", value: "#008542" },
  { label: "Rally Vermelho", value: "#dc2625" },
  { label: "Laranja", value: "#ff7800" },
  { label: "Azul", value: "#2563eb" },
  { label: "Roxo", value: "#7c3aed" },
  { label: "Rosa", value: "#db2777" },
];

// Button axis options.
const BUTTON_STYLE_OPTIONS: ReadonlyArray<{ value: ButtonStyle; label: string; hint: string }> = [
  { value: "plain", label: "Simples", hint: "Botões limpos com a cor de destaque" },
  { value: "blood", label: "Sangue", hint: "Gotas de sangue nos botões principais" },
  { value: "glow", label: "Brilho", hint: "Halo luminoso à volta dos botões" },
  { value: "sharp", label: "Angular", hint: "Cantos direitos, estilo brutalista" },
  { value: "shine", label: "Reflexo", hint: "Brilho gloss sobre o preenchimento" },
];

const asButtonStyle = (value: unknown): ButtonStyle =>
  BUTTON_STYLE_OPTIONS.some((o) => o.value === value) ? (value as ButtonStyle) : "plain";

type BackgroundStyle = "plain" | "dots" | "grid" | "glow" | "stripes" | "confetti" | "halloween";

// Background pattern axis options.
const BACKGROUND_STYLE_OPTIONS: ReadonlyArray<{
  value: BackgroundStyle;
  label: string;
  hint: string;
}> = [
  { value: "plain", label: "Simples", hint: "Fundo limpo com o brilho de destaque" },
  { value: "dots", label: "Pontos", hint: "Grelha de pontos subtil" },
  { value: "grid", label: "Grelha", hint: "Linhas finas em grelha" },
  { value: "glow", label: "Brilho", hint: "Halos suaves da cor de destaque" },
  { value: "stripes", label: "Riscas", hint: "Riscas diagonais festivas" },
  { value: "confetti", label: "Confetti", hint: "Confetti colorido — Carnaval" },
  { value: "halloween", label: "Halloween", hint: "Ambiente escuro com morcegos" },
];

const asBackgroundStyle = (value: unknown): BackgroundStyle =>
  BACKGROUND_STYLE_OPTIONS.some((o) => o.value === value) ? (value as BackgroundStyle) : "plain";

const hexToRgba = (hex: string, alpha: number): string | null => {
  const hex6 = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (!hex6) return null;
  const n = Number.parseInt(hex6, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

type IdentityPreviewProps = Readonly<{
  accentColor: string;
  buttonStyle: ButtonStyle;
  eventName: string;
  eventSubtitle: string;
  /** Placeholder for the future background axis; already threaded through so
   * adding background presets only needs the CSS + a real value here. */
  backgroundStyle?: string;
}>;

/**
 * Live preview of the draft identity. Scopes the chosen accent (--rally-accent)
 * and button style (data-rally-buttons) to this panel so it reflects unsaved
 * edits, without changing the rest of the app.
 */
function IdentityPreview({
  accentColor,
  buttonStyle,
  eventName,
  eventSubtitle,
  backgroundStyle = "plain",
}: IdentityPreviewProps) {
  const vars: Record<string, string> = {};
  if (/^#[0-9a-f]{6}$/i.test(accentColor)) {
    vars["--rally-accent"] = accentColor;
    vars["--rally-accent-contrast"] = accentColor;
    const soft = hexToRgba(accentColor, 0.16);
    if (soft) vars["--rally-accent-soft"] = soft;
  }
  return (
    <div className="space-y-2">
      <Label>Pré-visualização</Label>
      <div
        className="rally-identity-preview overflow-hidden rounded-xl border border-border bg-background p-5"
        data-rally-buttons={buttonStyle}
        data-rally-bg={backgroundStyle}
        style={vars as CSSProperties}
      >
        <p className="font-display text-lg font-bold leading-tight">
          {eventName || "Rally Tascas"}
        </p>
        <p className="mb-4 text-sm text-muted-foreground">
          {eventSubtitle || "Identidade visual do evento"}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <RallyButton variant="primary" size="lg">
            Ação principal
          </RallyButton>
          <RallyButton variant="outline" size="lg">
            Secundário
          </RallyButton>
          <span className="rally-bg-accent-soft rounded-full px-3 py-1 text-xs font-semibold text-foreground">
            Destaque
          </span>
        </div>
      </div>
    </div>
  );
}

type UploadFn = (file: File) => Promise<RallySettingsResponse>;

type ImageUploadFieldProps = Readonly<{
  label: string;
  description: string;
  accept: string;
  currentUrl?: string | null;
  upload: UploadFn;
  onUploaded: () => void;
}>;

function ImageUploadField({
  label,
  description,
  accept,
  currentUrl,
  upload,
  onUploaded,
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useAppToast();
  const [preview, setPreview] = useState<string | null>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: upload,
    onSuccess: () => {
      toast.success(`${label} atualizado com sucesso!`);
      setPreview(null);
      onUploaded();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, `Erro ao carregar ${label.toLowerCase()}`));
    },
  });

  const handleSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    mutate(file);
    event.target.value = "";
  };

  const ALLOWED_IMAGE_PROTOCOLS = new Set(["http:", "https:", "blob:"]);
  const SAFE_DATA_IMAGE_PATTERN = /^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+/]+=*$/i;

  const isSafeImageUrl = (url: string): boolean => {
    if (url.startsWith("/") && !url.startsWith("//")) return true;
    if (SAFE_DATA_IMAGE_PATTERN.test(url)) return true;
    try {
      return ALLOWED_IMAGE_PROTOCOLS.has(new URL(url, window.location.origin).protocol);
    } catch {
      return false;
    }
  };

  const candidate = preview ?? currentUrl ?? null;
  const shown = candidate && isSafeImageUrl(candidate) ? candidate : null;

  return (
    <div className="flex items-center gap-4 border-t border-border py-4 first:border-t-0 first:pt-0">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
        {shown ? (
          <img src={shown} alt={`${label} atual`} className="h-full w-full object-contain" />
        ) : (
          <ImageIcon className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="font-semibold">{label}</h4>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleSelect}
        disabled={isPending}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="mr-2 h-4 w-4" />
        {isPending ? "A carregar..." : "Carregar"}
      </Button>
    </div>
  );
}

const ADMIN_KEY = ["rallySettings-admin"] as const;

/**
 * Identidade Visual — admin panel tab. Self-contained: fetches the full rally
 * settings, edits the text branding fields (name/subtitle/accent) and saves
 * them via the settings PUT (echoing the rest of the config so nothing is
 * lost), and uploads banner/logo/favicon straight to Cloudflare R2.
 */
export default function BrandingSettings() {
  const toast = useAppToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ADMIN_KEY,
    queryFn: async () => {
      const { data } = await viewRallySettings();
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const [eventName, setEventName] = useState("");
  const [eventSubtitle, setEventSubtitle] = useState("");
  const [accentColor, setAccentColor] = useState("");
  const [buttonStyle, setButtonStyle] = useState<ButtonStyle>("plain");
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>("plain");
  const [visualPresets, setVisualPresets] = useState<VisualPreset[]>([]);

  useEffect(() => {
    if (!settings) return;
    setEventName(settings.event_name ?? "");
    setEventSubtitle(settings.event_subtitle ?? "");
    setAccentColor(settings.accent_color ?? "");
    setButtonStyle(asButtonStyle(settings.button_style));
    setBackgroundStyle(asBackgroundStyle(settings.background_style));
    setVisualPresets(settings.visual_presets ?? []);
  }, [settings]);

  const invalidateBranding = () => {
    void queryClient.invalidateQueries({ queryKey: ADMIN_KEY });
    void queryClient.invalidateQueries({ queryKey: ["rallySettings-public"] });
  };

  const { mutate: persist, isPending: isSaving } = useMutation({
    // Echo the full config back with only the identity fields changed, so the
    // single settings PUT never drops other values. `overrides` lets callers
    // (apply/save-preset) persist a value that hasn't settled into state yet.
    mutationFn: async (overrides: Partial<RallySettingsUpdate> = {}) => {
      if (!settings) throw new Error("Settings not loaded");
      const payload: RallySettingsUpdate = {
        ...settings,
        event_name: eventName,
        event_subtitle: eventSubtitle,
        accent_color: accentColor,
        button_style: buttonStyle,
        background_style: backgroundStyle,
        visual_presets: visualPresets,
        ...overrides,
      };
      return (await updateRallySettings({ body: payload })).data;
    },
    onSuccess: () => {
      toast.success("Identidade visual atualizada!");
      invalidateBranding();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao guardar identidade visual"));
    },
  });

  // Apply a saved preset's axis values live (and persist immediately).
  const applyPreset = (preset: VisualPreset) => {
    const style = asButtonStyle(preset.button_style);
    const bg = asBackgroundStyle(preset.background_style);
    setAccentColor(preset.accent_color ?? "");
    setButtonStyle(style);
    setBackgroundStyle(bg);
    persist({ accent_color: preset.accent_color ?? "", button_style: style, background_style: bg });
  };

  // Snapshot the current axis mix as a new named preset.
  const saveAsPreset = () => {
    const name = globalThis.prompt("Nome do preset?")?.trim();
    if (!name) return;
    const preset: VisualPreset = {
      id: globalThis.crypto.randomUUID(),
      name,
      accent_color: accentColor,
      button_style: buttonStyle,
      background_style: backgroundStyle,
    };
    const next = [...visualPresets, preset];
    setVisualPresets(next);
    persist({ visual_presets: next });
  };

  const removePreset = (id: string) => {
    const next = visualPresets.filter((p) => p.id !== id);
    setVisualPresets(next);
    persist({ visual_presets: next });
  };

  if (isLoading) return <LoadingState message="A carregar identidade visual..." />;

  return (
    <div className="rally-surface mt-4 rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          Identidade Visual
        </CardTitle>
        <CardDescription>
          Nome, cores e imagens do evento. Uma só aplicação serve qualquer edição do Rally.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <IdentityPreview
          accentColor={accentColor}
          buttonStyle={buttonStyle}
          backgroundStyle={backgroundStyle}
          eventName={eventName}
          eventSubtitle={eventSubtitle}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="event_name">Nome do evento</Label>
            <Input
              id="event_name"
              type="text"
              maxLength={120}
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              className="border-border bg-muted"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="event_subtitle">Subtítulo</Label>
            <Input
              id="event_subtitle"
              type="text"
              maxLength={200}
              value={eventSubtitle}
              onChange={(e) => setEventSubtitle(e.target.value)}
              className="border-border bg-muted"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="accent_color">Cor de destaque</Label>
          <div className="flex items-center gap-3">
            <Input
              id="accent_color"
              type="text"
              maxLength={32}
              placeholder="#c81d25"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="max-w-[200px] border-border bg-muted"
            />
            <input
              type="color"
              aria-label="Selecionar cor de destaque"
              value={/^#[0-9a-f]{6}$/i.test(accentColor) ? accentColor : "#c81d25"}
              onChange={(e) => setAccentColor(e.target.value)}
              className="h-10 w-11 cursor-pointer rounded-lg border border-border bg-transparent"
            />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setAccentColor(c.value)}
                title={c.label}
                aria-label={c.label}
                className={cn(
                  "h-8 w-8 rounded-full border-2 transition",
                  accentColor.toLowerCase() === c.value.toLowerCase()
                    ? "border-foreground ring-2 ring-foreground/30"
                    : "border-border hover:scale-110",
                )}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Define o destaque de toda a aplicação (botões, barras, realces).
          </p>
        </div>

        {/* Button axis */}
        <div className="space-y-2">
          <Label>Estilo dos botões</Label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {BUTTON_STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setButtonStyle(opt.value)}
                className={cn(
                  "rounded-xl border p-3 text-left transition",
                  buttonStyle === opt.value
                    ? "border-foreground bg-muted ring-2 ring-foreground/20"
                    : "border-border hover:bg-muted",
                )}
              >
                <span className="block text-sm font-semibold">{opt.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{opt.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Background axis */}
        <div className="space-y-2">
          <Label>Fundo</Label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {BACKGROUND_STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setBackgroundStyle(opt.value)}
                className={cn(
                  "rounded-xl border p-3 text-left transition",
                  backgroundStyle === opt.value
                    ? "border-foreground bg-muted ring-2 ring-foreground/20"
                    : "border-border hover:bg-muted",
                )}
              >
                <span className="block text-sm font-semibold">{opt.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{opt.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="button" onClick={() => persist({})} disabled={isSaving || !settings}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "A guardar..." : "Guardar identidade"}
          </Button>
        </div>

        {/* Saved identity presets */}
        <div className="space-y-3 rounded-xl border border-border bg-muted p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Presets guardados
            </h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={saveAsPreset}
              disabled={isSaving || !settings}
            >
              Guardar mistura atual
            </Button>
          </div>
          {visualPresets.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Escolhe uma cor e um estilo de botões e guarda a mistura como preset para reutilizar.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {visualPresets.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-full border border-border bg-background py-1 pl-1 pr-2"
                >
                  <button
                    type="button"
                    onClick={() => applyPreset(p)}
                    className="flex items-center gap-2"
                    title={`Aplicar ${p.name}`}
                  >
                    <span
                      className="h-5 w-5 rounded-full border border-border"
                      style={{ backgroundColor: p.accent_color || "#888888" }}
                    />
                    <span className="text-xs font-medium">{p.name}</span>
                    <span className="text-[10px] uppercase text-muted-foreground">
                      {p.button_style === "blood" ? "sangue" : "simples"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removePreset(p.id)}
                    aria-label={`Remover ${p.name}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-muted p-4">
          <h3 className="mb-1 font-display text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Imagens (Cloudflare R2)
          </h3>
          <ImageUploadField
            label="Banner"
            description="Topo da aplicação · JPG/PNG/WebP/GIF · máx 5MB"
            accept="image/jpeg,image/png,image/webp,image/gif"
            currentUrl={settings?.banner_url}
            upload={async (file) => {
              const { data } = await uploadRallyBanner({ body: { image: file } });
              return data as RallySettingsResponse;
            }}
            onUploaded={invalidateBranding}
          />
          <ImageUploadField
            label="Logótipo"
            description="JPG/PNG/WebP/GIF · máx 5MB"
            accept="image/jpeg,image/png,image/webp,image/gif"
            currentUrl={settings?.logo_url}
            upload={async (file) => {
              const { data } = await uploadRallyLogo({ body: { image: file } });
              return data as RallySettingsResponse;
            }}
            onUploaded={invalidateBranding}
          />
          <ImageUploadField
            label="Favicon"
            description="Separador do navegador · PNG/SVG/ICO · máx 5MB"
            accept="image/png,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico"
            currentUrl={settings?.favicon_url}
            upload={async (file) => {
              const { data } = await uploadRallyFavicon({ body: { image: file } });
              return data as RallySettingsResponse;
            }}
            onUploaded={invalidateBranding}
          />
        </div>
      </CardContent>
    </div>
  );
}

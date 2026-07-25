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
} from "@/client";
import { useAppToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/utils/errorHandling";
import { LoadingState } from "@/components/shared";

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

  const isSafeImageUrl = (url: string) =>
    url.startsWith("blob:") || url.startsWith("data:image/") || url.startsWith("/") || url.startsWith("http://") || url.startsWith("https://");

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

  useEffect(() => {
    if (!settings) return;
    setEventName(settings.event_name ?? "");
    setEventSubtitle(settings.event_subtitle ?? "");
    setAccentColor(settings.accent_color ?? "");
  }, [settings]);

  const invalidateBranding = () => {
    void queryClient.invalidateQueries({ queryKey: ADMIN_KEY });
    void queryClient.invalidateQueries({ queryKey: ["rallySettings-public"] });
  };

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: async () => {
      if (!settings) throw new Error("Settings not loaded");
      // Echo the full config back with only the branding text fields changed,
      // so the single settings PUT never drops other values.
      const payload: RallySettingsUpdate = {
        ...settings,
        event_name: eventName,
        event_subtitle: eventSubtitle,
        accent_color: accentColor,
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
          <p className="text-xs text-muted-foreground">
            Define o destaque de toda a aplicação (botões, barras, realces).
          </p>
        </div>

        <div className="flex justify-end">
          <Button type="button" onClick={() => save()} disabled={isSaving || !settings}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "A guardar..." : "Guardar identidade"}
          </Button>
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

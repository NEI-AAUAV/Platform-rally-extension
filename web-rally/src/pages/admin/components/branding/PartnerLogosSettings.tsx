import { useRef, useState, type ChangeEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Moon, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  addRallyPartnerLogo,
  removeRallyPartnerLogo,
  reorderRallyPartnerLogos,
  uploadRallyAauavLogo,
  uploadRallyAauavLogoDark,
  uploadRallyPartnerDarkLogo,
  type RallySettingsResponse,
} from "@/client";
import { useAppToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/utils/errorHandling";
import { ImageUploadField } from "./ImageUploadField";

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const MAX_NAME_LENGTH = 60;
/** Dark tile so white (dark-mode) logos are visible in the admin preview. */
const DARK_PREVIEW = "bg-neutral-900";

type PartnerLogosSettingsProps = Readonly<{
  settings: RallySettingsResponse;
  onChanged: () => void;
  onToggle: (show: boolean) => void;
  isSaving: boolean;
}>;

/**
 * Admin block for the organising-núcleos strip shown under the home subtitle:
 * visibility toggle, AAUAv symbol (left slot) and the ordered núcleo logos.
 */
export default function PartnerLogosSettings({
  settings,
  onChanged,
  onToggle,
  isSaving,
}: PartnerLogosSettingsProps) {
  const toast = useAppToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const darkFileRef = useRef<HTMLInputElement>(null);
  const [darkTargetId, setDarkTargetId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const logos = settings.partner_logos ?? [];

  const onError = (fallback: string) => (error: unknown) =>
    toast.error(getErrorMessage(error, fallback));

  const add = useMutation({
    mutationFn: async (file: File) =>
      (await addRallyPartnerLogo({ body: { image: file, name: name.trim() } })).data,
    onSuccess: () => {
      toast.success("Núcleo adicionado!");
      setName("");
      onChanged();
    },
    onError: onError("Erro ao adicionar núcleo"),
  });

  const remove = useMutation({
    mutationFn: async (logoId: string) =>
      (await removeRallyPartnerLogo({ path: { logo_id: logoId } })).data,
    onSuccess: onChanged,
    onError: onError("Erro ao remover núcleo"),
  });

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => (await reorderRallyPartnerLogos({ body: { ids } })).data,
    onSuccess: onChanged,
    onError: onError("Erro ao reordenar núcleos"),
  });

  const uploadDark = useMutation({
    mutationFn: async ({ logoId, file }: { logoId: string; file: File }) =>
      (await uploadRallyPartnerDarkLogo({ path: { logo_id: logoId }, body: { image: file } })).data,
    onSuccess: () => {
      toast.success("Versão branca atualizada!");
      onChanged();
    },
    onError: onError("Erro ao carregar versão branca"),
  });

  const pickDark = (logoId: string) => {
    setDarkTargetId(logoId);
    darkFileRef.current?.click();
  };

  const handleDarkFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file && darkTargetId) uploadDark.mutate({ logoId: darkTargetId, file });
  };

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= logos.length) return;
    const ids = logos.map((logo) => logo.id);
    const swapped = ids.map((id, i) =>
      i === index ? ids[target] : i === target ? ids[index] : id,
    ) as string[];
    reorder.mutate(swapped);
  };

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) add.mutate(file);
  };

  const busy = add.isPending || remove.isPending || reorder.isPending || uploadDark.isPending;
  const canAdd = name.trim().length > 0 && !busy;

  return (
    <div
      data-admin-search-key="show_partners"
      className="space-y-4 rounded-xl border border-border bg-muted p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Núcleos organizadores
          </h3>
          <p className="text-xs text-muted-foreground">
            Faixa de logótipos por baixo do subtítulo na página inicial. Símbolo AAUAv à esquerda.
          </p>
        </div>
        <Switch
          aria-label="Mostrar núcleos na página inicial"
          checked={settings.show_partners ?? false}
          onCheckedChange={onToggle}
          disabled={isSaving}
        />
      </div>

      <ImageUploadField
        label="Símbolo AAUAv"
        description="Primeiro logótipo, à esquerda · PNG transparente recomendado · máx 5MB"
        accept={IMAGE_ACCEPT}
        currentUrl={settings.aauav_logo_url}
        upload={async (file) => {
          const { data } = await uploadRallyAauavLogo({ body: { image: file } });
          return data as RallySettingsResponse;
        }}
        onUploaded={onChanged}
      />
      <ImageUploadField
        label="Símbolo AAUAv (versão branca)"
        description="Usada em dark mode · opcional · PNG transparente · máx 5MB"
        accept={IMAGE_ACCEPT}
        currentUrl={settings.aauav_logo_dark_url}
        previewClassName={DARK_PREVIEW}
        upload={async (file) => {
          const { data } = await uploadRallyAauavLogoDark({ body: { image: file } });
          return data as RallySettingsResponse;
        }}
        onUploaded={onChanged}
      />

      <input
        ref={darkFileRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={handleDarkFile}
      />
      {logos.length > 0 && (
        <ol className="space-y-2">
          {logos.map((logo, index) => (
            <li
              key={logo.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-background p-2"
            >
              <img
                src={logo.url}
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 shrink-0 object-contain"
              />
              <button
                type="button"
                onClick={() => pickDark(logo.id)}
                disabled={busy}
                title={
                  logo.dark_url
                    ? "Substituir versão branca (dark mode)"
                    : "Carregar versão branca (dark mode)"
                }
                aria-label={`Versão branca de ${logo.name}`}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border ${DARK_PREVIEW} transition hover:ring-2 hover:ring-ring disabled:opacity-50`}
              >
                {logo.dark_url ? (
                  <img
                    src={logo.dark_url}
                    alt=""
                    width={40}
                    height={40}
                    className="h-8 w-8 object-contain"
                  />
                ) : (
                  <Moon className="h-4 w-4 text-neutral-400" />
                )}
              </button>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {logo.name}
                {!logo.dark_url && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    Sem versão branca — em dark mode usa cartão claro
                  </span>
                )}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Subir ${logo.name}`}
                disabled={busy || index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Descer ${logo.name}`}
                disabled={busy || index === logos.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remover ${logo.name}`}
                disabled={busy}
                onClick={() => remove.mutate(logo.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <Label htmlFor="partner_name">Nome do núcleo</Label>
          <Input
            id="partner_name"
            type="text"
            maxLength={MAX_NAME_LENGTH}
            placeholder="ex.: NEEET"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border-border"
          />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={handleFile}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!canAdd}
          onClick={() => fileRef.current?.click()}
        >
          <Plus className="mr-2 h-4 w-4" />
          {add.isPending ? "A carregar..." : "Adicionar logótipo"}
        </Button>
      </div>
    </div>
  );
}

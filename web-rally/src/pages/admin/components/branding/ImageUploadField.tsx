import { useRef, useState, type ChangeEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Upload, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RallySettingsResponse } from "@/client";
import { useAppToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/utils/errorHandling";

type UploadFn = (file: File) => Promise<RallySettingsResponse>;

type ImageUploadFieldProps = Readonly<{
  label: string;
  description: string;
  accept: string;
  currentUrl?: string | null;
  upload: UploadFn;
  onUploaded: () => void;
  /** Preview tile background, e.g. dark for white (dark-mode) logos. */
  previewClassName?: string;
}>;

export function ImageUploadField({
  label,
  description,
  accept,
  currentUrl,
  upload,
  onUploaded,
  previewClassName = "bg-muted",
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
      <div
        className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border ${previewClassName}`}
      >
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

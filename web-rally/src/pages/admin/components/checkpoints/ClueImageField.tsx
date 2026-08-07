import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { uploadClueImage } from "@/client";
import { BloodyButton } from "@/components/themes/bloody";
import { getErrorMessage } from "@/utils/errorHandling";

type ClueImageFieldProps = Readonly<{
  /** Null while creating: an upload needs a checkpoint to attach to. */
  checkpointId: number | null;
  currentUrl: string | null;
  onUploaded: (url: string) => void;
}>;

/**
 * Picture-riddle upload for a checkpoint's clue.
 *
 * Goes to R2 through the API like every other image in the app (team photos,
 * checkpoint media) rather than asking an admin to paste a URL. Uploading
 * replaces the previous image, which the server deletes.
 *
 * Deliberately plain state rather than react-query + useAppToast: this renders
 * inside the checkpoint form, and either hook would drag a QueryClientProvider
 * and a ToastProvider into every consumer (and every test) of that form. One
 * fire-and-forget upload does not need a cache, and the error belongs next to
 * the field that produced it anyway.
 */
export default function ClueImageField({
  checkpointId,
  currentUrl,
  onUploaded,
}: ClueImageFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (image: Blob) => {
    if (checkpointId === null) return;
    setIsUploading(true);
    setError(null);
    try {
      const { data } = await uploadClueImage({ path: { id: checkpointId }, body: { image } });
      if (data?.clue_media_url) onUploaded(data.clue_media_url);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (uploadError: unknown) {
      setError(getErrorMessage(uploadError, "Erro ao enviar a imagem"));
    } finally {
      setIsUploading(false);
    }
  };

  if (checkpointId === null) {
    return (
      <p className="text-xs text-muted-foreground">
        Cria o checkpoint primeiro para lhe juntares uma imagem-enigma.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {currentUrl && (
        <img
          src={currentUrl}
          alt="Imagem-enigma atual"
          className="max-h-40 rounded-lg object-cover"
        />
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        aria-label="Imagem do enigma"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
        className="hidden"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <BloodyButton
        type="button"
        variant="neutral"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
      >
        {isUploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ImagePlus className="h-4 w-4" />
        )}
        <span className="ml-1.5">{currentUrl ? "Substituir imagem" : "Enviar imagem"}</span>
      </BloodyButton>
    </div>
  );
}

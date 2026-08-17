import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { uploadClueImage } from "@/client";
import { BloodyButton } from "@/components/themes/bloody";
import { getErrorMessage } from "@/utils/errorHandling";

type ClueImageFieldProps = Readonly<{
  /** Null while creating: an upload needs a checkpoint to attach to, so the
   * picked file is staged instead via onFileSelected and sent right after
   * the checkpoint is created. */
  checkpointId: number | null;
  currentUrl: string | null;
  onUploaded: (url: string) => void;
  /** The file picked while checkpointId is still null. */
  pendingFile?: File | null;
  onFileSelected?: (file: File | null) => void;
}>;

/**
 * Picture-riddle upload for a checkpoint's clue.
 *
 * Goes to R2 through the API like every other image in the app (team photos,
 * checkpoint media) rather than asking an admin to paste a URL. Uploading
 * replaces the previous image, which the server deletes.
 *
 * While creating (checkpointId is null) there is nothing to attach the image
 * to yet, so the picked file is staged via onFileSelected instead of
 * uploaded; the caller sends it right after the checkpoint is created.
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
  pendingFile,
  onFileSelected,
}: ClueImageFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (image: File) => {
    if (checkpointId === null) {
      onFileSelected?.(image);
      return;
    }
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

  // Only staged, unsent files need an object URL preview; once uploaded the
  // server URL takes over. Revoked on cleanup so previews don't leak memory
  // across file picks.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (checkpointId !== null || !pendingFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [checkpointId, pendingFile]);
  const displayUrl = previewUrl ?? currentUrl;

  return (
    <div className="space-y-2">
      {checkpointId === null && pendingFile && (
        <p className="text-xs text-muted-foreground">Enviada assim que o checkpoint for criado.</p>
      )}
      {displayUrl && (
        <img
          src={displayUrl}
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
        <span className="ml-1.5">{displayUrl ? "Substituir imagem" : "Enviar imagem"}</span>
      </BloodyButton>
    </div>
  );
}

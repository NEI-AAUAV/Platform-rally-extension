import { useEffect, useRef, useState } from "react";
import { Star, X } from "lucide-react";
import { BloodyButton } from "@/components/themes/bloody";
import { useAppToast } from "@/hooks/use-toast";
import { DeferredJudgingService } from "@/client";
import useRallySettings from "@/hooks/useRallySettings";
import type { Team } from "@/types/forms";
import type { ActivityResultResponse } from "@/client";

interface DeferredJudgedFormProps {
  readonly activityId: number;
  readonly team: Team;
  readonly existingResult?: ActivityResultResponse | null;
  readonly onCaptured?: () => void;
}

export default function DeferredJudgedForm({ activityId, team, existingResult, onCaptured }: DeferredJudgedFormProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [settingTeamPhotoUrl, setSettingTeamPhotoUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useAppToast();
  const { settings } = useRallySettings();

  const mediaUrls = (existingResult as unknown as { media_urls?: string[] } | undefined)?.media_urls ?? [];
  const judgmentStatus = (existingResult as unknown as { judgment_status?: string } | undefined)?.judgment_status;
  const resultId = (existingResult as unknown as { id?: number } | undefined)?.id;
  const canSetTeamPhoto = Boolean(settings?.allow_photo_as_team_photo) && Boolean(resultId);

  const handleSetTeamPhoto = async (url: string) => {
    if (!resultId) return;
    setSettingTeamPhotoUrl(url);
    try {
      await DeferredJudgingService.setTeamPhotoFromResultApiRallyV1ActivitiesResultsResultIdSetTeamPhotoPut(
        resultId,
        { image_url: url },
      );
      toast.success("Foto definida como foto da equipa.");
    } catch {
      toast.error("Falha ao definir foto da equipa. Tenta novamente.");
    } finally {
      setSettingTeamPhotoUrl(null);
    }
  };

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  const addFiles = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      toast.error("Adiciona pelo menos uma foto antes de submeter.");
      return;
    }

    setIsUploading(true);
    try {
      await DeferredJudgingService.captureDeferredResultApiRallyV1ActivitiesDeferredActivityIdCapturePost(
        activityId,
        team.id,
        { images: files },
      );
      toast.success("Fotos enviadas. Aguarda avaliação do administrador.");
      setFiles([]);
      onCaptured?.();
    } catch {
      toast.error("Falha ao enviar fotos. Tenta novamente.");
    } finally {
      setIsUploading(false);
    }
  };

  const countSuffix = files.length > 0 ? `(${files.length})` : "";
  const submitLabel = isUploading ? "A enviar..." : `Enviar ${countSuffix} fotos`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {mediaUrls.length > 0 && (
        <div>
          <p className="block text-sm font-medium mb-2 text-foreground">
            Fotos já enviadas
          </p>
          <div className="grid grid-cols-3 gap-2">
            {mediaUrls.map((url) => (
              <div key={url} className="relative">
                <img src={url} alt="Foto submetida" className="w-full h-24 object-cover rounded border border-border" />
                {canSetTeamPhoto && (
                  <button
                    type="button"
                    onClick={() => handleSetTeamPhoto(url)}
                    disabled={settingTeamPhotoUrl === url}
                    className="absolute bottom-1 right-1 bg-black/60 text-white rounded-full p-1.5 hover:bg-black/80 transition-colors disabled:opacity-50"
                    aria-label="Definir como foto da equipa"
                    title="Definir como foto da equipa"
                  >
                    <Star className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Estado: {judgmentStatus === "judged" ? "Avaliado" : "Pendente de avaliação"}
          </p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-2 text-foreground">
          {mediaUrls.length > 0 ? "Adicionar mais fotos" : "Fotos da equipa"}
        </label>

        {previewUrls.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {previewUrls.map((url, index) => (
              <div key={url} className="relative">
                <img src={url} alt={`Pré-visualização ${index + 1}`} className="w-full h-24 object-cover rounded border border-border" />
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-700 transition-colors"
                  aria-label="Remover foto"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <BloodyButton
            type="button"
            variant="neutral"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 px-4 py-3"
          >
            Tirar foto
          </BloodyButton>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          onChange={(e) => {
            addFiles(e.target.files ? Array.from(e.target.files) : []);
            e.target.value = "";
          }}
          className="hidden"
        />
        <p className="text-muted-foreground text-sm mt-2">
          Esta atividade é avaliada posteriormente por um administrador a partir das fotos submetidas.
        </p>
      </div>

      <div className="flex gap-3 mt-6">
        <BloodyButton
          type="submit"
          disabled={isUploading || files.length === 0}
          variant="primary"
          blood={true}
          className="flex-1 px-6 py-3"
        >
          {submitLabel}
        </BloodyButton>
      </div>
    </form>
  );
}

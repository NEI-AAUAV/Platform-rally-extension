import { useState } from "react";
import { BloodyButton } from "@/components/themes/bloody";
import { useAppToast } from "@/hooks/use-toast";
import { DeferredJudgingService } from "@/client";
import type { Team } from "@/types/forms";
import type { ActivityResultResponse } from "@/client";

interface DeferredJudgedFormProps {
  activityId: number;
  team: Team;
  existingResult?: ActivityResultResponse | null;
  onCaptured?: () => void;
}

export default function DeferredJudgedForm({ activityId, team, existingResult, onCaptured }: DeferredJudgedFormProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const toast = useAppToast();

  const mediaUrls = (existingResult as unknown as { media_urls?: string[] } | undefined)?.media_urls ?? [];
  const judgmentStatus = (existingResult as unknown as { judgment_status?: string } | undefined)?.judgment_status;

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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {mediaUrls.length > 0 && (
        <div>
          <label className="block text-sm font-medium mb-2 text-foreground">
            Fotos já enviadas
          </label>
          <div className="grid grid-cols-3 gap-2">
            {mediaUrls.map((url) => (
              <img key={url} src={url} alt="Foto submetida" className="w-full h-24 object-cover rounded border border-border" />
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
        <input
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
          className="w-full p-3 bg-muted border border-border rounded text-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500"
        />
        <p className="text-muted-foreground text-sm mt-1">
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
          {isUploading ? "A enviar..." : "Enviar fotos"}
        </BloodyButton>
      </div>
    </form>
  );
}

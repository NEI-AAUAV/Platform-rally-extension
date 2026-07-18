import { useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Lightbulb, Trash2, Loader2, Image as ImageIcon } from "lucide-react";
import {
  listCheckpointMedia,
  createCheckpointMedia,
  deleteCheckpointMedia,
  type CheckpointMediaResponse,
} from "@/client";
import { BloodyButton } from "@/components/themes/bloody";
import { Input } from "@/components/ui/input";
import { useAppToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/utils/errorHandling";

type CheckpointMediaManagerProps = Readonly<{
  checkpointId: number;
}>;

const fieldClassName = "bg-muted border-border";

export default function CheckpointMediaManager({ checkpointId }: CheckpointMediaManagerProps) {
  const toast = useAppToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoCaption, setPhotoCaption] = useState("");
  const [funFact, setFunFact] = useState("");

  const queryKey = ["checkpoint-media", checkpointId];

  const { data: media = [], isLoading } = useQuery<CheckpointMediaResponse[]>({
    queryKey,
    queryFn: async () => {
      const { data } = await listCheckpointMedia({ path: { checkpoint_id: checkpointId } });
      return data ?? [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const uploadPhoto = useMutation({
    mutationFn: (image: Blob) =>
      createCheckpointMedia({
        path: { checkpoint_id: checkpointId },
        body: {
          kind: "photo",
          caption: photoCaption || null,
          image,
        },
      }),
    onSuccess: () => {
      invalidate();
      setPhotoCaption("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success("Foto do sítio adicionada!");
    },
    onError: (error) => toast.error(getErrorMessage(error, "Erro ao enviar foto")),
  });

  const addFunFact = useMutation({
    mutationFn: (caption: string) =>
      createCheckpointMedia({
        path: { checkpoint_id: checkpointId },
        body: {
          kind: "fun_fact",
          caption,
        },
      }),
    onSuccess: () => {
      invalidate();
      setFunFact("");
      toast.success("Curiosidade adicionada!");
    },
    onError: (error) => toast.error(getErrorMessage(error, "Erro ao adicionar curiosidade")),
  });

  const deleteMedia = useMutation({
    mutationFn: (mediaId: number) => deleteCheckpointMedia({ path: { media_id: mediaId } }),
    onSuccess: () => {
      invalidate();
      toast.success("Removido.");
    },
    onError: (error) => toast.error(getErrorMessage(error, "Erro ao remover")),
  });

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadPhoto.mutate(file);
  };

  const handleAddFunFact = () => {
    const trimmed = funFact.trim();
    if (trimmed) addFunFact.mutate(trimmed);
  };

  const photos = media.filter((m) => m.kind === "photo");
  const funFacts = media.filter((m) => m.kind === "fun_fact");

  let photosContent;
  if (isLoading) {
    photosContent = (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
      </div>
    );
  } else if (photos.length > 0) {
    photosContent = (
      <div className="flex flex-wrap gap-3">
        {photos.map((m) => (
          <div key={m.id} className="group relative">
            <img
              src={m.image_url ?? ""}
              alt={m.caption ?? "Foto do sítio"}
              className="h-24 w-24 rounded-lg object-cover ring-1 ring-border"
            />
            <button
              type="button"
              onClick={() => deleteMedia.mutate(m.id)}
              disabled={deleteMedia.isPending}
              className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-destructive text-destructive-foreground opacity-0 shadow transition group-hover:opacity-100"
              aria-label="Remover foto"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            {m.caption && (
              <p className="mt-1 line-clamp-1 w-24 text-[10px] text-muted-foreground">
                {m.caption}
              </p>
            )}
          </div>
        ))}
      </div>
    );
  } else {
    photosContent = (
      <p className="text-xs text-muted-foreground">
        Ainda sem fotos. Envie a primeira para a equipa adivinhar o sítio.
      </p>
    );
  }

  return (
    <div className="space-y-5 border-t border-border pt-4">
      {/* Photos */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ImageIcon className="h-4 w-4 text-primary" />
          Fotos do sítio
          <span className="text-xs font-normal text-muted-foreground">({photos.length})</span>
        </div>

        {photosContent}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={photoCaption}
            onChange={(e) => setPhotoCaption(e.target.value)}
            placeholder="Legenda (opcional)"
            className={`${fieldClassName} sm:max-w-xs`}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <BloodyButton
            type="button"
            variant="neutral"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadPhoto.isPending}
          >
            {uploadPhoto.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4" />
            )}
            <span className="ml-1.5">Enviar foto</span>
          </BloodyButton>
        </div>
      </section>

      {/* Fun facts */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          Curiosidades
          <span className="text-xs font-normal text-muted-foreground">({funFacts.length})</span>
        </div>

        {funFacts.length > 0 && (
          <ul className="space-y-2">
            {funFacts.map((m) => (
              <li
                key={m.id}
                className="flex items-start justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm"
              >
                <span className="flex-1">{m.caption}</span>
                <button
                  type="button"
                  onClick={() => deleteMedia.mutate(m.id)}
                  disabled={deleteMedia.isPending}
                  className="shrink-0 text-muted-foreground transition hover:text-destructive"
                  aria-label="Remover curiosidade"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={funFact}
            onChange={(e) => setFunFact(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddFunFact();
              }
            }}
            placeholder="Ex: Este edifício foi construído em 1890…"
            className={`${fieldClassName} flex-1`}
          />
          <BloodyButton
            type="button"
            variant="neutral"
            onClick={handleAddFunFact}
            disabled={addFunFact.isPending || !funFact.trim()}
          >
            {addFunFact.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Lightbulb className="h-4 w-4" />
            )}
            <span className="ml-1.5">Adicionar</span>
          </BloodyButton>
        </div>
      </section>
    </div>
  );
}

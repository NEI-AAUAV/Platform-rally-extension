import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Flag, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useAppToast } from "@/hooks/use-toast";
import { contestEvaluation } from "@/client";
import { apiErrorMessage } from "@/lib/apiError";

type ContestButtonProps = Readonly<{
  resultId: number;
  activityName?: string;
}>;

const MAX_REASON = 1000;

export default function ContestButton({ resultId, activityName }: ContestButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const toast = useAppToast();

  const mutation = useMutation({
    mutationFn: async (trimmed: string) => {
      await contestEvaluation({
        path: { result_id: resultId },
        body: { reason: trimmed },
      });
    },
    onSuccess: () => {
      setSubmitted(true);
      toast.success("Contestação enviada. A organização vai rever.");
      setOpen(false);
      setReason("");
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error, "Não foi possível enviar a contestação."));
    },
  });

  const handleSubmit = () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error("Explica porque estás a contestar.");
      return;
    }
    mutation.mutate(trimmed);
  };

  if (submitted) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-400">
        <Flag className="h-3.5 w-3.5" />
        Contestado
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-amber-400"
      >
        <Flag className="h-3.5 w-3.5" />
        Contestar
      </button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Contestar avaliação</AlertDialogTitle>
            <AlertDialogDescription>
              {activityName
                ? `Explica porque discordas da avaliação de "${activityName}".`
                : "Explica porque discordas desta avaliação."}{" "}
              A pontuação não muda já — a organização recebe a tua nota e revê.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON))}
            placeholder="Ex.: marcámos 8 pontos mas ficou registado 5."
            rows={4}
            aria-label="Motivo da contestação"
          />
          <p className="text-right text-xs text-muted-foreground">
            {reason.length}/{MAX_REASON}
          </p>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={mutation.isPending || reason.trim().length === 0}
            >
              {mutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Enviar contestação
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export { ContestButton };

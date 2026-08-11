import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BellRing, Send, AlertCircle, CheckCircle2, X } from "lucide-react";
import { pushCheckpointAnnouncement } from "@/client";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/utils/errorHandling";

const BODY_MAX = 500;

/**
 * Lets staff push a notification about their own post to every team, no
 * admin needed — "fila grande, contem 15 min", "posto fechado, sigam para
 * o 6". Server stamps the checkpoint's own name onto the title, so staff
 * can't post as if they were a different post or a generic admin message
 * (see `push_checkpoint_announcement` in the API).
 */
export default function CheckpointAnnouncement() {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [lastSentCount, setLastSentCount] = useState<number | null>(null);

  const announce = useMutation({
    mutationFn: () => pushCheckpointAnnouncement({ body: { body } }),
    onSuccess: (res) => {
      setLastSentCount(res.data?.sent ?? 0);
      setBody("");
    },
  });

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <BellRing className="mr-2 h-4 w-4" />
        Avisar equipas sobre este posto
      </Button>
    );
  }

  const canSend = body.trim().length > 0 && !announce.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setLastSentCount(null);
    announce.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="rally-surface space-y-3 rounded-xl p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <BellRing className="h-4 w-4 text-amber-500" />
          Avisar todas as equipas
        </div>
        <button
          type="button"
          aria-label="Fechar"
          onClick={() => setOpen(false)}
          className="text-muted-foreground transition hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <textarea
        value={body}
        maxLength={BODY_MAX}
        placeholder="Ex: Fila grande, contem 15 min de espera."
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        autoFocus
        className="w-full rounded-lg border border-border bg-muted p-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      />

      {announce.isError && (
        <div className="flex items-center gap-2 text-xs text-red-500">
          <AlertCircle className="h-4 w-4" />
          {getErrorMessage(announce.error, "Erro ao enviar aviso")}
        </div>
      )}

      {lastSentCount !== null && !announce.isError && (
        <div className="flex items-center gap-2 text-xs text-green-600">
          <CheckCircle2 className="h-4 w-4" />
          {lastSentCount > 0
            ? `Enviado a ${lastSentCount} dispositivo(s).`
            : "Nenhum dispositivo subscrito para receber."}
        </div>
      )}

      <Button type="submit" size="sm" disabled={!canSend}>
        <Send className="mr-2 h-4 w-4" />
        {announce.isPending ? "A enviar…" : "Enviar aviso"}
      </Button>
    </form>
  );
}

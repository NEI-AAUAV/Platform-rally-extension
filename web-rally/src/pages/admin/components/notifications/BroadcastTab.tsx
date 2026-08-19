import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BellRing, Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { pushBroadcast } from "@/client";
import { Input } from "@/components/ui/input";
import { BloodyButton } from "@/components/themes/bloody";
import { getErrorMessage } from "@/utils/errorHandling";

const TITLE_MAX = 100;
const BODY_MAX = 500;

/**
 * One-off announcement pushed to every device subscribed for notifications —
 * every team at once, not addressed to a single participant. Backed by
 * `POST /push/broadcast` (admin-only); a no-op with a 503 when VAPID isn't
 * configured on this deploy.
 */
export default function BroadcastTab() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [lastSentCount, setLastSentCount] = useState<number | null>(null);

  const broadcast = useMutation({
    mutationFn: () => pushBroadcast({ body: { title, body, url: url.trim() || null } }),
    onSuccess: (res) => {
      setLastSentCount(res.data?.sent ?? 0);
      setTitle("");
      setBody("");
      setUrl("");
    },
  });

  const canSend = title.trim().length > 0 && body.trim().length > 0 && !broadcast.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setLastSentCount(null);
    broadcast.mutate();
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center gap-2">
        <BellRing className="h-5 w-5 text-amber-500" />
        <h2 className="text-lg font-semibold">Anúncio a todas as equipas</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Envia uma notificação push a todos os dispositivos subscritos — ex. "Chuva a chegar,
        abrigem-se" ou "Atraso no posto 4". Quem não tiver notificações ativadas não recebe nada.
      </p>

      <form onSubmit={handleSubmit} className="rally-surface space-y-4 p-4">
        <label data-admin-search-key="broadcast_title" className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Título</span>
          <Input
            value={title}
            maxLength={TITLE_MAX}
            placeholder="Ex: Atenção equipas!"
            onChange={(e) => setTitle(e.target.value)}
            className="border-border bg-muted"
          />
        </label>

        <label data-admin-search-key="broadcast_message" className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Mensagem</span>
          <textarea
            value={body}
            maxLength={BODY_MAX}
            placeholder="Ex: Vai começar a chover, procurem abrigo no posto mais próximo."
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-border bg-muted p-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>

        <label data-admin-search-key="broadcast_link" className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Link ao clicar (opcional)
          </span>
          <Input
            value={url}
            placeholder="/scoreboard"
            onChange={(e) => setUrl(e.target.value)}
            className="border-border bg-muted"
          />
        </label>

        {broadcast.isError && (
          <div className="flex items-center gap-2 text-xs text-red-500">
            <AlertCircle className="h-4 w-4" />
            {getErrorMessage(broadcast.error, "Erro ao enviar anúncio")}
          </div>
        )}

        {lastSentCount !== null && !broadcast.isError && (
          <div className="flex items-center gap-2 text-xs text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            {lastSentCount > 0
              ? `Enviado a ${lastSentCount} dispositivo(s).`
              : "Nenhum dispositivo subscrito para receber."}
          </div>
        )}

        <BloodyButton type="submit" disabled={!canSend} className="w-full">
          <Send className="h-4 w-4" />
          <span className="ml-1.5">
            {broadcast.isPending ? "A enviar…" : "Enviar a todas as equipas"}
          </span>
        </BloodyButton>
      </form>
    </div>
  );
}

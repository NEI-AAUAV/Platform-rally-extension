import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ClipboardPaste } from "lucide-react";
import { importRoute, type CheckpointImportRow } from "@/client";
import { Textarea } from "@/components/ui/textarea";
import { BloodyButton } from "@/components/themes/bloody";
import { useAppToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/utils/errorHandling";

const PLACEHOLDER = [
  "Aristides\tFalar dos desportos\tA pista seria uma bola\tGirar 5x e acertar na baliza",
  "Refúgio dos Drinks\tCF DECIDE\tEstás a precisar de energia?\tCF DECIDE",
  "Bar 1",
].join("\n");

type RouteImportPanelProps = Readonly<{
  onImported: () => void;
}>;

/**
 * Paste the route table straight out of the planning document.
 *
 * Typing a dozen half-decided posts into a form is where planning in the app
 * loses to planning in a document — so the document's own table is the input
 * format. Everything lands as a draft, and the preview runs first so nobody
 * discovers the columns were in the wrong order after twelve posts exist.
 */
export default function RouteImportPanel({ onImported }: RouteImportPanelProps) {
  const toast = useAppToast();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<CheckpointImportRow[] | null>(null);

  const { mutate: runImport, isPending } = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const { data } = await importRoute({ body: { text, dry_run: dryRun } });
      return { data, dryRun };
    },
    onSuccess: ({ data, dryRun }) => {
      setPreview(data?.rows ?? []);
      if (dryRun) {
        return;
      }
      setText("");
      setPreview(null);
      onImported();
      toast.success(`${data?.created ?? 0} postos criados como rascunho`);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao importar a rota"));
    },
  });

  const hasText = text.trim().length > 0;

  return (
    <section className="rally-surface rounded-2xl p-6">
      <h3 className="mb-1 flex items-center gap-2 text-lg font-semibold">
        <ClipboardPaste className="h-4 w-4" />
        Importar rota planeada
      </h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Uma linha por posto, colunas separadas por tabulação: <strong>nome</strong>,{" "}
        <strong>guião do staff</strong>, <strong>pista</strong>, <strong>desafio</strong>. Células
        por decidir ("CF DECIDE") ficam vazias, e basta o nome para criar o posto. Tudo entra como
        rascunho.
      </p>
      <Textarea
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PLACEHOLDER}
        aria-label="Tabela da rota"
        className="font-mono border-border bg-muted text-xs"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <BloodyButton
          type="button"
          variant="neutral"
          disabled={!hasText || isPending}
          onClick={() => runImport(true)}
        >
          Pré-visualizar
        </BloodyButton>
        <BloodyButton
          type="button"
          disabled={!hasText || isPending}
          onClick={() => runImport(false)}
        >
          Criar rascunhos
        </BloodyButton>
      </div>

      {preview && (
        <div className="mt-4 overflow-x-auto">
          {preview.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum posto reconhecido no texto.</p>
          ) : (
            <table className="w-full min-w-[36rem] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3">Posto</th>
                  <th className="py-1 pr-3">Guião</th>
                  <th className="py-1 pr-3">Pista</th>
                  <th className="py-1">Desafio</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, index) => (
                  <tr key={`${row.name}-${index}`} className="border-t border-border align-top">
                    <td className="py-1 pr-3 font-medium">
                      {row.name}
                      {row.is_placeholder && (
                        <span className="ml-1 text-muted-foreground">(provisório)</span>
                      )}
                    </td>
                    <td className="py-1 pr-3">{row.staff_script ?? "—"}</td>
                    <td className="py-1 pr-3">{row.clue ?? "—"}</td>
                    <td className="py-1">{row.challenge_brief ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

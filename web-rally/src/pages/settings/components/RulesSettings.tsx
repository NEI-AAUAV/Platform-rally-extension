/**
 * Admin editor for the public /rules page.
 *
 * Two independent write paths, deliberately kept apart:
 *  - Section copy overrides (rules_content) are plain form fields, saved with
 *    the rest of the settings form (see ../index.tsx) — same as every other
 *    setting on this page.
 *  - The regulation PDF is uploaded straight to R2 the moment a file is
 *    picked, mirroring the favicon/banner/logo upload pattern in
 *    admin/components/branding/BrandingSettings.tsx (self-contained
 *    useMutation, not part of the form's Save button).
 */
import { useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Upload, X } from "lucide-react";
import { viewRallySettings, uploadRallyRulesPdf, type RallySettingsResponse } from "@/client";
import { Button } from "@/components/ui/button";
import { useAppToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/utils/errorHandling";
import { SettingGroup, SettingTextarea } from "./SettingFields";

const ADMIN_KEY = ["rallySettings-admin"] as const;

const RULES_SECTION_PLACEHOLDERS: Record<string, string> = {
  how: "Cada equipa percorre os postos do rally. Em cada posto há uma ou mais atividades avaliadas pelo staff, que somam pontos à classificação da equipa.",
  score:
    "A pontuação de cada equipa resulta das atividades concluídas em cada posto. A classificação atualiza em tempo real no leaderboard.",
  versus:
    "Em determinados postos, equipas enfrentam-se diretamente. O resultado do confronto influencia a pontuação de ambas as equipas.",
  badges:
    "As equipas ganham distintivos por feitos especiais durante o rally (vitórias em versus, rapidez, liderança). Aparecem no perfil da equipa.",
  checkin:
    "Em alguns postos, a equipa faz check-in lendo o código QR apresentado pelo staff — ou o staff lê o código da equipa. Confirma a chegada da equipa ao posto.",
};

function RulesPdfUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useAppToast();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ADMIN_KEY,
    queryFn: async () => (await viewRallySettings()).data,
    staleTime: 5 * 60 * 1000,
  });

  const [fileName, setFileName] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ADMIN_KEY });
    void queryClient.invalidateQueries({ queryKey: ["rallySettings-public"] });
  };

  const { mutate, isPending } = useMutation({
    mutationFn: async (file: File) => {
      const { data } = await uploadRallyRulesPdf({ body: { image: file } });
      return data as RallySettingsResponse;
    },
    onSuccess: () => {
      toast.success("Regulamento atualizado com sucesso!");
      setFileName(null);
      invalidate();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao carregar o regulamento"));
      setFileName(null);
    },
  });

  const handleSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    mutate(file);
    event.target.value = "";
  };

  const currentUrl = settings?.rules_pdf_url;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-muted p-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
        <FileText className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="font-semibold">Regulamento oficial (PDF)</h4>
        <p className="text-xs text-muted-foreground">
          Documento completo, opcional · PDF · máx 15MB
        </p>
        {currentUrl ? (
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rally-accent mt-1 inline-block text-xs font-medium underline underline-offset-2"
          >
            Ver regulamento atual
          </a>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Nenhum regulamento carregado.</p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
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
        {isPending ? "A carregar..." : currentUrl ? "Substituir" : "Carregar"}
      </Button>
      {fileName && isPending && (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <X className="h-3 w-3" />
          {fileName}
        </span>
      )}
    </div>
  );
}

export default function RulesSettings() {
  return (
    <div className="space-y-8">
      <SettingGroup
        title="Texto das secções"
        description="Substitui o texto de cada secção da página /regras. Deixar em branco mantém o texto por defeito (que inclui valores de pontuação ao vivo)."
        icon={<FileText className="h-4 w-4" />}
      >
        <SettingTextarea
          name="rules_content.how"
          label="Como funciona"
          placeholder={RULES_SECTION_PLACEHOLDERS.how}
          maxLength={4000}
        />
        <SettingTextarea
          name="rules_content.score"
          label="Pontuação"
          placeholder={RULES_SECTION_PLACEHOLDERS.score}
          maxLength={4000}
        />
        <SettingTextarea
          name="rules_content.versus"
          label="Modo Versus"
          placeholder={RULES_SECTION_PLACEHOLDERS.versus}
          maxLength={4000}
        />
        <SettingTextarea
          name="rules_content.badges"
          label="Distintivos"
          placeholder={RULES_SECTION_PLACEHOLDERS.badges}
          maxLength={4000}
        />
        <SettingTextarea
          name="rules_content.checkin"
          label="Check-in nos postos"
          placeholder={RULES_SECTION_PLACEHOLDERS.checkin}
          maxLength={4000}
        />
      </SettingGroup>

      <RulesPdfUpload />
    </div>
  );
}

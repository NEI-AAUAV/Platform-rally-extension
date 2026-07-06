import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Award, Loader2, Trash2 } from "lucide-react";
import { TeamService, type BadgeDefinitionResponse } from "@/client";
import { useBadgeAwardMutations } from "@/hooks/useBadgeAdmin";
import { useTeamBadges } from "@/hooks/useBadges";
import { apiErrorMessage } from "@/lib/apiError";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ManualAwardPanelProps {
  definitions: BadgeDefinitionResponse[];
}

export default function ManualAwardPanel({ definitions }: ManualAwardPanelProps) {
  const [teamId, setTeamId] = useState<string>("");
  const [badgeCode, setBadgeCode] = useState<string>("");
  const { award, revoke } = useBadgeAwardMutations();

  const { data: teams } = useQuery({
    queryKey: ["teams", "all"],
    queryFn: () => TeamService.getTeamsApiRallyV1TeamGet(),
  });

  const numericTeamId = teamId ? Number(teamId) : undefined;
  const { data: teamBadges } = useTeamBadges(numericTeamId);

  const defByCode = new Map(definitions.map((d) => [d.code, d]));
  const awardError = award.isError && apiErrorMessage(award.error, "Erro ao atribuir.");

  const handleAward = () => {
    if (!numericTeamId || !badgeCode) return;
    award.mutate({ team_id: numericTeamId, badge_code: badgeCode });
  };

  return (
    <div className="rally-surface space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Award className="h-4 w-4 text-amber-500" />
        <p className="text-sm font-semibold">Atribuição manual</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Equipa</span>
          <Select value={teamId || undefined} onValueChange={setTeamId}>
            <SelectTrigger>
              <SelectValue placeholder="Escolher equipa…" />
            </SelectTrigger>
            <SelectContent>
              {(teams ?? []).map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Crachá</span>
          <Select value={badgeCode || undefined} onValueChange={setBadgeCode}>
            <SelectTrigger>
              <SelectValue placeholder="Escolher crachá…" />
            </SelectTrigger>
            <SelectContent>
              {definitions.map((d) => (
                <SelectItem key={d.code} value={d.code}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      {awardError && (
        <div className="flex items-center gap-2 text-xs text-red-500">
          <AlertCircle className="h-4 w-4" />
          {awardError}
        </div>
      )}

      <button
        type="button"
        className="rally-press flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        disabled={!numericTeamId || !badgeCode || award.isPending}
        onClick={handleAward}
      >
        {award.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Atribuir crachá
      </button>

      {/* revoke: awards the chosen team currently holds */}
      {numericTeamId && (teamBadges?.length ?? 0) > 0 && (
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-semibold text-muted-foreground">Crachás desta equipa</p>
          <ul className="space-y-1.5">
            {(teamBadges ?? []).map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <span className="flex-1 truncate">
                  {defByCode.get(b.badge_type)?.name ?? b.badge_type}
                </span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      title="Revogar"
                      className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-red-500/10 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Revogar crachá?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Remover "{defByCode.get(b.badge_type)?.name ?? b.badge_type}" desta equipa.
                        Esta ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => revoke.mutate(b.id)}>
                        Revogar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

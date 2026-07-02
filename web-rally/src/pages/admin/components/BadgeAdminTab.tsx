import { useState } from "react";
import {
  Pencil,
  Plus,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Trophy,
} from "lucide-react";
import type { BadgeDefinitionResponse } from "@/client";
import {
  useBadgeDefinitions,
  useBadgeDefinitionMutations,
} from "@/hooks/useBadgeAdmin";
import { triggerMeta } from "@/lib/badgeTriggers";
import { BADGE_FALLBACK } from "@/lib/badges";
import BadgeForm from "./BadgeForm";
import ManualAwardPanel from "./ManualAwardPanel";
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

type FormMode = { open: false } | { open: true; editing: BadgeDefinitionResponse | null };

export default function BadgeAdminTab() {
  const { data: badges = [], isLoading } = useBadgeDefinitions();
  const { update, remove } = useBadgeDefinitionMutations();
  const [formMode, setFormMode] = useState<FormMode>({ open: false });

  const toggleActive = (badge: BadgeDefinitionResponse) =>
    update.mutate({ id: badge.id, data: { is_active: !badge.is_active } });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="h-5 w-5 text-amber-500" />
        <h2 className="text-lg font-semibold">Catálogo de Crachás</h2>
        {!formMode.open && (
          <button
            type="button"
            className="rally-press ml-auto flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            onClick={() => setFormMode({ open: true, editing: null })}
          >
            <Plus className="h-3.5 w-3.5" />
            Novo crachá
          </button>
        )}
      </div>

      {formMode.open && (
        <BadgeForm
          editing={formMode.editing}
          onDone={() => setFormMode({ open: false })}
        />
      )}

      {isLoading && (
        <p className="py-8 text-center text-sm text-muted-foreground">A carregar…</p>
      )}

      {!isLoading && badges.length === 0 && !formMode.open && (
        <div className="rally-surface flex flex-col items-center gap-3 py-12 text-center">
          <Trophy className="h-10 w-10 text-muted-foreground/40" />
          <p className="font-semibold text-muted-foreground">Sem crachás no catálogo</p>
          <p className="text-xs text-muted-foreground">Cria o primeiro crachá acima.</p>
        </div>
      )}

      <ul className="space-y-2">
        {badges.map((badge) => {
          const trigger = badge.is_auto ? triggerMeta(badge.trigger_type) : null;
          return (
            <li key={badge.id} className="rally-surface flex items-start gap-3 p-3">
              {badge.icon_url ? (
                <img
                  src={badge.icon_url}
                  alt=""
                  className="h-10 w-10 rounded-lg object-cover"
                />
              ) : (
                <div
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-lg text-white"
                  style={{ background: badge.color || BADGE_FALLBACK.color }}
                  aria-hidden
                >
                  {badge.glyph || BADGE_FALLBACK.glyph}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight">{badge.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{badge.code}</p>
                {badge.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {badge.description}
                  </p>
                )}
                <span
                  className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    badge.is_auto
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {badge.is_auto ? trigger?.label ?? "Automático" : "Manual"}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  title="Editar"
                  className="rounded-lg p-2 text-muted-foreground transition hover:bg-accent"
                  onClick={() => setFormMode({ open: true, editing: badge })}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title={badge.is_active ? "Desativar" : "Ativar"}
                  className="rounded-lg p-2 text-muted-foreground transition hover:bg-accent"
                  onClick={() => toggleActive(badge)}
                >
                  {badge.is_active ? (
                    <ToggleRight className="h-5 w-5 text-green-500" />
                  ) : (
                    <ToggleLeft className="h-5 w-5" />
                  )}
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      title="Eliminar"
                      className="rounded-lg p-2 text-muted-foreground transition hover:bg-red-500/10 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Eliminar crachá?</AlertDialogTitle>
                      <AlertDialogDescription>
                        "{badge.name}" será removido do catálogo. Esta ação não pode
                        ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove.mutate(badge.id)}>
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </li>
          );
        })}
      </ul>

      {!isLoading && badges.length > 0 && <ManualAwardPanel definitions={badges} />}
    </div>
  );
}

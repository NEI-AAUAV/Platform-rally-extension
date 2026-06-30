import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trophy, Plus, Trash2, ToggleLeft, ToggleRight, AlertCircle } from "lucide-react";
import {
  BadgeAdminService,
  type BadgeDefinitionResponse,
  type BadgeDefinitionCreate,
} from "@/client";

type CreateForm = { code: string; name: string; description: string };

const EMPTY_FORM: CreateForm = { code: "", name: "", description: "" };

export default function BadgeAdminTab() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);

  const { data: badges = [], isLoading } = useQuery<BadgeDefinitionResponse[]>({
    queryKey: ["badge-definitions"],
    queryFn: () => BadgeAdminService.listBadgeDefinitionsApiRallyV1BadgeDefinitionsGet(),
  });

  const createMutation = useMutation({
    mutationFn: (data: BadgeDefinitionCreate) =>
      BadgeAdminService.createBadgeDefinitionApiRallyV1BadgeDefinitionsPost(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["badge-definitions"] });
      setShowCreate(false);
      setForm(EMPTY_FORM);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      BadgeAdminService.updateBadgeDefinitionApiRallyV1BadgeDefinitionsIdPut(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["badge-definitions"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      BadgeAdminService.deleteBadgeDefinitionApiRallyV1BadgeDefinitionsIdDelete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["badge-definitions"] }),
  });

  const handleCreate = () => {
    if (!form.code || !form.name) return;
    createMutation.mutate({
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description || undefined,
    } as BadgeDefinitionCreate);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="h-5 w-5 text-amber-500" />
        <h2 className="text-lg font-semibold">Catálogo de Crachás</h2>
        <button
          type="button"
          className="rally-press ml-auto flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          onClick={() => setShowCreate((v) => !v)}
        >
          <Plus className="h-3.5 w-3.5" />
          Novo crachá
        </button>
      </div>

      {showCreate && (
        <div className="rally-surface space-y-3 p-4">
          <p className="text-sm font-semibold">Criar crachá</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Código único *</span>
              <input
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="ex: first_arrival"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Nome *</span>
              <input
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Nome do crachá"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Descrição</span>
            <textarea
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              rows={2}
              placeholder="Descrição opcional…"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          {createMutation.isError && (
            <div className="flex items-center gap-2 text-xs text-red-500">
              <AlertCircle className="h-4 w-4" />
              Erro ao criar crachá. O código já existe?
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="rally-press rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              disabled={createMutation.isPending || !form.code || !form.name}
              onClick={handleCreate}
            >
              {createMutation.isPending ? "A criar…" : "Criar"}
            </button>
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-accent"
              onClick={() => { setShowCreate(false); setForm(EMPTY_FORM); }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {isLoading && (
        <p className="py-8 text-center text-sm text-muted-foreground">A carregar…</p>
      )}

      {!isLoading && badges.length === 0 && !showCreate && (
        <div className="rally-surface flex flex-col items-center gap-3 py-12 text-center">
          <Trophy className="h-10 w-10 text-muted-foreground/40" />
          <p className="font-semibold text-muted-foreground">Sem crachás no catálogo</p>
          <p className="text-xs text-muted-foreground">Cria o primeiro crachá acima.</p>
        </div>
      )}

      <ul className="space-y-2">
        {badges.map((badge) => (
          <li
            key={badge.id}
            className="rally-surface flex items-start gap-3 p-3"
          >
            {badge.icon_url ? (
              <img src={badge.icon_url} alt={badge.name} className="h-10 w-10 rounded-lg object-cover" />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
                <Trophy className="h-5 w-5 text-amber-500" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-tight">{badge.name}</p>
              <p className="text-xs text-muted-foreground font-mono">{badge.code}</p>
              {badge.description && (
                <p className="mt-0.5 text-xs text-muted-foreground">{badge.description}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                title={badge.is_active ? "Desativar" : "Ativar"}
                className="rounded-lg p-2 text-muted-foreground transition hover:bg-accent"
                onClick={() => toggleMutation.mutate({ id: badge.id, is_active: !badge.is_active })}
              >
                {badge.is_active ? (
                  <ToggleRight className="h-5 w-5 text-green-500" />
                ) : (
                  <ToggleLeft className="h-5 w-5" />
                )}
              </button>
              <button
                type="button"
                title="Eliminar"
                className="rounded-lg p-2 text-muted-foreground transition hover:bg-red-500/10 hover:text-red-500"
                onClick={() => {
                  if (confirm(`Eliminar "${badge.name}"?`)) {
                    deleteMutation.mutate(badge.id);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

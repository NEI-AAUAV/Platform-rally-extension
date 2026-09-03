import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Zap, Plus, Trash2, AlertCircle, ToggleLeft, ToggleRight } from "lucide-react";
import {
  listDynamicRules,
  createDynamicRule,
  updateDynamicRule,
  deleteDynamicRule,
  listDynamicAwards,
  createDynamicAward,
  deleteDynamicAward,
  getTeams,
  type DynamicRuleResponse,
  type DynamicAwardResponse,
  type ListingTeam,
} from "@/client";

type RuleForm = { name: string; points: string; description: string };
type AwardForm = { team_id: string; points: string; reason: string };

const EMPTY_RULE: RuleForm = { name: "", points: "", description: "" };
const EMPTY_AWARD: AwardForm = { team_id: "", points: "", reason: "" };

function RulesSection() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<RuleForm>(EMPTY_RULE);

  const { data: rules = [] } = useQuery<DynamicRuleResponse[]>({
    queryKey: ["dynamic-rules"],
    queryFn: async () => {
      const { data } = await listDynamicRules();
      return data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createDynamicRule({
        body: {
          name: form.name.trim(),
          points: Math.abs(Number.parseFloat(form.points)),
          description: form.description || undefined,
          is_active: true,
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dynamic-rules"] });
      setShowForm(false);
      setForm(EMPTY_RULE);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      updateDynamicRule({ path: { rule_id: id }, body: { is_active } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["dynamic-rules"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteDynamicRule({ path: { rule_id: id } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["dynamic-rules"] }),
  });

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Penalizações globais</h3>
          <button
            type="button"
            className="rally-press ml-auto flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground"
            onClick={() => setShowForm((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5" /> Nova penalização
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Contadores disponíveis ao staff na avaliação de <strong>qualquer posto</strong>. Cada
          ocorrência registada desconta os pontos indicados. As restantes penalizações são
          específicas de cada prova.
        </p>
      </div>

      {showForm && (
        <div className="rally-surface space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <label data-admin-search-key="rule_name" className="space-y-1">
              <span className="text-xs text-muted-foreground">Nome *</span>
              <input
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="ex: Atraso no posto"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label data-admin-search-key="rule_points" className="space-y-1">
              <span className="text-xs text-muted-foreground">
                Pontos a descontar por ocorrência *
              </span>
              <input
                type="number"
                min="0"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="ex: 10"
                value={form.points}
                onChange={(e) => setForm({ ...form, points: e.target.value })}
              />
            </label>
            <label data-admin-search-key="rule_description" className="space-y-1">
              <span className="text-xs text-muted-foreground">Descrição</span>
              <input
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Opcional"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
          </div>
          {createMutation.isError && (
            <div className="flex items-center gap-2 text-xs text-red-500">
              <AlertCircle className="h-4 w-4" /> Erro ao criar penalização.
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="rally-press rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              disabled={createMutation.isPending || !form.name || !form.points}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? "A criar…" : "Criar"}
            </button>
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
              onClick={() => {
                setShowForm(false);
                setForm(EMPTY_RULE);
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {rules.length === 0 && !showForm && (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Sem penalizações globais definidas.
        </p>
      )}

      <ul className="space-y-2">
        {rules.map((rule) => (
          <li key={rule.id} className="rally-surface flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-tight">{rule.name}</p>
              <p className="text-xs text-muted-foreground">
                −{Math.abs(rule.points)} pts por ocorrência · todos os postos
                {rule.description ? ` · ${rule.description}` : ""}
              </p>
            </div>
            <button
              type="button"
              title={rule.is_active ? "Desativar" : "Ativar"}
              aria-label={`${rule.is_active ? "Desativar" : "Ativar"} penalização ${rule.name}`}
              className="rounded-lg p-2 text-muted-foreground hover:bg-accent"
              onClick={() => toggleMutation.mutate({ id: rule.id, is_active: !rule.is_active })}
            >
              {rule.is_active ? (
                <ToggleRight className="h-5 w-5 text-green-500" />
              ) : (
                <ToggleLeft className="h-5 w-5" />
              )}
            </button>
            <button
              type="button"
              title="Eliminar"
              aria-label={`Eliminar penalização ${rule.name}`}
              className="rounded-lg p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
              onClick={() => {
                if (confirm(`Eliminar penalização "${rule.name}"?`)) deleteMutation.mutate(rule.id);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AwardsSection({ teams }: Readonly<{ teams: readonly ListingTeam[] }>) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AwardForm>(EMPTY_AWARD);

  const { data: awards = [] } = useQuery<DynamicAwardResponse[]>({
    queryKey: ["dynamic-awards"],
    queryFn: async () => {
      const { data } = await listDynamicAwards();
      return data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createDynamicAward({
        body: {
          team_id: Number.parseInt(form.team_id),
          points: Number.parseFloat(form.points),
          reason: form.reason || undefined,
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dynamic-awards"] });
      // An award moves team.total, so the standings must be refetched too.
      void qc.invalidateQueries({ queryKey: ["teams"] });
      setShowForm(false);
      setForm(EMPTY_AWARD);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteDynamicAward({ path: { award_id: id } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dynamic-awards"] });
      void qc.invalidateQueries({ queryKey: ["teams"] });
    },
  });

  const teamName = (id: number) => teams.find((t) => t.id === id)?.name ?? `#${id}`;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Prémios / Ajustes manuais</h3>
        <button
          type="button"
          className="rally-press ml-auto flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground"
          onClick={() => setShowForm((v) => !v)}
        >
          <Plus className="h-3.5 w-3.5" /> Novo prémio
        </button>
      </div>

      {showForm && (
        <div className="rally-surface space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <label data-admin-search-key="award_team" className="space-y-1">
              <span className="text-xs text-muted-foreground">Equipa *</span>
              <select
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={form.team_id}
                onChange={(e) => setForm({ ...form, team_id: e.target.value })}
              >
                <option value="">Selecionar…</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label data-admin-search-key="award_points" className="space-y-1">
              <span className="text-xs text-muted-foreground">Pontos *</span>
              <input
                type="number"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="ex: -10 ou 50"
                value={form.points}
                onChange={(e) => setForm({ ...form, points: e.target.value })}
              />
            </label>
            <label data-admin-search-key="award_reason" className="space-y-1">
              <span className="text-xs text-muted-foreground">Razão</span>
              <input
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Opcional"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </label>
          </div>
          {createMutation.isError && (
            <div className="flex items-center gap-2 text-xs text-red-500">
              <AlertCircle className="h-4 w-4" /> Erro ao criar prémio.
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="rally-press rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              disabled={createMutation.isPending || !form.team_id || !form.points}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? "A criar…" : "Criar"}
            </button>
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
              onClick={() => {
                setShowForm(false);
                setForm(EMPTY_AWARD);
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {awards.filter((a) => a.is_active).length === 0 && !showForm && (
        <p className="py-4 text-center text-xs text-muted-foreground">Sem prémios ativos.</p>
      )}

      <ul className="space-y-2">
        {awards
          .filter((a) => a.is_active)
          .map((award) => (
            <li key={award.id} className="rally-surface flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight">{teamName(award.team_id)}</p>
                <p className="text-xs text-muted-foreground">
                  {award.points > 0 ? "+" : ""}
                  {award.points} pts
                  {award.reason ? ` · ${award.reason}` : ""}
                </p>
              </div>
              <button
                type="button"
                title="Revogar"
                aria-label={`Revogar prémio de ${teamName(award.team_id)}`}
                className="rounded-lg p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                onClick={() => {
                  if (confirm("Revogar este prémio?")) deleteMutation.mutate(award.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
      </ul>
    </section>
  );
}

export default function DynamicScoringTab() {
  const { data: teams = [] } = useQuery<ListingTeam[]>({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data } = await getTeams();
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Zap className="h-5 w-5 text-amber-500" />
        <h2 className="text-lg font-semibold">Pontuação Dinâmica</h2>
      </div>
      <RulesSection />
      <div className="border-t border-border" />
      <AwardsSection teams={teams} />
    </div>
  );
}

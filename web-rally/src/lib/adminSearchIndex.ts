/**
 * Every labeled field across the admin area, flattened into one searchable
 * list, so "find the setting/field named X" doesn't require knowing which of
 * the 18 tabs (and, inside Settings, which of the 7 sections) it lives under.
 *
 * Each entry's `key` matches the `data-admin-search-key` attribute stamped on
 * that field's wrapper in the actual component — see useScrollToSearchTarget.
 * Entries with `tabOnly: true` have no single field to scroll to (dashboards,
 * read-only lists); picking one just switches tab.
 *
 * Data is authored as flat tuples grouped by section/tab and expanded by the
 * `settingsEntries`/`tabEntries` helpers below — spelling out the same four
 * object keys on ~90 near-identical entries is what actually hurts to read.
 */
import type { AdminTabId } from "@/router/routes";
import type { SettingsSectionId } from "@/pages/settings/sections";

export interface AdminSearchEntry {
  readonly key: string;
  readonly label: string;
  readonly tabId: AdminTabId;
  /** Only set for tabId "settings" — which of its sections holds this field. */
  readonly settingsSectionId?: SettingsSectionId;
  /** A parent switch that must be on before this field renders. */
  readonly requiresField?: { readonly name: string; readonly value: boolean };
  /** True when a match should only switch tab — no field to scroll/highlight. */
  readonly tabOnly?: boolean;
}

type RequiresField = AdminSearchEntry["requiresField"];
/** [key, label] or [key, label, requiresField]. */
type SettingsTuple = readonly [string, string] | readonly [string, string, RequiresField];
/** [key, label]. */
type TabTuple = readonly [string, string];

function settingsEntries(
  sectionId: SettingsSectionId,
  tuples: readonly SettingsTuple[],
): AdminSearchEntry[] {
  return tuples.map(([key, label, requiresField]) => ({
    key,
    label,
    tabId: "settings",
    settingsSectionId: sectionId,
    ...(requiresField && { requiresField }),
  }));
}

function tabEntries(tabId: AdminTabId, tuples: readonly TabTuple[]): AdminSearchEntry[] {
  return tuples.map(([key, label]) => ({ key, label, tabId }));
}

const ON_HINTS_ENABLED: RequiresField = { name: "hints_enabled", value: true };
const ON_SKIP_ENABLED: RequiresField = { name: "skip_enabled", value: true };
const ON_LEG_TIME_SCORING: RequiresField = { name: "leg_time_scoring_enabled", value: true };

export const ADMIN_SEARCH_INDEX: readonly AdminSearchEntry[] = [
  ...settingsEntries("equipas", [
    ["max_teams", "Número máximo de equipas"],
    ["max_members_per_team", "Máximo de membros por equipa"],
    ["enable_versus", "Ativar modo versus"],
    ["allow_staff_registration", "Inscrições no local pelo staff"],
  ]),

  ...settingsEntries("pontuacao", [
    ["enable_staff_scoring", "Permitir pontuação manual pelos staff"],
    ["penalty_per_puke", "Penalização por vómito"],
    ["penalty_per_not_drinking", "Penalização por não beber"],
    ["bonus_per_extra_shot", "Bónus por shot extra"],
    ["max_extra_shots_per_member", "Máximo shots extra por membro"],
  ]),

  ...settingsEntries("jogo", [
    ["reveal_next_checkpoint", "Revelar o próximo posto antes da chegada"],
    ["reveal_on_arrival", "Revelar o posto ao chegar"],
    ["participant_view_enabled", "Ativar visualização para participantes"],
    ["gps_checkin_enabled", "Check-in por GPS feito pela equipa"],
    ["guide_manual_arrival_enabled", "Guias podem marcar chegadas"],
    ["hints_enabled", "Permitir pedir pistas"],
    ["hint_penalty", "Custo de uma pista", ON_HINTS_ENABLED],
    ["skip_enabled", "Permitir desistir de um posto"],
    ["skip_penalty", "Custo de desistir de um posto", ON_SKIP_ENABLED],
  ]),

  ...settingsEntries("rota", [
    ["checkpoint_order_matters", "A ordem dos postos importa"],
    ["route_stages_enabled", "Etapas da rota"],
    ["checkpoint_hours_enabled", "Respeitar horários dos postos"],
    ["leg_time_scoring_enabled", "Pontuar tempo de percurso entre postos"],
    ["leg_time_target_minutes", "Tempo esperado entre postos", ON_LEG_TIME_SCORING],
    ["leg_time_points_per_minute", "Pontos por minuto de desvio", ON_LEG_TIME_SCORING],
    ["leg_time_max_adjustment", "Limite do ajuste por percurso", ON_LEG_TIME_SCORING],
    ["proximity_enabled", "Botão estou perto"],
    ["compass_enabled", "Bússola"],
    ["search_radius_m", "Raio da zona de busca"],
  ]),

  ...settingsEntries("visualizacao", [
    ["show_score_mode", "Modo de Visualização da Pontuação"],
    ["show_live_leaderboard", "Mostrar leaderboard em tempo real"],
    ["show_team_details", "Mostrar detalhes das equipas"],
    ["show_route_mode", "Modo de Visualização do Trajeto"],
    ["show_checkpoint_map", "Mostrar mapa dos checkpoints"],
    ["public_access_enabled", "Permitir acesso público"],
    ["guide_mode_enabled", "Ativar funcionalidade de modo guia"],
    ["guide_mode_active", "Modo guia ativo neste evento"],
    ["badges_enabled", "Ativar crachás/conquistas"],
    ["allow_photo_as_team_photo", "Permitir staff definir foto de atividade como foto da equipa"],
  ]),

  ...settingsEntries("inicio", [
    ["home_layout", "Secções da página inicial"],
    ["ticker_items_list", "Faixa de destaques"],
  ]),

  ...settingsEntries("regras", [["rules_sections", "Secções de regras"]]),

  // Branding reuses its existing element ids as the search key.
  ...tabEntries("branding", [
    ["event_name", "Nome do evento"],
    ["event_subtitle", "Subtítulo do evento"],
    ["accent_color", "Cor de destaque"],
  ]),

  ...tabEntries("events", [
    ["ev-name", "Nome da edição"],
    ["ev-type", "Tipo de edição"],
    ["ev-start", "Início da edição"],
    ["ev-end", "Fim da edição"],
    ["ev-desc", "Descrição da edição"],
  ]),

  ...tabEntries("teams", [
    ["team_name", "Nome da equipa"],
    ["team_offset_minutes", "Partida desfasada"],
  ]),

  // Checkpoints: create/edit form fields, plus the route-stage creation field.
  ...tabEntries("checkpoints", [
    ["checkpoint_name", "Nome do checkpoint"],
    ["checkpoint_provisional", "Nome provisório do checkpoint"],
    ["checkpoint_description", "Descrição do checkpoint"],
    ["checkpoint_latitude", "Latitude do checkpoint"],
    ["checkpoint_longitude", "Longitude do checkpoint"],
    ["checkpoint_radius", "Raio de chegada do checkpoint"],
    ["checkpoint_clue", "Enigma para a equipa"],
    ["checkpoint_staff_script", "Guião do staff"],
    ["checkpoint_challenge_brief", "Desafio em texto"],
    ["checkpoint_stage", "Etapa do checkpoint"],
    ["checkpoint_opens_at", "Checkpoint abre a"],
    ["checkpoint_closes_at", "Checkpoint fecha a"],
    ["checkpoint_draft", "Checkpoint em rascunho"],
    ["new_stage_name", "Nome da nova etapa"],
  ]),

  ...tabEntries("scoring", [
    ["rule_name", "Nome da regra de pontuação"],
    ["rule_type", "Tipo da regra de pontuação"],
    ["rule_points", "Pontos da regra"],
    ["rule_description", "Descrição da regra de pontuação"],
    ["award_team", "Equipa do prémio manual"],
    ["award_points", "Pontos do prémio manual"],
    ["award_rule", "Regra do prémio manual"],
    ["award_reason", "Razão do prémio manual"],
  ]),

  ...tabEntries("badges", [
    ["badge_code", "Código único do crachá"],
    ["badge_name", "Nome do crachá"],
    ["badge_description", "Descrição do crachá"],
    ["badge_color", "Cor do crachá"],
    ["badge_emoji", "Emoji do crachá"],
    ["badge_auto_award", "Atribuição automática de crachá"],
    // No requiresField flip: BadgeForm's "auto award" toggle is local
    // component state, not a form the search can reach into like Settings
    // can. If "Atribuição automática" isn't already on, this quietly times out.
    ["badge_trigger", "Condição de atribuição do crachá"],
    ["award_manual_team", "Equipa para atribuir crachá"],
    ["award_manual_badge", "Crachá a atribuir manualmente"],
  ]),

  ...tabEntries("notifications", [
    ["broadcast_title", "Título do anúncio"],
    ["broadcast_message", "Mensagem do anúncio"],
    ["broadcast_link", "Link ao clicar no anúncio"],
  ]),

  // Tab-only: no single field to jump to, so a match just switches tab.
  ...tabEntries("dashboard", [["tab:dashboard", "Painel ao vivo"]]).map((e) => ({
    ...e,
    tabOnly: true,
  })),
  ...tabEntries("metrics", [["tab:metrics", "Métricas do sistema"]]).map((e) => ({
    ...e,
    tabOnly: true,
  })),
  ...tabEntries("judging", [["tab:judging", "Julgamento diferido"]]).map((e) => ({
    ...e,
    tabOnly: true,
  })),
  ...tabEntries("audit", [["tab:audit", "Registo de auditoria"]]).map((e) => ({
    ...e,
    tabOnly: true,
  })),
];

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Reverse lookup used by the Settings page to pick the right section for a key. */
export const SETTINGS_KEY_TO_SECTION: Readonly<Record<string, SettingsSectionId>> =
  Object.fromEntries(
    ADMIN_SEARCH_INDEX.filter((entry) => entry.settingsSectionId).map((entry) => [
      entry.key,
      entry.settingsSectionId as SettingsSectionId,
    ]),
  );

export function searchAdmin(query: string, limit = 8): AdminSearchEntry[] {
  const q = normalize(query);
  if (!q) return [];
  return ADMIN_SEARCH_INDEX.filter((entry) => normalize(entry.label).includes(q)).slice(0, limit);
}

/**
 * Every labeled field across the admin area, flattened into one searchable
 * list, so "find the setting/field named X" doesn't require knowing which of
 * the 18 tabs (and, inside Settings, which of the 7 sections) it lives under.
 *
 * Each entry's `key` matches the `data-admin-search-key` attribute stamped on
 * that field's wrapper in the actual component — see useScrollToSearchTarget.
 * Entries with `tabOnly: true` have no single field to scroll to (dashboards,
 * read-only lists); picking one just switches tab.
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

export const ADMIN_SEARCH_INDEX: readonly AdminSearchEntry[] = [
  // ---- Settings: Equipas ----
  {
    key: "max_teams",
    label: "Número máximo de equipas",
    tabId: "settings",
    settingsSectionId: "equipas",
  },
  {
    key: "max_members_per_team",
    label: "Máximo de membros por equipa",
    tabId: "settings",
    settingsSectionId: "equipas",
  },
  {
    key: "enable_versus",
    label: "Ativar modo versus",
    tabId: "settings",
    settingsSectionId: "equipas",
  },
  {
    key: "allow_staff_registration",
    label: "Inscrições no local pelo staff",
    tabId: "settings",
    settingsSectionId: "equipas",
  },

  // ---- Settings: Pontuação ----
  {
    key: "enable_staff_scoring",
    label: "Permitir pontuação manual pelos staff",
    tabId: "settings",
    settingsSectionId: "pontuacao",
  },
  {
    key: "penalty_per_puke",
    label: "Penalização por vómito",
    tabId: "settings",
    settingsSectionId: "pontuacao",
  },
  {
    key: "penalty_per_not_drinking",
    label: "Penalização por não beber",
    tabId: "settings",
    settingsSectionId: "pontuacao",
  },
  {
    key: "bonus_per_extra_shot",
    label: "Bónus por shot extra",
    tabId: "settings",
    settingsSectionId: "pontuacao",
  },
  {
    key: "max_extra_shots_per_member",
    label: "Máximo shots extra por membro",
    tabId: "settings",
    settingsSectionId: "pontuacao",
  },

  // ---- Settings: Jogo ----
  {
    key: "reveal_next_checkpoint",
    label: "Revelar o próximo posto antes da chegada",
    tabId: "settings",
    settingsSectionId: "jogo",
  },
  {
    key: "reveal_on_arrival",
    label: "Revelar o posto ao chegar",
    tabId: "settings",
    settingsSectionId: "jogo",
  },
  {
    key: "participant_view_enabled",
    label: "Ativar visualização para participantes",
    tabId: "settings",
    settingsSectionId: "jogo",
  },
  {
    key: "gps_checkin_enabled",
    label: "Check-in por GPS feito pela equipa",
    tabId: "settings",
    settingsSectionId: "jogo",
  },
  {
    key: "guide_manual_arrival_enabled",
    label: "Guias podem marcar chegadas",
    tabId: "settings",
    settingsSectionId: "jogo",
  },
  {
    key: "hints_enabled",
    label: "Permitir pedir pistas",
    tabId: "settings",
    settingsSectionId: "jogo",
  },
  {
    key: "hint_penalty",
    label: "Custo de uma pista",
    tabId: "settings",
    settingsSectionId: "jogo",
    requiresField: { name: "hints_enabled", value: true },
  },
  {
    key: "skip_enabled",
    label: "Permitir desistir de um posto",
    tabId: "settings",
    settingsSectionId: "jogo",
  },
  {
    key: "skip_penalty",
    label: "Custo de desistir de um posto",
    tabId: "settings",
    settingsSectionId: "jogo",
    requiresField: { name: "skip_enabled", value: true },
  },

  // ---- Settings: Rota ----
  {
    key: "checkpoint_order_matters",
    label: "A ordem dos postos importa",
    tabId: "settings",
    settingsSectionId: "rota",
  },
  {
    key: "route_stages_enabled",
    label: "Etapas da rota",
    tabId: "settings",
    settingsSectionId: "rota",
  },
  {
    key: "checkpoint_hours_enabled",
    label: "Respeitar horários dos postos",
    tabId: "settings",
    settingsSectionId: "rota",
  },
  {
    key: "leg_time_scoring_enabled",
    label: "Pontuar tempo de percurso entre postos",
    tabId: "settings",
    settingsSectionId: "rota",
  },
  {
    key: "leg_time_target_minutes",
    label: "Tempo esperado entre postos",
    tabId: "settings",
    settingsSectionId: "rota",
    requiresField: { name: "leg_time_scoring_enabled", value: true },
  },
  {
    key: "leg_time_points_per_minute",
    label: "Pontos por minuto de desvio",
    tabId: "settings",
    settingsSectionId: "rota",
    requiresField: { name: "leg_time_scoring_enabled", value: true },
  },
  {
    key: "leg_time_max_adjustment",
    label: "Limite do ajuste por percurso",
    tabId: "settings",
    settingsSectionId: "rota",
    requiresField: { name: "leg_time_scoring_enabled", value: true },
  },
  {
    key: "proximity_enabled",
    label: "Botão estou perto",
    tabId: "settings",
    settingsSectionId: "rota",
  },
  { key: "compass_enabled", label: "Bússola", tabId: "settings", settingsSectionId: "rota" },
  {
    key: "search_radius_m",
    label: "Raio da zona de busca",
    tabId: "settings",
    settingsSectionId: "rota",
  },

  // ---- Settings: Visualização ----
  {
    key: "show_score_mode",
    label: "Modo de Visualização da Pontuação",
    tabId: "settings",
    settingsSectionId: "visualizacao",
  },
  {
    key: "show_live_leaderboard",
    label: "Mostrar leaderboard em tempo real",
    tabId: "settings",
    settingsSectionId: "visualizacao",
  },
  {
    key: "show_team_details",
    label: "Mostrar detalhes das equipas",
    tabId: "settings",
    settingsSectionId: "visualizacao",
  },
  {
    key: "show_route_mode",
    label: "Modo de Visualização do Trajeto",
    tabId: "settings",
    settingsSectionId: "visualizacao",
  },
  {
    key: "show_checkpoint_map",
    label: "Mostrar mapa dos checkpoints",
    tabId: "settings",
    settingsSectionId: "visualizacao",
  },
  {
    key: "public_access_enabled",
    label: "Permitir acesso público",
    tabId: "settings",
    settingsSectionId: "visualizacao",
  },
  {
    key: "guide_mode_enabled",
    label: "Ativar funcionalidade de modo guia",
    tabId: "settings",
    settingsSectionId: "visualizacao",
  },
  {
    key: "guide_mode_active",
    label: "Modo guia ativo neste evento",
    tabId: "settings",
    settingsSectionId: "visualizacao",
  },
  {
    key: "badges_enabled",
    label: "Ativar crachás/conquistas",
    tabId: "settings",
    settingsSectionId: "visualizacao",
  },
  {
    key: "allow_photo_as_team_photo",
    label: "Permitir staff definir foto de atividade como foto da equipa",
    tabId: "settings",
    settingsSectionId: "visualizacao",
  },

  // ---- Settings: Início ----
  {
    key: "home_layout",
    label: "Secções da página inicial",
    tabId: "settings",
    settingsSectionId: "inicio",
  },
  {
    key: "ticker_items_list",
    label: "Faixa de destaques",
    tabId: "settings",
    settingsSectionId: "inicio",
  },

  // ---- Settings: Regras ----
  {
    key: "rules_sections",
    label: "Secções de regras",
    tabId: "settings",
    settingsSectionId: "regras",
  },

  // ---- Branding (reuses existing element ids as the search key) ----
  { key: "event_name", label: "Nome do evento", tabId: "branding" },
  { key: "event_subtitle", label: "Subtítulo do evento", tabId: "branding" },
  { key: "accent_color", label: "Cor de destaque", tabId: "branding" },

  // ---- Events ----
  { key: "ev-name", label: "Nome da edição", tabId: "events" },
  { key: "ev-type", label: "Tipo de edição", tabId: "events" },
  { key: "ev-start", label: "Início da edição", tabId: "events" },
  { key: "ev-end", label: "Fim da edição", tabId: "events" },
  { key: "ev-desc", label: "Descrição da edição", tabId: "events" },

  // ---- Teams ----
  { key: "team_name", label: "Nome da equipa", tabId: "teams" },
  { key: "team_offset_minutes", label: "Partida desfasada", tabId: "teams" },

  // ---- Checkpoints (create/edit form) ----
  { key: "checkpoint_name", label: "Nome do checkpoint", tabId: "checkpoints" },
  { key: "checkpoint_provisional", label: "Nome provisório do checkpoint", tabId: "checkpoints" },
  { key: "checkpoint_description", label: "Descrição do checkpoint", tabId: "checkpoints" },
  { key: "checkpoint_latitude", label: "Latitude do checkpoint", tabId: "checkpoints" },
  { key: "checkpoint_longitude", label: "Longitude do checkpoint", tabId: "checkpoints" },
  { key: "checkpoint_radius", label: "Raio de chegada do checkpoint", tabId: "checkpoints" },
  { key: "checkpoint_clue", label: "Enigma para a equipa", tabId: "checkpoints" },
  { key: "checkpoint_staff_script", label: "Guião do staff", tabId: "checkpoints" },
  { key: "checkpoint_challenge_brief", label: "Desafio em texto", tabId: "checkpoints" },
  { key: "checkpoint_stage", label: "Etapa do checkpoint", tabId: "checkpoints" },
  { key: "checkpoint_opens_at", label: "Checkpoint abre a", tabId: "checkpoints" },
  { key: "checkpoint_closes_at", label: "Checkpoint fecha a", tabId: "checkpoints" },
  { key: "checkpoint_draft", label: "Checkpoint em rascunho", tabId: "checkpoints" },
  { key: "new_stage_name", label: "Nome da nova etapa", tabId: "checkpoints" },

  // ---- Scoring (rules + manual awards) ----
  { key: "rule_name", label: "Nome da regra de pontuação", tabId: "scoring" },
  { key: "rule_type", label: "Tipo da regra de pontuação", tabId: "scoring" },
  { key: "rule_points", label: "Pontos da regra", tabId: "scoring" },
  { key: "rule_description", label: "Descrição da regra de pontuação", tabId: "scoring" },
  { key: "award_team", label: "Equipa do prémio manual", tabId: "scoring" },
  { key: "award_points", label: "Pontos do prémio manual", tabId: "scoring" },
  { key: "award_rule", label: "Regra do prémio manual", tabId: "scoring" },
  { key: "award_reason", label: "Razão do prémio manual", tabId: "scoring" },

  // ---- Badges ----
  { key: "badge_code", label: "Código único do crachá", tabId: "badges" },
  { key: "badge_name", label: "Nome do crachá", tabId: "badges" },
  { key: "badge_description", label: "Descrição do crachá", tabId: "badges" },
  { key: "badge_color", label: "Cor do crachá", tabId: "badges" },
  { key: "badge_emoji", label: "Emoji do crachá", tabId: "badges" },
  { key: "badge_auto_award", label: "Atribuição automática de crachá", tabId: "badges" },
  // No requiresField flip for badges: BadgeForm's "auto award" toggle is local
  // component state, not a form the search can reach into like Settings can.
  // If "Atribuição automática" isn't already on, this quietly times out.
  { key: "badge_trigger", label: "Condição de atribuição do crachá", tabId: "badges" },
  { key: "award_manual_team", label: "Equipa para atribuir crachá", tabId: "badges" },
  { key: "award_manual_badge", label: "Crachá a atribuir manualmente", tabId: "badges" },

  // ---- Notifications ----
  { key: "broadcast_title", label: "Título do anúncio", tabId: "notifications" },
  { key: "broadcast_message", label: "Mensagem do anúncio", tabId: "notifications" },
  { key: "broadcast_link", label: "Link ao clicar no anúncio", tabId: "notifications" },

  // ---- Tab-only (no single field to jump to) ----
  { key: "tab:dashboard", label: "Painel ao vivo", tabId: "dashboard", tabOnly: true },
  { key: "tab:metrics", label: "Métricas do sistema", tabId: "metrics", tabOnly: true },
  { key: "tab:judging", label: "Julgamento diferido", tabId: "judging", tabOnly: true },
  { key: "tab:audit", label: "Registo de auditoria", tabId: "audit", tabOnly: true },
] as const;

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

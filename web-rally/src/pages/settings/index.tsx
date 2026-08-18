import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, FormProvider, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Settings, Save, RotateCcw } from "lucide-react";
import {
  viewRallySettings,
  updateRallySettings,
  type RallySettingsUpdate,
  type RallySettingsResponse,
} from "@/client";
import useUser from "@/hooks/useUser";
import useFallbackNavigation from "@/hooks/useFallbackNavigation";
import { Navigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PageHeader, LoadingState, ErrorState } from "@/components/shared";
import { EventModeBanner } from "./components";
import { SETTINGS_SECTIONS, DEFAULT_SECTION_ID, type SettingsSectionId } from "./sections";
import { cn } from "@/lib/utils";
import { DEFAULT_HOME_LAYOUT, DEFAULT_TICKER_ITEMS } from "@/lib/homeLayout";
import { utcISOStringToLocalDatetimeLocal } from "@/utils/timezone";
import { useAppToast } from "@/hooks/use-toast";

// Extended interface to include possibly missing properties
type ExtendedRallySettingsResponse = Omit<
  RallySettingsResponse,
  "participant_view_enabled" | "show_route_mode" | "show_score_mode" | "allow_photo_as_team_photo"
> & {
  participant_view_enabled?: boolean;
  show_route_mode?: string;
  show_score_mode?: string;
  allow_photo_as_team_photo?: boolean;
};

const rallySettingsSchema = z.object({
  // Team management
  max_teams: z.number().min(1, "Must allow at least 1 team").max(100, "Maximum 100 teams allowed"),
  max_members_per_team: z
    .number()
    .min(1, "Must allow at least 1 member")
    .max(50, "Maximum 50 members per team"),
  enable_versus: z.boolean(),

  // Rally timing
  rally_start_time: z.string().nullable().optional(),
  rally_end_time: z.string().nullable().optional(),

  // Scoring system
  penalty_per_puke: z
    .number()
    .min(-100, "Penalty too severe")
    .max(0, "Penalty must be negative or zero"),
  penalty_per_not_drinking: z
    .number()
    .min(-100, "Penalty too severe")
    .max(0, "Penalty must be negative or zero"),
  bonus_per_extra_shot: z.number().min(0, "Bonus must be positive").max(100, "Bonus too high"),
  max_extra_shots_per_member: z
    .number()
    .min(1, "Must allow at least 1 extra shot")
    .max(20, "Maximum 20 extra shots per member"),

  // Checkpoint behavior
  checkpoint_order_matters: z.boolean(),
  route_stages_enabled: z.boolean(),
  checkpoint_hours_enabled: z.boolean(),

  // Leg time scoring: the walk between two posts, scored against a target
  leg_time_scoring_enabled: z.boolean(),
  leg_time_target_minutes: z
    .number()
    .min(1, "Tem de ser pelo menos 1 minuto")
    .max(240, "Máximo 240 minutos"),
  leg_time_points_per_minute: z
    .number()
    .min(0, "Não pode ser negativo")
    .max(50, "Máximo 50 pontos por minuto"),
  leg_time_max_adjustment: z
    .number()
    .min(0, "Não pode ser negativo")
    .max(500, "Limite demasiado alto"),

  // GPS geofence self-check-in by the team
  gps_checkin_enabled: z.boolean(),

  // Cost of unlocking a hint (negative; 0 = free)
  hint_penalty: z
    .number()
    .min(-100, "Penalty too severe")
    .max(0, "Penalty must be negative or zero"),

  // Cost of giving up on a checkpoint (negative; 0 = free)
  skip_penalty: z
    .number()
    .min(-100, "Penalty too severe")
    .max(0, "Penalty must be negative or zero"),

  // Feature switches, separate from the costs above: 0 points means free, off
  // means the mechanic is gone.
  hints_enabled: z.boolean(),
  skip_enabled: z.boolean(),
  guide_manual_arrival_enabled: z.boolean(),
  reveal_on_arrival: z.boolean(),

  // Navigation aids for teams who do not know the city
  proximity_enabled: z.boolean(),
  compass_enabled: z.boolean(),
  search_radius_m: z
    .number()
    .min(0, "O raio nao pode ser negativo")
    .max(5000, "Raio demasiado grande"),

  // Walk-up registration: staff can add members during the event
  allow_staff_registration: z.boolean(),

  // Staff and scoring
  enable_staff_scoring: z.boolean(),

  // Display settings
  show_live_leaderboard: z.boolean(),
  show_team_details: z.boolean(),
  show_checkpoint_map: z.boolean(),

  // Redact the next checkpoint until the team checks in (peddy paper)
  reveal_next_checkpoint: z.boolean(),
  participant_view_enabled: z.boolean(),
  show_route_mode: z.string().min(1, "Route mode is required"),
  show_score_mode: z.string().min(1, "Score mode is required"),

  // Rally customization
  rally_theme: z.string().min(1, "Theme is required").max(100, "Theme too long"),

  // Access control
  public_access_enabled: z.boolean(),

  // Staff capability: promote a deferred-judging photo to team photo
  allow_photo_as_team_photo: z.boolean(),

  // Guide mode gates
  guide_mode_enabled: z.boolean(),
  guide_mode_active: z.boolean(),

  // Badges / conquistas master kill-switch
  badges_enabled: z.boolean(),

  // Home page layout: ordered section visibility
  home_layout: z.array(z.object({ key: z.string(), visible: z.boolean() })),

  // Ticker items, edited as a field array of { value } for useFieldArray
  ticker_items_list: z.array(z.object({ value: z.string().max(40, "Máximo 40 caracteres") })),

  // Fully admin-authored sections for the public /rules page, edited as a
  // field array by RulesSettings (title/icon/body per section, any order).
  rules_sections: z.array(
    z.object({
      id: z.string(),
      title: z.string().max(80, "Máximo 80 caracteres"),
      icon: z.string(),
      body: z.string().max(4000, "Máximo 4000 caracteres"),
    }),
  ),
});

type RallySettingsForm = z.infer<typeof rallySettingsSchema>;

const normalizeTheme = (theme?: string | null): "bloody" | "nei" | "default" => {
  if (!theme) return "bloody";
  const normalized = theme.toLowerCase();
  if (normalized.includes("nei")) return "nei";
  if (normalized.includes("default") || normalized.includes("rally tascas")) return "default";
  if (normalized.includes("halloween") || normalized.includes("bloody")) return "bloody";
  return "bloody";
};

function buildFormValues(
  settings: RallySettingsResponse,
  extendedSettings: ExtendedRallySettingsResponse | undefined,
): RallySettingsForm {
  return {
    max_teams: settings.max_teams,
    max_members_per_team: settings.max_members_per_team,
    enable_versus: settings.enable_versus,
    rally_start_time: settings.rally_start_time
      ? utcISOStringToLocalDatetimeLocal(settings.rally_start_time)
      : null,
    rally_end_time: settings.rally_end_time
      ? utcISOStringToLocalDatetimeLocal(settings.rally_end_time)
      : null,
    penalty_per_puke: settings.penalty_per_puke,
    penalty_per_not_drinking: settings.penalty_per_not_drinking,
    bonus_per_extra_shot: settings.bonus_per_extra_shot,
    max_extra_shots_per_member: settings.max_extra_shots_per_member,
    checkpoint_order_matters: settings.checkpoint_order_matters,
    route_stages_enabled: settings.route_stages_enabled ?? false,
    checkpoint_hours_enabled: settings.checkpoint_hours_enabled ?? true,
    leg_time_scoring_enabled: settings.leg_time_scoring_enabled ?? false,
    leg_time_target_minutes: settings.leg_time_target_minutes ?? 15,
    leg_time_points_per_minute: settings.leg_time_points_per_minute ?? 0,
    leg_time_max_adjustment: settings.leg_time_max_adjustment ?? 0,
    gps_checkin_enabled: settings.gps_checkin_enabled ?? false,
    hint_penalty: settings.hint_penalty ?? 0,
    skip_penalty: settings.skip_penalty ?? 0,
    hints_enabled: settings.hints_enabled ?? true,
    skip_enabled: settings.skip_enabled ?? true,
    guide_manual_arrival_enabled: settings.guide_manual_arrival_enabled ?? true,
    reveal_on_arrival: settings.reveal_on_arrival ?? true,
    proximity_enabled: settings.proximity_enabled ?? false,
    compass_enabled: settings.compass_enabled ?? false,
    search_radius_m: settings.search_radius_m ?? 0,
    allow_staff_registration: settings.allow_staff_registration ?? false,
    enable_staff_scoring: settings.enable_staff_scoring,
    show_live_leaderboard: settings.show_live_leaderboard,
    show_team_details: settings.show_team_details,
    show_checkpoint_map: settings.show_checkpoint_map,
    reveal_next_checkpoint: settings.reveal_next_checkpoint ?? true,
    participant_view_enabled: extendedSettings?.participant_view_enabled ?? false,
    show_route_mode: extendedSettings?.show_route_mode ?? "focused",
    show_score_mode: extendedSettings?.show_score_mode ?? "hidden",
    rally_theme: normalizeTheme(settings.rally_theme),
    public_access_enabled: settings.public_access_enabled,
    allow_photo_as_team_photo: extendedSettings?.allow_photo_as_team_photo ?? false,
    guide_mode_enabled: extendedSettings?.guide_mode_enabled ?? false,
    guide_mode_active: extendedSettings?.guide_mode_active ?? false,
    badges_enabled: extendedSettings?.badges_enabled ?? true,
    home_layout: (settings.home_layout?.length ? settings.home_layout : DEFAULT_HOME_LAYOUT).map(
      (section) => ({ key: section.key, visible: section.visible ?? true }),
    ),
    ticker_items_list: (settings.ticker_items?.length
      ? settings.ticker_items
      : DEFAULT_TICKER_ITEMS
    ).map((value) => ({ value })),
    rules_sections: (settings.rules_sections ?? []).map((section) => ({
      id: section.id,
      title: section.title ?? "",
      icon: section.icon ?? "HelpCircle",
      body: section.body ?? "",
    })),
  };
}

import { getErrorMessage } from "@/utils/errorHandling";

interface RallySettingsProps {
  readonly embedded?: boolean;
}

export default function RallySettings({ embedded = false }: RallySettingsProps) {
  const { isLoading, isRallyAdmin } = useUser();
  const toast = useAppToast();
  const fallbackPath = useFallbackNavigation();

  const [sectionId, setSectionId] = useState<SettingsSectionId>(DEFAULT_SECTION_ID);

  // Fetch current settings
  const {
    data: settings,
    refetch: refetchSettings,
    isLoading: isLoadingSettings,
    error: settingsError,
  } = useQuery<RallySettingsResponse>({
    queryKey: ["rallySettings-admin"], // Use different key to avoid conflicts with public endpoint
    queryFn: async () => (await viewRallySettings()).data,
    enabled: isRallyAdmin,
    retry: 2, // Retry up to 2 times
    retryDelay: 1000, // Wait 1 second between retries
    staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });

  const extendedSettings = settings as ExtendedRallySettingsResponse | undefined;

  // Form setup
  const form = useForm<RallySettingsForm>({
    resolver: zodResolver(rallySettingsSchema),
    mode: "onChange", // Validate on change to catch errors early
    defaultValues: {
      max_teams: 16,
      max_members_per_team: 10,
      enable_versus: false,
      rally_start_time: null,
      rally_end_time: null,
      penalty_per_puke: -5,
      penalty_per_not_drinking: -2,
      bonus_per_extra_shot: 1,
      max_extra_shots_per_member: 5,
      checkpoint_order_matters: true,
      route_stages_enabled: false,
      checkpoint_hours_enabled: true,
      leg_time_scoring_enabled: false,
      leg_time_target_minutes: 15,
      leg_time_points_per_minute: 0,
      leg_time_max_adjustment: 0,
      gps_checkin_enabled: false,
      hint_penalty: 0,
      skip_penalty: 0,
      hints_enabled: true,
      skip_enabled: true,
      guide_manual_arrival_enabled: true,
      reveal_on_arrival: true,
      proximity_enabled: false,
      compass_enabled: false,
      search_radius_m: 0,
      allow_staff_registration: false,
      enable_staff_scoring: true,
      show_live_leaderboard: true,
      show_team_details: true,
      show_checkpoint_map: true,
      reveal_next_checkpoint: true,
      participant_view_enabled: false,
      show_route_mode: "focused",
      show_score_mode: "hidden",
      rally_theme: "bloody", // Changed from "Rally Tascas" to match schema default
      public_access_enabled: false,
      allow_photo_as_team_photo: false,
      guide_mode_enabled: false,
      guide_mode_active: false,
      badges_enabled: true,
      home_layout: DEFAULT_HOME_LAYOUT,
      ticker_items_list: DEFAULT_TICKER_ITEMS.map((value) => ({ value })),
      rules_sections: [],
    },
  });

  // Update form when settings are loaded
  useEffect(() => {
    if (settings) {
      form.reset(buildFormValues(settings, extendedSettings));
    }
    // Note: 'form' is intentionally excluded from dependencies to prevent infinite re-renders.
    // Including 'form' would cause this effect to run repeatedly since reset() is called inside the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // Update settings mutation
  const { mutate: updateSettings, isPending: isUpdating } = useMutation({
    mutationFn: async (settingsData: RallySettingsUpdate) => {
      const { data } = await updateRallySettings({ body: settingsData });
      return data;
    },
    onSuccess: () => {
      toast.success("Configurações atualizadas com sucesso!");
      void refetchSettings();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao atualizar configurações"));
    },
  });

  const handleSave = (data: RallySettingsForm) => {
    // rally_start_time/rally_end_time are read-only here — they're set on the
    // event (see EventsManagement), not via this settings form.
    const {
      rally_start_time: _rallyStartTime,
      rally_end_time: _rallyEndTime,
      ticker_items_list,
      ...settingsData
    } = data;
    updateSettings({
      ...settingsData,
      ticker_items: ticker_items_list
        .map((item) => item.value)
        .filter((value) => value.trim().length > 0),
    } as RallySettingsUpdate);
  };

  const handleSubmitError = (errors: FieldErrors<RallySettingsForm>) => {
    const errorMessages = Object.entries(errors)
      .map(([field, error]) => {
        if (!error) return `${field}: valor inválido`;

        if ("message" in error && error.message) {
          return `${field}: ${error.message}`;
        }

        return `${field}: valor inválido`;
      })
      .join(", ");

    toast.error(`Erros no formulário: ${errorMessages}`);
  };

  const handleCancel = () => {
    if (settings) {
      form.reset(buildFormValues(settings, extendedSettings));
    }
  };

  if (isLoading) {
    return <LoadingState message="Carregando..." />;
  }

  if (!embedded && !isRallyAdmin) {
    return <Navigate to={fallbackPath} />;
  }

  if (isLoadingSettings) {
    return <LoadingState message="Carregando configurações..." />;
  }

  if (settingsError) {
    return (
      <div className="mt-16 space-y-4">
        <PageHeader
          title="Erro ao Carregar Configurações"
          description="Não foi possível carregar as configurações do Rally"
        />
        <ErrorState
          message={`${settingsError instanceof Error ? settingsError.message : "Erro de autenticação"}. Certifique-se de que está logado e tem permissões de manager-rally ou admin.`}
        />
        <div className="flex justify-center">
          <Button onClick={() => refetchSettings()} variant="outline">
            Tentar Novamente
          </Button>
        </div>
      </div>
    );
  }

  const activeSection =
    SETTINGS_SECTIONS.find((section) => section.id === sectionId) ?? SETTINGS_SECTIONS[0]!;
  const ActiveBody = activeSection.Component;
  // Nothing is read-only any more, so the save bar is what tells the admin
  // there is unsaved work — it appears on the first change and not before.
  const hasChanges = form.formState.isDirty;

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader
          eyebrow="Gestão"
          icon={Settings}
          title="Configurações"
          description="Gerir configurações globais do rally."
        />
      )}

      <EventModeBanner eventType={settings?.event_type} />

      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(handleSave, handleSubmitError)}>
          <div className="grid gap-6 lg:grid-cols-[13rem_1fr] lg:items-start">
            {/* Mobile: a scrollable pill strip. Desktop: a vertical rail.
                Same markup, so the active section is stated once. */}
            <nav
              aria-label="Secções das configurações"
              className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
            >
              {SETTINGS_SECTIONS.map((section) => {
                const Icon = section.icon;
                const isActive = section.id === activeSection.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setSectionId(section.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "rally-bg-accent-soft text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {section.label}
                  </button>
                );
              })}
            </nav>

            <div className="rally-surface min-w-0 space-y-6 rounded-2xl p-5 sm:p-6">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold leading-none tracking-tight">
                  {activeSection.label}
                </h2>
                <p className="text-sm text-muted-foreground">{activeSection.description}</p>
              </div>

              {/* Only the active section is mounted. Values of the hidden ones
                  survive in the form state, so a save still sends everything. */}
              <ActiveBody eventType={settings?.event_type} />
            </div>
          </div>

          {hasChanges && (
            <div className="rally-glass rally-sticky-actions z-10 mt-6 flex items-center justify-center gap-4 rounded-2xl border border-border p-3">
              <span className="hidden text-sm text-muted-foreground sm:inline">
                Alterações por guardar
              </span>
              <Button type="submit" disabled={isUpdating} variant="default">
                <Save className="mr-2 h-4 w-4" />
                {isUpdating ? "A Guardar..." : "Guardar"}
              </Button>
              <Button type="button" onClick={handleCancel} variant="outline">
                <RotateCcw className="mr-2 h-4 w-4" />
                Cancelar
              </Button>
            </div>
          )}
        </form>
      </FormProvider>
    </div>
  );
}

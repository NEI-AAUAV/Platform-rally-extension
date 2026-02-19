import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, FormProvider, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Settings, Save, RotateCcw } from "lucide-react";
import { SettingsService, type RallySettingsUpdate, type RallySettingsResponse } from "@/client";
import useUser from "@/hooks/useUser";
import useFallbackNavigation from "@/hooks/useFallbackNavigation";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PageHeader, LoadingState, ErrorState } from "@/components/shared";
import { TeamSettings, RallyTimingSettings, ScoringSettings, DisplaySettings } from "./components";
import {
  utcISOStringToLocalDatetimeLocal,
  localDatetimeLocalToUTCISOString
} from "@/utils/timezone";
import { useAppToast } from "@/hooks/use-toast";

// Extended interface to include possibly missing properties
type ExtendedRallySettingsResponse = Omit<RallySettingsResponse, 'participant_view_enabled' | 'show_route_mode' | 'show_score_mode'> & {
  participant_view_enabled?: boolean;
  show_route_mode?: string;
  show_score_mode?: string;
};

const rallySettingsSchema = z.object({
  // Team management
  max_teams: z.number().min(1, "Must allow at least 1 team").max(100, "Maximum 100 teams allowed"),
  max_members_per_team: z.number().min(1, "Must allow at least 1 member").max(50, "Maximum 50 members per team"),
  enable_versus: z.boolean(),

  // Rally timing
  rally_start_time: z.string().nullable().optional(),
  rally_end_time: z.string().nullable().optional(),

  // Scoring system
  penalty_per_puke: z.number().min(-100, "Penalty too severe").max(0, "Penalty must be negative or zero"),
  penalty_per_not_drinking: z.number().min(-100, "Penalty too severe").max(0, "Penalty must be negative or zero"),
  bonus_per_extra_shot: z.number().min(0, "Bonus must be positive").max(100, "Bonus too high"),
  max_extra_shots_per_member: z.number().min(1, "Must allow at least 1 extra shot").max(20, "Maximum 20 extra shots per member"),

  // Checkpoint behavior
  checkpoint_order_matters: z.boolean(),

  // Staff and scoring
  enable_staff_scoring: z.boolean(),

  // Display settings
  show_live_leaderboard: z.boolean(),
  show_team_details: z.boolean(),
  show_checkpoint_map: z.boolean(),
  participant_view_enabled: z.boolean(),
  show_route_mode: z.string().min(1, "Route mode is required"),
  show_score_mode: z.string().min(1, "Score mode is required"),

  // Rally customization
  rally_theme: z.string().min(1, "Theme is required").max(100, "Theme too long"),

  // Access control
  public_access_enabled: z.boolean(),
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

import { getErrorMessage } from "@/utils/errorHandling";

export default function RallySettings() {
  const { isLoading, isRallyAdmin } = useUser();
  const toast = useAppToast();

  const [isEditing, setIsEditing] = useState(false);

  // Fetch current settings
  const {
    data: settings,
    refetch: refetchSettings,
    isLoading: isLoadingSettings,
    error: settingsError,
  } = useQuery<RallySettingsResponse>({
    queryKey: ["rallySettings-admin"], // Use different key to avoid conflicts with public endpoint
    queryFn: SettingsService.viewRallySettingsApiRallyV1RallySettingsGet,
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
      enable_staff_scoring: true,
      show_live_leaderboard: true,
      show_team_details: true,
      show_checkpoint_map: true,
      participant_view_enabled: false,
      show_route_mode: "focused",
      show_score_mode: "hidden",
      rally_theme: "bloody", // Changed from "Rally Tascas" to match schema default
      public_access_enabled: false,
    },
  });

  // Update form when settings are loaded
  useEffect(() => {
    if (settings) {
      const mappedTheme = normalizeTheme(settings.rally_theme);

      form.reset({
        max_teams: settings.max_teams,
        max_members_per_team: settings.max_members_per_team,
        enable_versus: settings.enable_versus,
        rally_start_time: settings.rally_start_time
          ? utcISOStringToLocalDatetimeLocal(settings.rally_start_time)
          : null,
        rally_end_time: settings.rally_end_time ? utcISOStringToLocalDatetimeLocal(settings.rally_end_time) : null,
        penalty_per_puke: settings.penalty_per_puke,
        penalty_per_not_drinking: settings.penalty_per_not_drinking,
        bonus_per_extra_shot: settings.bonus_per_extra_shot,
        max_extra_shots_per_member: settings.max_extra_shots_per_member,
        checkpoint_order_matters: settings.checkpoint_order_matters,
        enable_staff_scoring: settings.enable_staff_scoring,
        show_live_leaderboard: settings.show_live_leaderboard,
        show_team_details: settings.show_team_details,
        show_checkpoint_map: settings.show_checkpoint_map,
        participant_view_enabled: extendedSettings?.participant_view_enabled ?? false,
        show_route_mode: extendedSettings?.show_route_mode ?? "focused",
        show_score_mode: extendedSettings?.show_score_mode ?? "hidden",
        rally_theme: mappedTheme,
        public_access_enabled: settings.public_access_enabled,
      });
    }
    // Note: 'form' is intentionally excluded from dependencies to prevent infinite re-renders.
    // Including 'form' would cause this effect to run repeatedly since reset() is called inside the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // Update settings mutation
  const {
    mutate: updateSettings,
    isPending: isUpdating,
  } = useMutation({
    mutationFn: async (settingsData: RallySettingsUpdate) => {
      return SettingsService.updateRallySettingsApiRallyV1RallySettingsPut(settingsData);
    },
    onSuccess: () => {
      toast.success("Configurações atualizadas com sucesso!");
      refetchSettings();
      setIsEditing(false);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao atualizar configurações"));
    },
  });

  const handleSave = (data: RallySettingsForm) => {
    // Convert datetime-local strings to UTC ISO strings before sending to API
    const settingsData: RallySettingsUpdate = {
      ...data,
      rally_start_time: data.rally_start_time ? localDatetimeLocalToUTCISOString(data.rally_start_time) : null,
      rally_end_time: data.rally_end_time ? localDatetimeLocalToUTCISOString(data.rally_end_time) : null,
    };

    updateSettings(settingsData);
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
      const mappedTheme = normalizeTheme(settings.rally_theme);

      form.reset({
        max_teams: settings.max_teams,
        max_members_per_team: settings.max_members_per_team,
        enable_versus: settings.enable_versus,
        rally_start_time: settings.rally_start_time
          ? utcISOStringToLocalDatetimeLocal(settings.rally_start_time)
          : null,
        rally_end_time: settings.rally_end_time ? utcISOStringToLocalDatetimeLocal(settings.rally_end_time) : null,
        penalty_per_puke: settings.penalty_per_puke,
        penalty_per_not_drinking: settings.penalty_per_not_drinking,
        bonus_per_extra_shot: settings.bonus_per_extra_shot,
        max_extra_shots_per_member: settings.max_extra_shots_per_member,
        checkpoint_order_matters: settings.checkpoint_order_matters,
        enable_staff_scoring: settings.enable_staff_scoring,
        show_live_leaderboard: settings.show_live_leaderboard,
        show_team_details: settings.show_team_details,
        show_checkpoint_map: settings.show_checkpoint_map,
        rally_theme: mappedTheme,
        public_access_enabled: settings.public_access_enabled,
      });
    }
    setIsEditing(false);
  };

  if (isLoading) {
    return <LoadingState message="Carregando..." />;
  }

  const fallbackPath = useFallbackNavigation();
  if (!isRallyAdmin) {
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
          <Button
            onClick={() => refetchSettings()}
            variant="outline"
          >
            Tentar Novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-16 space-y-8">
      <PageHeader
        title="Configurações do Rally"
        description="Gerir configurações globais do Rally Tascas"
      />

      {/* Edit Button at the top */}
      {!isEditing ? (
        <div className="text-center space-y-3">
          <p className="text-[rgb(255,255,255,0.7)] text-sm">
            Clique no botão abaixo para editar as configurações
          </p>
          <Button
            type="button"
            onClick={() => setIsEditing(true)}
            variant="default"
            size="lg"
          >
            <Settings className="w-4 h-4 mr-2" />
            Editar Configurações
          </Button>
        </div>
      ) : (
        <div className="p-3 bg-blue-600/20 border border-blue-500/30 rounded-lg">
          <p className="text-blue-300 text-sm font-medium text-center">
            Modo de edição ativo - Clique em "Guardar" para aplicar as alterações
          </p>
        </div>
      )}

      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(handleSave, handleSubmitError)} className="space-y-8">
          <DisplaySettings disabled={!isEditing} />
          <TeamSettings disabled={!isEditing} />
          <RallyTimingSettings disabled={!isEditing} />
          <ScoringSettings disabled={!isEditing} />

          {/* Action Buttons */}
          {isEditing && (
            <div className="flex justify-center gap-4">
              <Button
                type="submit"
                disabled={isUpdating}
                variant="default"
              >
                <Save className="w-4 h-4 mr-2" />
                {isUpdating ? "A Guardar..." : "Guardar"}
              </Button>
              <Button
                type="button"
                onClick={handleCancel}
                variant="outline"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Cancelar
              </Button>
            </div>
          )}
        </form>
      </FormProvider>
    </div>
  );
}

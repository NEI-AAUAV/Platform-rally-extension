import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Settings, Save, RotateCcw } from "lucide-react";
import { RallySettingsService, type RallySettingsUpdate } from "@/client";
import useUser from "@/hooks/useUser";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PageHeader, LoadingState, ErrorState } from "@/components/shared";
import { TeamSettings, RallyTimingSettings, ScoringSettings, DisplaySettings } from "./components";
import { 
  utcISOStringToLocalDatetimeLocal 
} from "@/utils/timezone";

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
  
  // Checkpoint behavior
  checkpoint_order_matters: z.boolean(),
  
  // Staff and scoring
  enable_staff_scoring: z.boolean(),
  
  // Display settings
  show_live_leaderboard: z.boolean(),
  show_team_details: z.boolean(),
  show_checkpoint_map: z.boolean(),
  
  // Rally customization
  rally_theme: z.string().min(1, "Theme is required").max(100, "Theme too long"),
  
  // Access control
  public_access_enabled: z.boolean(),
});

type RallySettingsForm = z.infer<typeof rallySettingsSchema>;

export default function RallySettings() {
  const { isLoading, userStoreStuff } = useUser();
  
  // Check if user is manager-rally or admin
  const isManager = userStoreStuff.scopes?.includes("manager-rally") || 
                   userStoreStuff.scopes?.includes("admin");

  const [isEditing, setIsEditing] = useState(false);

  // Fetch current settings
  const { data: settings, refetch: refetchSettings, isLoading: isLoadingSettings, error: settingsError } = useQuery({
    queryKey: ["rallySettings"],
    queryFn: RallySettingsService.getRallySettings,
    enabled: isManager,
    retry: false, // Don't retry on auth errors
  });

  // Form setup
  const form = useForm({
    resolver: zodResolver(rallySettingsSchema),
    defaultValues: {
      max_teams: 16,
      max_members_per_team: 10,
      enable_versus: false,
      rally_start_time: null,
      rally_end_time: null,
      penalty_per_puke: -5,
      checkpoint_order_matters: true,
      enable_staff_scoring: true,
      show_live_leaderboard: true,
      show_team_details: true,
      show_checkpoint_map: true,
      rally_theme: "Rally Tascas",
      public_access_enabled: false,
    },
  });

  // Update form when settings are loaded
  useEffect(() => {
    if (settings) {
      form.reset({
               max_teams: settings.max_teams,
               max_members_per_team: settings.max_members_per_team,
               enable_versus: settings.enable_versus,
        rally_start_time: settings.rally_start_time ? utcISOStringToLocalDatetimeLocal(settings.rally_start_time) : null,
        rally_end_time: settings.rally_end_time ? utcISOStringToLocalDatetimeLocal(settings.rally_end_time) : null,
        penalty_per_puke: settings.penalty_per_puke,
        checkpoint_order_matters: settings.checkpoint_order_matters,
        enable_staff_scoring: settings.enable_staff_scoring,
        show_live_leaderboard: settings.show_live_leaderboard,
        show_team_details: settings.show_team_details,
        show_checkpoint_map: settings.show_checkpoint_map,
        rally_theme: settings.rally_theme,
        public_access_enabled: settings.public_access_enabled,
      });
    }
  }, [settings, form]);

  // Update settings mutation
  const {
    mutate: updateSettings,
    isPending: isUpdating,
  } = useMutation({
    mutationFn: async (settingsData: RallySettingsUpdate) => {
      return RallySettingsService.updateRallySettings(settingsData);
    },
    onSuccess: () => {
      alert("Settings updated successfully!");
      refetchSettings();
      setIsEditing(false);
    },
    onError: (error: any) => {
      alert(`Failed to update settings: ${error.message}`);
    },
  });

  const handleSave = (data: RallySettingsForm) => {
    updateSettings(data);
  };

  const handleCancel = () => {
    if (settings) {
      form.reset({
               max_teams: settings.max_teams,
               max_members_per_team: settings.max_members_per_team,
               enable_versus: settings.enable_versus,
        rally_start_time: settings.rally_start_time ? utcISOStringToLocalDatetimeLocal(settings.rally_start_time) : null,
        rally_end_time: settings.rally_end_time ? utcISOStringToLocalDatetimeLocal(settings.rally_end_time) : null,
        penalty_per_puke: settings.penalty_per_puke,
        checkpoint_order_matters: settings.checkpoint_order_matters,
        enable_staff_scoring: settings.enable_staff_scoring,
        show_live_leaderboard: settings.show_live_leaderboard,
        show_team_details: settings.show_team_details,
        show_checkpoint_map: settings.show_checkpoint_map,
        rally_theme: settings.rally_theme,
        public_access_enabled: settings.public_access_enabled,
      });
    }
    setIsEditing(false);
  };

  if (isLoading) {
    return <LoadingState message="Carregando..." />;
  }

  if (!isManager) {
    return <Navigate to="/scoreboard" />;
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
          message={`${settingsError.message || 'Erro de autenticação'}. Certifique-se de que está logado e tem permissões de manager-rally ou admin.`}
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
        <form onSubmit={form.handleSubmit(handleSave)} className="space-y-8">
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

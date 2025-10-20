import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Calendar, Clock, Users, MapPin, Eye, EyeOff, Settings, Save, RotateCcw } from "lucide-react";
import { RallySettingsService, type RallySettingsResponse, type RallySettingsUpdate } from "@/client";
import useUser from "@/hooks/useUser";
import { Navigate } from "react-router-dom";
import BloodyButton from "@/components/ui/bloody-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const rallySettingsSchema = z.object({
  // Team management
  max_teams: z.number().min(1, "Must allow at least 1 team").max(100, "Maximum 100 teams allowed"),
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
});

type RallySettingsForm = z.infer<typeof rallySettingsSchema>;

export default function RallySettings() {
  const { isLoading, userStoreStuff } = useUser();
  
  // Check if user is manager-rally or admin
  const isManager = userStoreStuff.scopes?.includes("manager-rally") || 
                   userStoreStuff.scopes?.includes("admin");

  const [isEditing, setIsEditing] = useState(false);

  // Fetch current settings
  const { data: settings, refetch: refetchSettings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ["rallySettings"],
    queryFn: RallySettingsService.getRallySettings,
    enabled: isManager,
  });

  // Form setup
  const form = useForm<RallySettingsForm>({
    resolver: zodResolver(rallySettingsSchema),
    defaultValues: {
      max_teams: 16,
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
    },
  });

  // Update form when settings are loaded
  useState(() => {
    if (settings) {
      form.reset({
        max_teams: settings.max_teams,
        enable_versus: settings.enable_versus,
        rally_start_time: settings.rally_start_time ? settings.rally_start_time.substring(0, 16) : null,
        rally_end_time: settings.rally_end_time ? settings.rally_end_time.substring(0, 16) : null,
        penalty_per_puke: settings.penalty_per_puke,
        checkpoint_order_matters: settings.checkpoint_order_matters,
        enable_staff_scoring: settings.enable_staff_scoring,
        show_live_leaderboard: settings.show_live_leaderboard,
        show_team_details: settings.show_team_details,
        show_checkpoint_map: settings.show_checkpoint_map,
        rally_theme: settings.rally_theme,
      });
    }
  });

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
        enable_versus: settings.enable_versus,
        rally_start_time: settings.rally_start_time ? settings.rally_start_time.substring(0, 16) : null,
        rally_end_time: settings.rally_end_time ? settings.rally_end_time.substring(0, 16) : null,
        penalty_per_puke: settings.penalty_per_puke,
        checkpoint_order_matters: settings.checkpoint_order_matters,
        enable_staff_scoring: settings.enable_staff_scoring,
        show_live_leaderboard: settings.show_live_leaderboard,
        show_team_details: settings.show_team_details,
        show_checkpoint_map: settings.show_checkpoint_map,
        rally_theme: settings.rally_theme,
      });
    }
    setIsEditing(false);
  };

  if (isLoading) {
    return <div className="mt-16 text-center">Carregando...</div>;
  }

  if (!isManager) {
    return <Navigate to="/scoreboard" />;
  }

  if (isLoadingSettings) {
    return <div className="mt-16 text-center">Carregando configurações...</div>;
  }

  return (
    <div className="mt-16 space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Configurações do Rally</h2>
        <p className="text-[rgb(255,255,255,0.7)]">
          Gerir configurações globais do Rally Tascas
        </p>
      </div>

      <form onSubmit={form.handleSubmit(handleSave)} className="space-y-8">
        {/* Rally Customization */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Personalização do Rally
            </CardTitle>
            <CardDescription>
              Configurações básicas e tema do rally
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rally_theme">Tema do Rally</Label>
              <Input
                id="rally_theme"
                {...form.register("rally_theme")}
                disabled={!isEditing}
                placeholder="Rally Tascas"
              />
              {form.formState.errors.rally_theme && (
                <p className="text-red-400 text-sm">{form.formState.errors.rally_theme.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Team Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Gestão de Equipas
            </CardTitle>
            <CardDescription>
              Configurações relacionadas com equipas e registo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="max_teams">Número Máximo de Equipas</Label>
              <Input
                id="max_teams"
                type="number"
                {...form.register("max_teams", { valueAsNumber: true })}
                disabled={!isEditing}
                min="1"
                max="100"
              />
              {form.formState.errors.max_teams && (
                <p className="text-red-400 text-sm">{form.formState.errors.max_teams.message}</p>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="enable_versus"
                checked={form.watch("enable_versus")}
                onCheckedChange={(checked) => form.setValue("enable_versus", checked)}
                disabled={!isEditing}
              />
              <Label htmlFor="enable_versus">Ativar Modo Versus</Label>
            </div>
          </CardContent>
        </Card>

        {/* Rally Timing */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Horários do Rally
            </CardTitle>
            <CardDescription>
              Definir início e fim do rally
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rally_start_time">Hora de Início</Label>
              <Input
                id="rally_start_time"
                type="datetime-local"
                {...form.register("rally_start_time", {
                  setValueAs: (value) => value ? new Date(value).toISOString() : null
                })}
                disabled={!isEditing}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="rally_end_time">Hora de Fim</Label>
              <Input
                id="rally_end_time"
                type="datetime-local"
                {...form.register("rally_end_time", {
                  setValueAs: (value) => value ? new Date(value).toISOString() : null
                })}
                disabled={!isEditing}
              />
            </div>
          </CardContent>
        </Card>

        {/* Scoring System */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Sistema de Pontuação
            </CardTitle>
            <CardDescription>
              Configurações de pontuação e penalizações
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="penalty_per_puke">Penalização por Vómito</Label>
              <Input
                id="penalty_per_puke"
                type="number"
                {...form.register("penalty_per_puke", { valueAsNumber: true })}
                disabled={!isEditing}
                min="-100"
                max="0"
              />
              {form.formState.errors.penalty_per_puke && (
                <p className="text-red-400 text-sm">{form.formState.errors.penalty_per_puke.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Checkpoint Behavior */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Comportamento dos Checkpoints
            </CardTitle>
            <CardDescription>
              Como funcionam os checkpoints no rally
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="checkpoint_order_matters"
                checked={form.watch("checkpoint_order_matters")}
                onCheckedChange={(checked) => form.setValue("checkpoint_order_matters", checked)}
                disabled={!isEditing}
              />
              <Label htmlFor="checkpoint_order_matters">Ordem dos Checkpoints Importa</Label>
            </div>
          </CardContent>
        </Card>

        {/* Staff and Scoring */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Staff e Pontuação
            </CardTitle>
            <CardDescription>
              Configurações para staff e sistema de pontuação
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="enable_staff_scoring"
                checked={form.watch("enable_staff_scoring")}
                onCheckedChange={(checked) => form.setValue("enable_staff_scoring", checked)}
                disabled={!isEditing}
              />
              <Label htmlFor="enable_staff_scoring">Permitir Pontuação pelo Staff</Label>
            </div>
          </CardContent>
        </Card>

        {/* Display Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Configurações de Visualização
            </CardTitle>
            <CardDescription>
              O que é visível para os utilizadores
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="show_live_leaderboard"
                checked={form.watch("show_live_leaderboard")}
                onCheckedChange={(checked) => form.setValue("show_live_leaderboard", checked)}
                disabled={!isEditing}
              />
              <Label htmlFor="show_live_leaderboard">Mostrar Leaderboard em Tempo Real</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="show_team_details"
                checked={form.watch("show_team_details")}
                onCheckedChange={(checked) => form.setValue("show_team_details", checked)}
                disabled={!isEditing}
              />
              <Label htmlFor="show_team_details">Mostrar Detalhes das Equipas</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="show_checkpoint_map"
                checked={form.watch("show_checkpoint_map")}
                onCheckedChange={(checked) => form.setValue("show_checkpoint_map", checked)}
                disabled={!isEditing}
              />
              <Label htmlFor="show_checkpoint_map">Mostrar Mapa dos Checkpoints</Label>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-center gap-4">
          {!isEditing ? (
            <BloodyButton
              type="button"
              onClick={() => setIsEditing(true)}
              variant="default"
            >
              <Settings className="w-4 h-4 mr-2" />
              Editar Configurações
            </BloodyButton>
          ) : (
            <>
              <BloodyButton
                type="submit"
                disabled={isUpdating}
                variant="default"
              >
                <Save className="w-4 h-4 mr-2" />
                {isUpdating ? "A Guardar..." : "Guardar"}
              </BloodyButton>
              <BloodyButton
                type="button"
                onClick={handleCancel}
                variant="neutral"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Cancelar
              </BloodyButton>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

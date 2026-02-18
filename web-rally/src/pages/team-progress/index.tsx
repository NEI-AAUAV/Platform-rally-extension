import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useThemedComponents } from "@/components/themes/ThemeContext";
import { ChevronDown, ChevronUp, MapPin, Trophy, Users, Clock, Loader2, QrCode } from "lucide-react";
import useTeamAuth from "@/hooks/useTeamAuth";
import useRallySettings from "@/hooks/useRallySettings";
import { formatTime } from "@/utils/timeFormat";
import { Button } from "@/components/ui/button";
import {
    TeamService,
    CheckPointService,
    type DetailedTeam,
    type DetailedCheckPoint,
    type RallySettingsResponse,
} from "@/client";

// Extended interface to include missing properties
interface ExtendedRallySettingsResponse extends RallySettingsResponse {
    participant_view_enabled?: boolean;
    show_route_mode?: 'focused' | 'complete';
    show_score_mode?: 'hidden' | 'individual' | 'competitive';
}

export default function TeamProgress() {
    const components = useThemedComponents();
    const { Card, config } = components;
    const navigate = useNavigate();
    const { isAuthenticated, teamData, isLoading: authLoading } = useTeamAuth();
    const { settings: rawSettings, isLoading: settingsLoading } = useRallySettings();
    const settings = rawSettings as ExtendedRallySettingsResponse | undefined;
    const [expandedCheckpoints, setExpandedCheckpoints] = useState<Set<number>>(new Set());

    // Redirect to login if not authenticated
    useEffect(() => {
        if (!authLoading && !isAuthenticated) {
            navigate("/team-login");
        }
    }, [authLoading, isAuthenticated, navigate]);

    // Check if participant view is enabled
    useEffect(() => {
        if (!settingsLoading && settings && !settings.participant_view_enabled) {
            navigate("/scoreboard");
        }
    }, [settingsLoading, settings, navigate]);

    // Fetch team data with auto-refresh every 30 seconds
    const {
        data: team,
        isLoading: teamLoading,
        error: teamError,
    } = useQuery<DetailedTeam>({
        queryKey: ["team", teamData?.team_id],
        queryFn: async () => TeamService.getTeamByIdApiRallyV1TeamIdGet(teamData!.team_id),
        enabled: !!teamData?.team_id,
        refetchInterval: 30000, // Auto-refresh every 30 seconds
        refetchOnWindowFocus: true,
    });

    // Fetch checkpoints
    const { data: checkpoints } = useQuery<DetailedCheckPoint[]>({
        queryKey: ["checkpoints"],
        queryFn: CheckPointService.getCheckpointsApiRallyV1CheckpointGet,
        refetchInterval: 30000,
    });

    const toggleCheckpoint = (checkpointIndex: number) => {
        setExpandedCheckpoints((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(checkpointIndex)) {
                newSet.delete(checkpointIndex);
            } else {
                newSet.add(checkpointIndex);
            }
            return newSet;
        });
    };

    // Determine next checkpoint
    const completedCheckpointsCount = team?.times?.length || 0;
    const nextCheckpointOrder = completedCheckpointsCount + 1;
    const nextCheckpoint = checkpoints?.find((cp) => cp.order === nextCheckpointOrder);

    // Show route mode: 'focused' (only next) or 'complete' (all checkpoints)


    // Show score mode: 'hidden', 'individual', or 'competitive'
    const showScore = settings?.show_score_mode !== "hidden";
    const showRanking = settings?.show_score_mode === "competitive";

    if (authLoading || teamLoading || settingsLoading) {
        return (
            <div
                className="min-h-screen flex items-center justify-center p-4 transition-colors duration-500"
                style={components.background}
            >
                <Card className="text-center p-8 backdrop-blur-md bg-black/40 border-white/10">
                    <Loader2
                        className="w-12 h-12 animate-spin mx-auto mb-4"
                        style={{ color: config?.colors?.primary }}
                    />
                    <div className="text-lg font-semibold" style={{ color: config?.colors?.text }}>
                        A carregar progresso...
                    </div>
                </Card>
            </div>
        );
    }

    // Check if participant view is disabled
    if (!settings?.participant_view_enabled) {
        return (
            <div
                className="min-h-screen flex items-center justify-center p-4"
                style={components.background}
            >
                <Card className="text-center max-w-md p-8 backdrop-blur-md bg-black/40 border-white/10">
                    <div className="text-lg font-semibold text-red-400 mb-2">Vista não disponível</div>
                    <div className="opacity-70" style={{ color: config?.colors?.text }}>
                        A vista de participante está atualmente desativada pelos administradores.
                    </div>
                </Card>
            </div>
        );
    }

    if (teamError || !team) {
        return (
            <div
                className="min-h-screen flex items-center justify-center p-4"
                style={components.background}
            >
                <Card className="text-center max-w-md p-8 backdrop-blur-md bg-black/40 border-white/10">
                    <div className="text-lg font-semibold text-red-400 mb-2">Erro ao carregar</div>
                    <div className="opacity-70" style={{ color: config?.colors?.text }}>
                        Não foi possível carregar o progresso da equipa.
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div
            className="min-h-screen p-4 pb-20 transition-colors duration-500"
            style={components.background}
        >
            <div className="max-w-2xl mx-auto pt-6 animate-in fade-in duration-500 space-y-6">
                {/* Team Header */}
                <Card className="p-8 backdrop-blur-md bg-black/30 border-white/10 shadow-xl">
                    <div className="text-center">
                        <h1
                            className="text-4xl font-bold mb-2 tracking-tight"
                            style={{ color: config?.colors?.text }}
                        >
                            {team.name}
                        </h1>
                        {showScore && (
                            <div className="mt-4 p-4 rounded-xl bg-white/5 inline-block">
                                <div
                                    className="flex items-center justify-center gap-2 text-3xl font-bold"
                                    style={{ color: config?.colors?.primary }}
                                >
                                    <Trophy className="w-8 h-8" />
                                    {team.total} <span className="text-lg font-normal opacity-80 self-end mb-1">pontos</span>
                                </div>
                                {showRanking && (
                                    <div
                                        className="text-sm mt-1 font-medium px-3 py-1 rounded-full inline-block"
                                        style={{ backgroundColor: `${config?.colors?.primary}20`, color: config?.colors?.primary }}
                                    >
                                        {team.classification}º lugar
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Show Team Code Button */}
                    <div className="mt-6 flex justify-center">
                        <Button
                            onClick={() => navigate("/show-team-code")}
                            className="gap-2"
                            style={{
                                backgroundColor: `${config?.colors?.primary}20`,
                                color: config?.colors?.primary,
                                border: `1px solid ${config?.colors?.primary}40`
                            }}
                        >
                            <QrCode className="w-4 h-4" />
                            Mostrar Código QR
                        </Button>
                    </div>
                </Card>

                {/* Team Members */}
                <Card className="p-6 backdrop-blur-sm bg-black/20 border-white/5">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-2 rounded-lg bg-white/5">
                            <Users className="w-5 h-5" style={{ color: config?.colors?.primary }} />
                        </div>
                        <h2 className="text-lg font-semibold" style={{ color: config?.colors?.text }}>Membros da Equipa</h2>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        {team.members?.map((member) => (
                            <div
                                key={member.id}
                                className="px-4 py-3 rounded-xl text-sm font-medium transition-colors hover:bg-white/10"
                                style={{
                                    backgroundColor: 'rgba(255,255,255,0.05)',
                                    color: config?.colors?.text
                                }}
                            >
                                {member.name}
                            </div>
                        ))}
                    </div>
                </Card>

                {/* Progress Summary */}
                <Card className="p-4 backdrop-blur-sm bg-black/20 border-white/5">
                    <div className="flex items-center justify-between text-sm font-medium" style={{ color: config?.colors?.text }}>
                        <span className="opacity-80">
                            Progresso: {completedCheckpointsCount} de {checkpoints?.length || 0} postos
                        </span>
                        {showScore && (
                            <span className="opacity-80">
                                Total: {team.total} pontos
                            </span>
                        )}
                    </div>
                    {/* Progress Bar */}
                    <div className="mt-3 h-2 w-full bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full transition-all duration-1000 ease-out"
                            style={{
                                width: `${((completedCheckpointsCount) / (checkpoints?.length || 1)) * 100}%`,
                                backgroundColor: config?.colors?.primary
                            }}
                        />
                    </div>
                </Card>

                {/* Next Checkpoint (if exists) */}
                {nextCheckpoint && (
                    <div
                        className="p-6 rounded-lg border-2 shadow-[0_0_30px_-10px_rgba(0,0,0,0.5)] transform hover:scale-[1.01] transition-all duration-300"
                        style={{ borderColor: `${config?.colors?.primary}40`, backgroundColor: 'rgba(0,0,0,0.4)' }}
                    >
                        <Card className="border-0 bg-transparent shadow-none p-0">
                            <div className="flex items-center gap-3 mb-4">
                                <div
                                    className="p-3 rounded-xl shadow-lg animate-pulse"
                                    style={{ backgroundColor: config?.colors?.primary }}
                                >
                                    <MapPin className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold" style={{ color: config?.colors?.text }}>Próximo Posto</h2>
                                    <p className="text-sm opacity-60" style={{ color: config?.colors?.text }}>Dirija-se a este local</p>
                                </div>
                            </div>
                            {settings?.show_checkpoint_map !== false && nextCheckpoint.latitude && nextCheckpoint.longitude && (
                                <>
                                    <div className="flex items-center gap-2 text-sm" style={{ color: config.colors.text }}>
                                        <MapPin className="w-4 h-4" />
                                        <span className="font-mono opacity-80">
                                            {nextCheckpoint.latitude?.toFixed(6)}, {nextCheckpoint.longitude?.toFixed(6)}
                                        </span>
                                    </div>
                                    <a
                                        href={`https://www.google.com/maps/dir/?api=1&destination=${nextCheckpoint.latitude},${nextCheckpoint.longitude}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-bold shadow-lg transition-all hover:brightness-110 active:scale-95"
                                        style={{
                                            backgroundColor: config.colors.primary,
                                            color: '#ffffff'
                                        }}
                                    >
                                        <Navigation className="w-5 h-5" />
                                        Abrir no Google Maps
                                    </a>
                                </>
                            )}
                        </div>
                    </Card>
                )}

                {/* Completed Checkpoints */}
                {team.times && team.times.length > 0 && (
                    <div className="space-y-4">
                        <h2 className="text-xl font-bold flex items-center gap-2 px-2" style={{ color: config?.colors?.text }}>
                            <Clock className="w-5 h-5" style={{ color: config?.colors?.primary }} />
                            Histórico
                        </h2>
                        <div className="space-y-3">
                            {team.times.map((_, index: number) => {
                                const checkpointOrder = index + 1;
                                const checkpoint = checkpoints?.find((cp) => cp.order === checkpointOrder);
                                const checkpointScore = team.score_per_checkpoint?.[index] ?? 0;
                                const isExpanded = expandedCheckpoints.has(index);

                                return (
                                    <Card
                                        key={checkpoint?.id ?? `checkpoint-${index}`}
                                        className="cursor-pointer transition-all hover:bg-white/10 active:scale-[0.99] overflow-hidden backdrop-blur-md bg-white/5 border-white/5"
                                        onClick={() => toggleCheckpoint(index)}
                                    >
                                        <div className="p-4 flex items-center justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-white/10"
                                                        style={{ color: config?.colors?.text }}
                                                    >
                                                        {checkpointOrder}
                                                    </div>
                                                    <span className="text-lg font-semibold" style={{ color: config?.colors?.text }}>
                                                        {checkpoint?.name || `Posto ${checkpointOrder}`}
                                                    </span>
                                                </div>
                                                {showScore && (
                                                    <p className="text-sm opacity-60 mt-1 ml-11" style={{ color: config?.colors?.text }}>
                                                        +{checkpointScore} pontos
                                                    </p>
                                                )}
                                            </div>
                                            {isExpanded ? (
                                                <ChevronUp className="w-5 h-5 opacity-50" style={{ color: config?.colors?.text }} />
                                            ) : (
                                                <ChevronDown className="w-5 h-5 opacity-50" style={{ color: config?.colors?.text }} />
                                            )}
                                        </div>

                                        {isExpanded && (
                                            <div className="px-4 pb-4 pt-0 pl-14 opacity-80 space-y-2 animate-in slide-in-from-top-2">
                                                <div className="text-sm" style={{ color: config?.colors?.text }}>
                                                    <span className="opacity-60">Completado às: </span>
                                                    <span className="font-mono font-medium">{formatTime(team.times[index])}</span>
                                                </div>
                                                {settings?.show_checkpoint_map !== false && checkpoint?.latitude && checkpoint?.longitude && (
                                                    <>
                                                        <div className="flex items-center gap-2 text-sm" style={{ color: config.colors.text }}>
                                                            <MapPin className="w-4 h-4" />
                                                            <span className="font-mono opacity-80">
                                                                {checkpoint.latitude?.toFixed(6)}, {checkpoint.longitude?.toFixed(6)}
                                                            </span>
                                                        </div>
                                                        <a
                                                            href={`https://www.google.com/maps/dir/?api=1&destination=${checkpoint.latitude},${checkpoint.longitude}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-2 text-sm font-medium hover:underline mt-1"
                                                            style={{ color: config.colors.primary }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <Navigation className="w-4 h-4" />
                                                            Ver no Mapa
                                                        </a>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </Card>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

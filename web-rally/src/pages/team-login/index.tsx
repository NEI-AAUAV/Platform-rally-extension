import { useState, useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LogIn, Loader2, Camera, ShieldCheck } from "lucide-react";
import useTeamAuth from "@/hooks/useTeamAuth";
import useStaffLogin from "@/hooks/useLoginLink";
import { useAppToast } from "@/hooks/use-toast";
import QRCodeScanner from "@/components/QRCodeScanner";

export default function TeamLogin() {
    const navigate = useNavigate();
    const search = useSearch({ strict: false }) as { code?: string };
    const codeFromUrl = typeof search.code === "string" ? search.code : undefined;
    const { login, isAuthenticated, teamData, isLoggingIn, loginError } = useTeamAuth();
    const onStaffLogin = useStaffLogin();
    const toast = useAppToast();

    const [accessCode, setAccessCode] = useState("");
    const [showScanner, setShowScanner] = useState(false);

    // Pre-fill access code from URL if provided (QR code scan from outside the app)
    useEffect(() => {
        if (codeFromUrl && !isLoggingIn) {
            setAccessCode(codeFromUrl);
            // Auto-submit if code is provided from URL (with slight delay for smooth UX)
            const timer = setTimeout(async () => {
                try {
                    await login(codeFromUrl.trim());
                    toast.success("Login bem-sucedido!");
                    navigate({ to: "/team-progress" });
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Código de acesso inválido";
                    toast.error(errorMessage);
                }
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [codeFromUrl, isLoggingIn, login, toast, navigate]);

    // Only redirect if authenticated AND not coming from a team-change intent
    // (i.e., not navigated here via the 'Trocar Equipa' link)
    // We allow re-entry by not redirecting automatically when already authenticated.

    // Extract access code from scanned QR code URL
    const extractCodeFromUrl = (url: string): string | null => {
        try {
            const urlObj = new URL(url);
            const code = urlObj.searchParams.get("code");
            return code;
        } catch {
            // If it's just the code format (XXXX-XXXX), return as is
            if (/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(url)) {
                return url;
            }
            return null;
        }
    };

    const handleQRScan = (scannedData: string) => {
        const code = extractCodeFromUrl(scannedData);
        if (code) {
            setAccessCode(code);
            setShowScanner(false);
            // Auto-submit after extracting code
            setTimeout(() => {
                handleSubmit(undefined, code);
            }, 200);
        } else {
            toast.error("Código QR inválido. Por favor, tente novamente.");
        }
    };

    const handleSubmit = async (e?: React.FormEvent, codeToUse?: string) => {
        if (e) e.preventDefault();

        const code = codeToUse || accessCode.trim();

        if (!code) {
            toast.error("Código necessário - por favor, insira o código de acesso da equipa");
            return;
        }

        try {
            await login(code);
            toast.success("Login bem-sucedido!");
            navigate({ to: "/team-progress" });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Código de acesso inválido";
            toast.error(errorMessage);
        }
    };

    return (
        <div className="flex min-h-[70vh] items-center justify-center">
            <div className="w-full max-w-[440px] animate-in fade-in zoom-in-95 duration-500">
                <div className="rally-surface rally-elevate rounded-[22px] p-[30px]">
                    <div className="text-center space-y-6">
                        {/* Header Section */}
                        <div className="flex flex-col items-center space-y-4">
                            <div className="rally-bg-accent flex h-[68px] w-[68px] items-center justify-center rounded-[20px] shadow-[0_16px_36px_-16px_var(--rally-accent,#008542)]">
                                    <LogIn className="w-[30px] h-[30px] text-white" />
                            </div>

                            <div className="space-y-1">
                                <h1 className="rally-display text-3xl font-bold tracking-tight">
                                    {isAuthenticated ? "Trocar Equipa" : "Login de Equipa"}
                                </h1>
                                <p className="text-sm font-medium text-muted-foreground">
                                    {isAuthenticated && teamData
                                        ? `Equipa atual: ${teamData.team_name}. Introduza o código da nova equipa.`
                                        : "Introduza o seu código de acesso"
                                    }
                                </p>
                            </div>
                        </div>

                        {/* Form Section */}
                        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
                            <div className="space-y-2 text-left">
                                <Label
                                    htmlFor="accessCode"
                                    className="ml-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                                >
                                    Código de Acesso
                                </Label>
                                <Input
                                    id="accessCode"
                                    type="text"
                                    placeholder="XXXX-XXXX"
                                    value={accessCode}
                                    onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                                    className="h-20 rounded-2xl border-2 border-[var(--rally-accent,#008542)] bg-secondary text-center font-mono text-4xl font-bold tracking-[0.24em] focus-visible:ring-2 focus-visible:ring-[var(--rally-accent,#008542)] focus-visible:ring-offset-0"
                                    maxLength={9}
                                    autoComplete="off"
                                    autoFocus
                                    disabled={isLoggingIn}
                                />
                                <p className="text-center text-xs italic text-muted-foreground">
                                    Exemplo: AXYZ-1234
                                </p>
                            </div>

                            {loginError && (
                                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 animate-in slide-in-from-top-2">
                                    <p className="text-center text-sm font-medium text-destructive">
                                        {loginError instanceof Error ? loginError.message : "Código inválido"}
                                    </p>
                                </div>
                            )}

                            <div className="flex gap-2">
                                <Button
                                    type="submit"
                                    className="rally-bg-accent rally-press h-12 flex-1 text-lg font-bold text-white"
                                    disabled={isLoggingIn || !accessCode.trim()}
                                >
                                    {isLoggingIn ? (
                                        <span className="flex items-center gap-2">
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                            A Verificar...
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-2">
                                            Entrar
                                            <LogIn className="h-5 w-5" />
                                        </span>
                                    )}
                                </Button>

                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-12 px-4"
                                    onClick={() => setShowScanner(true)}
                                    title="Ler código QR com câmara"
                                >
                                    <Camera className="h-5 w-5" />
                                </Button>
                            </div>
                        </form>

                        {/* NEI account login — for personal profile & history */}
                        <div className="border-t border-border pt-6">
                            <p className="mb-3 text-xs text-muted-foreground">
                                Tens conta NEI? Inicia sessão para ligares a tua participação ao teu perfil e veres o teu histórico.
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onStaffLogin()}
                                className="h-11 w-full gap-2 font-semibold"
                            >
                                <ShieldCheck className="h-4 w-4" />
                                Entrar / Registar com conta NEI
                            </Button>
                        </div>

                        {/* Footer */}
                        <div className="pt-2">
                            <p className="text-xs text-muted-foreground">
                                Pode inserir o código manualmente ou usar a câmara para ler o QR code.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* QR Code Scanner Modal */}
            <QRCodeScanner
                isOpen={showScanner}
                onScan={handleQRScan}
                onClose={() => setShowScanner(false)}
            />
        </div>
    );
}

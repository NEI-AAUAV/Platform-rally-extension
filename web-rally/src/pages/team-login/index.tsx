import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useThemedComponents } from "@/components/themes/ThemeContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LogIn, Loader2, Camera } from "lucide-react";
import useTeamAuth from "@/hooks/useTeamAuth";
import { useAppToast } from "@/hooks/use-toast";
import QRCodeScanner from "@/components/QRCodeScanner";

export default function TeamLogin() {
    const components = useThemedComponents();
    // Destructure themed components from the context
    // We use the theme's Card if available, or fallback to a standard one if needed.
    // However, useThemedComponents return `components` which has `Card`.
    const { Card, config } = components;

    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { login, isAuthenticated, isLoggingIn, loginError } = useTeamAuth();
    const toast = useAppToast();

    const [accessCode, setAccessCode] = useState("");
    const [showScanner, setShowScanner] = useState(false);


    // Pre-fill access code from URL if provided (QR code scan from outside the app)
    useEffect(() => {
        const codeFromUrl = searchParams.get("code");
        if (codeFromUrl && !isLoggingIn) {
            setAccessCode(codeFromUrl);
            // Auto-submit if code is provided from URL (with slight delay for smooth UX)
            const timer = setTimeout(async () => {
                try {
                    await login(codeFromUrl.trim());
                    toast.success("Login bem-sucedido!");
                    navigate("/team-progress");
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Código de acesso inválido";
                    toast.error(errorMessage);
                }
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [searchParams, isLoggingIn, login, toast, navigate]);

    // Redirect if already authenticated
    useEffect(() => {
        if (isAuthenticated) {
            navigate("/team-progress");
        }
    }, [isAuthenticated, navigate]);

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
            navigate("/team-progress");
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Código de acesso inválido";
            toast.error(errorMessage);
        }
    };

    return (
        <div
            className="min-h-screen flex items-center justify-center p-4 transition-all duration-500"
            style={components.background}
        >
            <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-500"
                style={{
                    backgroundColor: "rgba(20, 20, 25, 0.7)", // Semi-transparent fallback
                    borderColor: config?.colors?.primary,
                    borderWidth: "1px",
                    borderRadius: "0.5rem" // Added for consistent look with Card
                }}
            >
                <Card
                    className="shadow-2xl backdrop-blur-md border-opacity-50 border-0 bg-transparent"
                >
                    <div className="p-8 text-center space-y-6">
                        {/* Header Section */}
                        <div className="flex flex-col items-center space-y-4">
                            {config?.images?.logo ? (
                                <div className="relative h-20 w-auto transition-transform hover:scale-105 duration-300">
                                    <img
                                        src={config?.images?.logo}
                                        alt="Rally Logo"
                                        className="h-full w-auto object-contain drop-shadow-lg"
                                    />
                                </div>
                            ) : (
                                <div
                                    className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg"
                                    style={{ backgroundColor: config?.colors?.primary }}
                                >
                                    <LogIn className="w-8 h-8 text-white" />
                                </div>
                            )}

                            <div className="space-y-1">
                                <h1
                                    className="text-3xl font-bold tracking-tight"
                                    style={{ color: config?.colors?.text }}
                                >
                                    Login de Equipa
                                </h1>
                                <p className="text-sm font-medium opacity-80" style={{ color: config?.colors?.text }}>
                                    Introduza o seu código de acesso
                                </p>
                            </div>
                        </div>

                        {/* Form Section */}
                        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
                            <div className="space-y-2 text-left">
                                <Label
                                    htmlFor="accessCode"
                                    className="text-xs font-semibold uppercase tracking-wider ml-1"
                                    style={{ color: config?.colors?.text, opacity: 0.8 }}
                                >
                                    Código de Acesso
                                </Label>
                                <div className="relative group">
                                    <Input
                                        id="accessCode"
                                        type="text"
                                        placeholder="XXXX-XXXX"
                                        value={accessCode}
                                        onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                                        className="text-center text-2xl font-mono tracking-[0.2em] h-14 transition-all duration-300"
                                        style={{
                                            backgroundColor: "rgba(0,0,0,0.2)",
                                            borderColor: `${config?.colors?.primary}40`,
                                            color: config?.colors?.text,
                                            boxShadow: `0 0 0 1px transparent`
                                        }}
                                        maxLength={9}
                                        autoComplete="off"
                                        autoFocus
                                        disabled={isLoggingIn}
                                    />
                                    {/* Focus Ring Effect */}
                                    <div
                                        className="absolute inset-0 rounded-md pointer-events-none opacity-0 group-focus-within:opacity-100 transition-opacity duration-300"
                                        style={{
                                            boxShadow: `0 0 0 2px ${config?.colors?.primary}80`
                                        }}
                                    />
                                </div>
                                <p className="text-xs text-center italic opacity-50" style={{ color: config?.colors?.text }}>
                                    Exemplo: AXYZ-1234
                                </p>
                            </div>

                            {loginError && (
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 animate-in slide-in-from-top-2">
                                    <p className="text-sm text-red-400 text-center font-medium">
                                        {loginError instanceof Error ? loginError.message : "Código inválido"}
                                    </p>
                                </div>
                            )}

                            <div className="flex gap-2">
                                <Button
                                    type="submit"
                                    className="flex-1 h-12 text-lg font-bold shadow-lg transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                                    disabled={isLoggingIn || !accessCode.trim()}
                                    style={{
                                        backgroundColor: config?.colors?.primary,
                                        color: '#ffffff', // Ensure contrast
                                    }}
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
                                    className="h-12 px-4 shadow-lg transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                                    onClick={() => setShowScanner(true)}
                                    title="Ler código QR com câmara"
                                >
                                    <Camera className="h-5 w-5" />
                                </Button>
                            </div>
                        </form>

                        {/* Footer */}
                        <div className="pt-6 border-t border-white/5">
                            <p className="text-xs opacity-40 hover:opacity-100 transition-opacity duration-300" style={{ color: config?.colors?.text }}>
                                Pode inserir o código manualmente ou usar a câmara para ler o QR code.
                            </p>
                        </div>
                    </div>
                </Card>
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

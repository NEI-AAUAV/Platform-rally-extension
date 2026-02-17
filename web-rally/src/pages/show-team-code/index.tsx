import { useState } from "react";
import { useThemedComponents } from "@/components/themes/ThemeContext";
import { QrCode, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import useTeamAuth from "@/hooks/useTeamAuth";
import { useAppToast } from "@/hooks/use-toast";
import QRCodeDisplay from "@/components/QRCodeDisplay";

/**
 * Page for teams to view and display their QR code
 * Useful for showing participants the code to scan
 */
export default function ShowTeamCode() {
  const { Card, config } = useThemedComponents();
  const { team } = useTeamAuth();
  const toast = useAppToast();
  const [copied, setCopied] = useState(false);

  if (!team) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="shadow-2xl">
          <div className="p-8 text-center">
            <p className="text-white">Equipa não encontrada. Faça login primeiro.</p>
          </div>
        </Card>
      </div>
    );
  }

  const accessCode = team.access_code;
  const loginUrl = `${window.location.origin}/rally/team-login?code=${accessCode}`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(accessCode);
    setCopied(true);
    toast.success("Código copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(loginUrl);
    toast.success("URL copiada!");
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="min-h-screen p-6 transition-colors duration-500"
      style={{ ...useThemedComponents().background }}
    >
      <div className="container mx-auto max-w-2xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div
              className="p-3 rounded-full"
              style={{ backgroundColor: `${config.colors.primary}20` }}
            >
              <QrCode
                className="w-6 h-6"
                style={{ color: config.colors.primary }}
              />
            </div>
          </div>
          <h1
            className="text-4xl font-bold"
            style={{ color: config.colors.text }}
          >
            Código da Equipa
          </h1>
          <p
            className="text-sm opacity-70"
            style={{ color: config.colors.text }}
          >
            {team.name}
          </p>
        </div>

        {/* QR Code Display */}
        <Card variant="default" padding="lg" rounded="2xl" className="text-center">
          <div className="space-y-6">
            <div>
              <p
                className="text-sm font-semibold mb-4 opacity-70"
                style={{ color: config.colors.text }}
              >
                Escaneie este código ou insira o código de acesso
              </p>
              <QRCodeDisplay accessCode={accessCode} size={300} />
            </div>

            {/* Code Display */}
            <div className="space-y-2 p-4 bg-black/30 rounded-lg border border-white/10">
              <p className="text-sm opacity-50">Código de Acesso</p>
              <div className="flex items-center justify-between gap-2">
                <code
                  className="text-2xl font-mono font-bold tracking-widest flex-1"
                  style={{ color: config.colors.primary }}
                >
                  {accessCode}
                </code>
                <Button
                  size="sm"
                  variant={copied ? "default" : "outline"}
                  onClick={handleCopyCode}
                  className="gap-2"
                  style={
                    copied
                      ? { backgroundColor: config.colors.primary }
                      : undefined
                  }
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copiar
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Instructions */}
            <div className="space-y-3 p-4 bg-white/5 rounded-lg border border-white/10 text-left">
              <p className="text-sm font-semibold">Como utilizar:</p>
              <ol className="text-xs space-y-2 list-decimal list-inside opacity-70">
                <li>
                  Mostrar este código aos participantes da sua equipa
                </li>
                <li>
                  Os participantes podem escanear o código QR ou inserir manualmente o código
                </li>
                <li>
                  Após login, verão o progresso da equipa em tempo real
                </li>
              </ol>
            </div>
          </div>
        </Card>

        {/* Login URL */}
        <Card variant="default" padding="lg" rounded="2xl">
          <div className="space-y-3">
            <p
              className="text-sm font-semibold opacity-70"
              style={{ color: config.colors.text }}
            >
              Link de Login Direto
            </p>
            <div className="flex items-start gap-2">
              <input
                type="text"
                value={loginUrl}
                readOnly
                className="flex-1 p-2 text-xs bg-black/20 rounded border border-white/10 text-white/70 overflow-x-auto"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyUrl}
                className="gap-1 whitespace-nowrap"
              >
                <Copy className="w-4 h-4" />
                Copiar
              </Button>
            </div>
          </div>
        </Card>

        {/* Print Button */}
        <div className="flex justify-center">
          <Button
            onClick={handlePrint}
            className="px-6 py-2 gap-2"
            style={{
              backgroundColor: config.colors.primary,
              color: "#ffffff",
            }}
          >
            Imprimir Código
          </Button>
        </div>

        {/* Full Screen Code Button */}
        <div className="flex justify-center">
          <Button
            variant="outline"
            className="px-6 py-2"
            onClick={() => {
              // Open fullscreen code view
              const fullscreenHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                  <title>Código da Equipa - ${team.name}</title>
                  <style>
                    body { margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #000; font-family: monospace; }
                    .container { text-align: center; }
                    .code { font-size: 120px; font-weight: bold; color: #ff0000; letter-spacing: 10px; margin: 50px 0; }
                    .team { color: #fff; font-size: 24px; margin-bottom: 30px; }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="team">${team.name}</div>
                    <div class="code">${accessCode}</div>
                  </div>
                </body>
                </html>
              `;
              const window_ = window.open("", "_blank");
              if (window_) {
                window_.document.write(fullscreenHtml);
              }
            }}
          >
            Modo Apresentação
          </Button>
        </div>
      </div>
    </div>
  );
}

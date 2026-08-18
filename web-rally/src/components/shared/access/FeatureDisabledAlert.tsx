import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

interface FeatureDisabledAlertProps {
  featureName: string;
  settingsPath?: string;
  className?: string;
  /** Override the default "ative-o nas configurações" text — use when the
   * switch isn't in Settings (e.g. a deploy-time env var). Hides the "Ir
   * para Configurações" button, since there's nothing to go configure. */
  reason?: string;
}

export default function FeatureDisabledAlert({
  featureName,
  settingsPath = "/settings",
  className = "",
  reason,
}: Readonly<FeatureDisabledAlertProps>) {
  return (
    <div className={`mt-16 space-y-4 text-center ${className}`}>
      <Alert className="mx-auto max-w-md">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {reason ??
            `O ${featureName} não está ativado. Ative-o nas configurações para usar esta funcionalidade.`}
        </AlertDescription>
      </Alert>
      {!reason && (
        <Button asChild>
          <a href={settingsPath}>Ir para Configurações</a>
        </Button>
      )}
    </div>
  );
}

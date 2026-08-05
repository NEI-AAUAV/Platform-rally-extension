import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

interface FeatureDisabledAlertProps {
  featureName: string;
  settingsPath?: string;
  className?: string;
}

export default function FeatureDisabledAlert({
  featureName,
  settingsPath = "/settings",
  className = "",
}: Readonly<FeatureDisabledAlertProps>) {
  return (
    <div className={`mt-16 space-y-4 text-center ${className}`}>
      <Alert className="mx-auto max-w-md">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          O {featureName} não está ativado. Ative-o nas configurações para usar esta funcionalidade.
        </AlertDescription>
      </Alert>
      <Button asChild>
        <a href={settingsPath}>Ir para Configurações</a>
      </Button>
    </div>
  );
}

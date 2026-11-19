import { Bell, BellOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { usePushNotifications } from "@/hooks/usePushNotifications";

interface NotificationSettingsProps {
  readonly className?: string;
}

/**
 * Web Push opt-in. Only rendered with a session (see preferences page): the
 * subscription belongs to the staff/user account or to the team logged in on
 * this device, whichever session sends the request. Silently absent when
 * the server has no VAPID keys configured, or when the platform can't
 * deliver push at all (iOS PWA not yet added to the Home Screen).
 */
export function NotificationSettings({ className = "" }: NotificationSettingsProps) {
  const { status, loading, subscribe, unsubscribe } = usePushNotifications();

  if (status === "unconfigured") return null;

  const subscribed = status === "subscribed";
  const handleToggle = (checked: boolean) => {
    (checked ? subscribe() : unsubscribe()).catch(() => undefined);
  };
  const Icon = subscribed ? Bell : BellOff;

  return (
    <section className={`rally-surface p-6 ${className}`} aria-labelledby="notifications-heading">
      <h2 id="notifications-heading" className="rally-display text-lg font-bold text-foreground">
        Notificações
      </h2>
      <p className="mt-0.5 text-xs uppercase tracking-[0.14em] text-muted-foreground">
        Só neste dispositivo
      </p>

      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-foreground">Avisos em tempo real</p>
            <p className="text-xs text-muted-foreground">
              {status === "unsupported" &&
                "Adiciona esta app ao ecrã principal para ativar notificações."}
              {status === "denied" && "Permissão negada nas definições do dispositivo."}
              {(status === "unsubscribed" || status === "subscribed") &&
                "Recebe avisos da organização e dos postos."}
            </p>
          </div>
        </div>
        <Switch
          checked={subscribed}
          disabled={loading || status === "unsupported" || status === "denied"}
          onCheckedChange={handleToggle}
          aria-label="Ativar notificações"
        />
      </div>
    </section>
  );
}

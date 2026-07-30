import { useNavigate } from "@tanstack/react-router";
import { Repeat, LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import useTeamAuth from "@/hooks/useTeamAuth";
import { useAppToast } from "@/hooks/use-toast";

export default function TeamSettings() {
  const navigate = useNavigate();
  const { teamData, logout } = useTeamAuth();
  const toast = useAppToast();

  const handleLogout = () => {
    logout();
    toast.success("Sessão terminada");
    void navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-[440px] duration-500 animate-in fade-in zoom-in-95">
        <div className="rally-surface rally-elevate rounded-[22px] p-[30px]">
          <div className="space-y-6">
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="rally-bg-accent flex h-[68px] w-[68px] items-center justify-center rounded-[20px] shadow-[0_16px_36px_-16px_var(--rally-accent,#008542)]">
                <Settings className="h-[30px] w-[30px] text-white" />
              </div>
              <div className="space-y-1">
                <h1 className="rally-display text-3xl font-bold tracking-tight">Definições</h1>
                {teamData?.team_name && (
                  <p className="text-sm font-medium text-muted-foreground">
                    Equipa atual: {teamData.team_name}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full justify-start gap-3 text-base font-semibold"
                onClick={() => navigate({ to: "/team-login" })}
              >
                <Repeat className="h-5 w-5" />
                Trocar Equipa
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 w-full justify-start gap-3 text-base font-semibold text-destructive hover:text-destructive"
                  >
                    <LogOut className="h-5 w-5" />
                    Terminar Sessão
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Terminar sessão?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Vais precisar do código de acesso da equipa para entrares novamente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleLogout}>Terminar Sessão</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

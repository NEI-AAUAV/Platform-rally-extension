import { useId, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppToast } from "@/hooks/use-toast";
import { useEventMutations } from "@/hooks/useEvents";
import type { RallyEvent } from "@/types/event";
import { getErrorMessage } from "@/utils/errorHandling";

function totalRemoved(deleted: Record<string, number>): number {
  return Object.values(deleted).reduce((sum, n) => sum + n, 0);
}

/**
 * Permanently delete a (test) edition. The admin must retype the edition's
 * name — the server checks it too — so a slip of the finger can't wipe a real
 * edition. Never offered for the current edition; the server also refuses one
 * whose rally is running, and that error is shown inside the dialog.
 */
export default function DeleteEventDialog({ event }: Readonly<{ event: RallyEvent }>) {
  const toast = useAppToast();
  const { remove } = useEventMutations();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  const matches = typed.trim() === event.name.trim();

  const handleOpenChange = (next: boolean) => {
    if (remove.isPending) return;
    setOpen(next);
    if (!next) {
      setTyped("");
      setError(null);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!matches || remove.isPending) return;
    setError(null);
    remove.mutate(
      { id: event.id, confirmName: typed },
      {
        onSuccess: (result) => {
          toast.success(
            `Edição "${event.name}" eliminada (${totalRemoved(result.deleted)} registos)`,
          );
          // Reset directly: this closure's `remove.isPending` is still true, so
          // handleOpenChange would refuse to close.
          setOpen(false);
          setTyped("");
          setError(null);
        },
        onError: (err) => setError(getErrorMessage(err, "Erro ao eliminar edição")),
      },
    );
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="w-8 justify-center px-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
        aria-label={`Eliminar edição ${event.name}`}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar edição permanentemente?</AlertDialogTitle>
              <AlertDialogDescription>
                Apaga <strong className="text-foreground">{event.name}</strong> e tudo o que lhe
                pertence: equipas, postos, atividades, avaliações, badges e definições. As contas
                reais dos participantes mantêm-se. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor={inputId}>
                Escreve <span className="font-semibold">{event.name}</span> para confirmar
              </Label>
              <Input
                id={inputId}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoFocus
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${inputId}-error` : undefined}
              />
              {error && (
                <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel type="button" disabled={remove.isPending}>
                Cancelar
              </AlertDialogCancel>
              <Button type="submit" variant="destructive" disabled={!matches || remove.isPending}>
                {remove.isPending ? "A eliminar…" : "Eliminar edição"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

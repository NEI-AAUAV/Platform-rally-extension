import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CheckpointConfirmDialogProps {
  pendingAction: "hint" | "giveUp" | null;
  skipCost: number;
  nextHintCost: number;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Shared in-app confirmation for both point-spending actions on this card
 * (hint reveal, give-up) — an in-app dialog instead of the browser's
 * confirm(), which breaks the app's look and, on some mobile webviews,
 * doesn't appear at all.
 */
export default function CheckpointConfirmDialog({
  pendingAction,
  skipCost,
  nextHintCost,
  onConfirm,
  onClose,
}: Readonly<CheckpointConfirmDialogProps>) {
  const copy =
    pendingAction === "giveUp"
      ? {
          title: "Desistir deste posto?",
          description:
            skipCost === 0
              ? "Não o vais pontuar, e passas ao enigma seguinte."
              : `Custa ${Math.abs(skipCost)} pontos e não o vais pontuar.`,
          action: "Desistir",
        }
      : {
          title: "Pedir uma pista?",
          description: `Custa ${Math.abs(nextHintCost)} pontos.`,
          action: "Pedir pista",
        };

  return (
    <AlertDialog open={pendingAction !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{copy.action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

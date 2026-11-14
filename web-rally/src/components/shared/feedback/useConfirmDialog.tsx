import { useCallback, useRef, useState, type ReactNode } from "react";
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

const DESTRUCTIVE_ACTION =
  "!bg-destructive !text-destructive-foreground hover:!bg-destructive/90 hover:brightness-100";

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm action as destructive (delete, revoke…). */
  destructive?: boolean;
}

export interface UseConfirmDialogResult {
  /** Opens the dialog; resolves true on confirm, false on cancel/dismiss. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Render this once in the component tree. */
  dialog: ReactNode;
}

/**
 * In-app replacement for window.confirm(), which breaks the app's look and is
 * suppressed entirely in some mobile webviews.
 */
export function useConfirmDialog(): UseConfirmDialogResult {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const confirm = useCallback((next: ConfirmOptions) => {
    // A second request supersedes an open one; the first resolves as cancelled.
    resolverRef.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const dialog = (
    <AlertDialog open={options !== null} onOpenChange={(open) => !open && settle(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options?.title}</AlertDialogTitle>
          {options?.description && (
            <AlertDialogDescription>{options.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{options?.cancelLabel ?? "Cancelar"}</AlertDialogCancel>
          <AlertDialogAction
            // AlertDialogAction always applies the accent-filled default variant;
            // `rally-bg-accent` lives in the same layer, so `!` makes destructive win.
            className={options?.destructive ? DESTRUCTIVE_ACTION : undefined}
            onClick={() => settle(true)}
          >
            {options?.confirmLabel ?? "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, dialog };
}

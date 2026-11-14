import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useConfirmDialog } from "@/components/shared/feedback/useConfirmDialog";

function Harness({ onResult }: { onResult: (ok: boolean) => void }) {
  const { confirm, dialog } = useConfirmDialog();
  return (
    <>
      <button
        type="button"
        onClick={async () =>
          onResult(
            await confirm({
              title: "Eliminar equipa?",
              description: "Não dá para desfazer.",
              confirmLabel: "Eliminar",
              destructive: true,
            }),
          )
        }
      >
        apagar
      </button>
      {dialog}
    </>
  );
}

describe("useConfirmDialog", () => {
  it("resolves true when the action is confirmed", async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    await userEvent.click(screen.getByRole("button", { name: "apagar" }));

    expect(screen.getByRole("alertdialog", { name: "Eliminar equipa?" })).toBeInTheDocument();
    expect(screen.getByText("Não dá para desfazer.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(onResult).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("resolves false when cancelled", async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    await userEvent.click(screen.getByRole("button", { name: "apagar" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onResult).toHaveBeenCalledWith(false);
  });

  it("resolves false when dismissed with Escape", async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    await userEvent.click(screen.getByRole("button", { name: "apagar" }));
    await userEvent.keyboard("{Escape}");

    expect(onResult).toHaveBeenCalledWith(false);
  });
});

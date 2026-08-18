import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { useForm, FormProvider } from "react-hook-form";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DragEndEvent } from "@dnd-kit/core";
import RulesSettings from "@/pages/settings/components/RulesSettings";

const { mockViewRallySettings, mockUploadRallyRulesPdf } = vi.hoisted(() => ({
  mockViewRallySettings: vi.fn(),
  mockUploadRallyRulesPdf: vi.fn(),
}));

vi.mock("@/client", () => ({
  viewRallySettings: (...args: unknown[]) => mockViewRallySettings(...args),
  uploadRallyRulesPdf: (...args: unknown[]) => mockUploadRallyRulesPdf(...args),
}));

vi.mock("@/hooks/use-toast", () => ({
  useAppToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const dragEndHandlers: Array<(event: DragEndEvent) => void> = [];

vi.mock("@dnd-kit/core", async () => {
  const actual = await vi.importActual<typeof import("@dnd-kit/core")>("@dnd-kit/core");
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
    }: {
      readonly children: React.ReactNode;
      readonly onDragEnd: (event: DragEndEvent) => void;
    }) => {
      dragEndHandlers.push(onDragEnd);
      return children;
    },
  };
});

function makeDragEndEvent(activeId: string | null, overId: string | null): DragEndEvent {
  return {
    active: activeId ? { id: activeId } : (null as never),
    over: overId ? { id: overId } : null,
  } as DragEndEvent;
}

beforeAll(() => {
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = MockResizeObserver;
});

function Wrapper({
  defaultSections = [{ id: "a", title: "Como funciona", icon: "MapPin", body: "Texto inicial." }],
}: {
  readonly defaultSections?: { id: string; title: string; icon: string; body: string }[];
}) {
  const methods = useForm({
    defaultValues: { rules_sections: defaultSections },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <FormProvider {...methods}>
        <form>
          <RulesSettings />
        </form>
      </FormProvider>
    </QueryClientProvider>
  );
}

describe("RulesSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dragEndHandlers.length = 0;
    mockViewRallySettings.mockResolvedValue({ data: { rules_pdf_url: "" } });
  });

  it("renders existing sections with title and body", () => {
    render(<Wrapper />);
    expect(screen.getByLabelText("Título da secção")).toHaveValue("Como funciona");
    expect(screen.getByLabelText("Texto da secção")).toHaveValue("Texto inicial.");
  });

  it("shows an empty-state hint when there are no sections", () => {
    render(<Wrapper defaultSections={[]} />);
    expect(screen.getByText(/Nenhuma secção ainda/)).toBeInTheDocument();
  });

  it("adds a new blank section on button click", async () => {
    const user = userEvent.setup();
    render(<Wrapper defaultSections={[]} />);
    await user.click(screen.getByRole("button", { name: /Adicionar secção/i }));
    expect(screen.getByLabelText("Título da secção")).toHaveValue("");
  });

  it("removes a section on trash button click", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    await user.click(screen.getByLabelText("Remover secção"));
    expect(screen.queryByLabelText("Título da secção")).not.toBeInTheDocument();
  });

  it("types into a section's title and body", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    const title = screen.getByLabelText("Título da secção");
    await user.clear(title);
    await user.type(title, "Novo título");
    expect(title).toHaveValue("Novo título");
  });

  it("disables adding a section once the max is reached", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `s${i}`,
      title: `Secção ${i}`,
      icon: "HelpCircle",
      body: "",
    }));
    render(<Wrapper defaultSections={many} />);
    expect(screen.getByRole("button", { name: /Adicionar secção/i })).toBeDisabled();
  });

  it("does nothing when a drag-end event references unknown ids", () => {
    // Sortable ids are react-hook-form's generated field ids, not the
    // section's own `id`, so an event carrying arbitrary ids is a no-op —
    // this exercises that guard the same way HomeLayoutSettings's ticker
    // drag-end tests do (real ids aren't predictable to assert against).
    render(
      <Wrapper
        defaultSections={[
          { id: "a", title: "Primeira", icon: "MapPin", body: "" },
          { id: "b", title: "Segunda", icon: "Trophy", body: "" },
        ]}
      />,
    );
    const [onDragEnd] = dragEndHandlers;
    act(() => onDragEnd!(makeDragEndEvent("nonexistent-a", "nonexistent-b")));
    const titles = screen
      .getAllByLabelText("Título da secção")
      .map((el) => (el as HTMLInputElement).value);
    expect(titles).toEqual(["Primeira", "Segunda"]);
  });

  it("ignores a drag-end event with no drop target", () => {
    render(
      <Wrapper
        defaultSections={[
          { id: "a", title: "Primeira", icon: "MapPin", body: "" },
          { id: "b", title: "Segunda", icon: "Trophy", body: "" },
        ]}
      />,
    );
    const [onDragEnd] = dragEndHandlers;
    act(() => onDragEnd!(makeDragEndEvent("a", null)));
    const titles = screen
      .getAllByLabelText("Título da secção")
      .map((el) => (el as HTMLInputElement).value);
    expect(titles).toEqual(["Primeira", "Segunda"]);
  });

  it("shows the current regulation link when rules_pdf_url is set", async () => {
    mockViewRallySettings.mockResolvedValue({
      data: { rules_pdf_url: "https://r2/regulamento.pdf" },
    });
    render(<Wrapper />);
    expect(await screen.findByText("Ver regulamento atual")).toHaveAttribute(
      "href",
      "https://r2/regulamento.pdf",
    );
  });

  it("shows no-regulation copy when rules_pdf_url is empty", async () => {
    render(<Wrapper />);
    expect(await screen.findByText("Nenhum regulamento carregado.")).toBeInTheDocument();
  });
});

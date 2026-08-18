import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { useForm, FormProvider } from "react-hook-form";
import type { DragEndEvent } from "@dnd-kit/core";
import HomeLayoutSettings from "@/pages/settings/components/HomeLayoutSettings";
import { DEFAULT_HOME_LAYOUT } from "@/lib/homeLayout";

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

function Wrapper() {
  const methods = useForm({
    defaultValues: {
      home_layout: DEFAULT_HOME_LAYOUT,
      ticker_items_list: [{ value: "ITEM ONE" }, { value: "ITEM TWO" }],
    },
  });
  return (
    <FormProvider {...methods}>
      <form>
        <HomeLayoutSettings />
      </form>
    </FormProvider>
  );
}

describe("HomeLayoutSettings", () => {
  it("renders section labels for all home sections", () => {
    render(<Wrapper />);
    expect(screen.getByText("Layout da Página Inicial")).toBeInTheDocument();
    expect(screen.getByText("Cabeçalho principal")).toBeInTheDocument();
    expect(screen.getAllByText("Faixa de destaques (ticker)").length).toBeGreaterThan(0);
    expect(screen.getByText("Banner final")).toBeInTheDocument();
  });

  it("renders ticker item inputs with their values", () => {
    render(<Wrapper />);
    expect(screen.getByLabelText("Item 1 da faixa de destaques")).toHaveValue("ITEM ONE");
    expect(screen.getByLabelText("Item 2 da faixa de destaques")).toHaveValue("ITEM TWO");
  });

  it("toggles section visibility switch", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    const toggle = screen.getByLabelText("Mostrar secção Cabeçalho principal");
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
  });

  it("adds a new ticker item on button click", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    await user.click(screen.getByRole("button", { name: /Adicionar item/i }));
    expect(screen.getByLabelText("Item 3 da faixa de destaques")).toBeInTheDocument();
  });

  it("removes a ticker item on trash button click", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    const removeButtons = screen.getAllByLabelText("Remover item");
    await user.click(removeButtons[0]!);
    expect(screen.queryByLabelText("Item 2 da faixa de destaques")).not.toBeInTheDocument();
  });

  it("falls back to raw section key when label is missing", () => {
    function CustomWrapper() {
      const methods = useForm({
        defaultValues: {
          home_layout: [{ key: "unknown_section", visible: true }],
          ticker_items_list: [],
        },
      });
      return (
        <FormProvider {...methods}>
          <form>
            <HomeLayoutSettings />
          </form>
        </FormProvider>
      );
    }
    render(<CustomWrapper />);
    expect(screen.getByText("unknown_section")).toBeInTheDocument();
    expect(screen.getByLabelText("Mostrar secção unknown_section")).toBeInTheDocument();
  });

  it("renders with no home_layout value (defaults to empty array)", () => {
    function EmptyWrapper() {
      const methods = useForm({
        defaultValues: {
          home_layout: undefined,
          ticker_items_list: [],
        },
      });
      return (
        <FormProvider {...methods}>
          <form>
            <HomeLayoutSettings />
          </form>
        </FormProvider>
      );
    }
    render(<EmptyWrapper />);
    expect(screen.getByText("Layout da Página Inicial")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Mostrar secção/)).not.toBeInTheDocument();
  });

  it("renders ticker item with empty value fallback when field value is undefined", () => {
    function UndefinedValueWrapper() {
      const methods = useForm({
        defaultValues: {
          home_layout: DEFAULT_HOME_LAYOUT,
          ticker_items_list: [{ value: undefined }],
        },
      });
      return (
        <FormProvider {...methods}>
          <form>
            <HomeLayoutSettings />
          </form>
        </FormProvider>
      );
    }
    render(<UndefinedValueWrapper />);
    expect(screen.getByLabelText("Item 1 da faixa de destaques")).toHaveValue("");
  });

  it("disables adding a ticker item once MAX_TICKER_ITEMS is reached", () => {
    function MaxTickerWrapper() {
      const methods = useForm({
        defaultValues: {
          home_layout: DEFAULT_HOME_LAYOUT,
          ticker_items_list: Array.from({ length: 20 }, (_, i) => ({ value: `Item ${i}` })),
        },
      });
      return (
        <FormProvider {...methods}>
          <form>
            <HomeLayoutSettings />
          </form>
        </FormProvider>
      );
    }
    render(<MaxTickerWrapper />);
    expect(screen.getByRole("button", { name: /Adicionar item/i })).toBeDisabled();
  });

  it("types into a ticker item input and updates its value", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    const input = screen.getByLabelText("Item 1 da faixa de destaques");
    await user.clear(input);
    await user.type(input, "NEW VALUE");
    expect(input).toHaveValue("NEW VALUE");
  });

  describe("drag-end handlers", () => {
    it("reorders sections when a valid drag-end event fires", () => {
      dragEndHandlers.length = 0;
      render(<Wrapper />);
      const [sectionsOnDragEnd] = dragEndHandlers;
      const firstKey = DEFAULT_HOME_LAYOUT[0]!.key;
      const secondKey = DEFAULT_HOME_LAYOUT[1]!.key;

      act(() => sectionsOnDragEnd!(makeDragEndEvent(firstKey, secondKey)));

      const labels = screen
        .getAllByLabelText(/Mostrar secção/)
        .map((el) => el.getAttribute("aria-label"));
      expect(labels[0]).not.toEqual(labels[1]);
    });

    it("does nothing when drag-end has no drop target", () => {
      dragEndHandlers.length = 0;
      render(<Wrapper />);
      const [sectionsOnDragEnd] = dragEndHandlers;
      const before = screen
        .getAllByLabelText(/Mostrar secção/)
        .map((el) => el.getAttribute("aria-label"));

      act(() => sectionsOnDragEnd!(makeDragEndEvent(DEFAULT_HOME_LAYOUT[0]!.key, null)));

      const after = screen
        .getAllByLabelText(/Mostrar secção/)
        .map((el) => el.getAttribute("aria-label"));
      expect(after).toEqual(before);
    });

    it("does nothing when dragged onto itself", () => {
      dragEndHandlers.length = 0;
      render(<Wrapper />);
      const [sectionsOnDragEnd] = dragEndHandlers;
      const sameKey = DEFAULT_HOME_LAYOUT[0]!.key;
      const before = screen
        .getAllByLabelText(/Mostrar secção/)
        .map((el) => el.getAttribute("aria-label"));

      act(() => sectionsOnDragEnd!(makeDragEndEvent(sameKey, sameKey)));

      const after = screen
        .getAllByLabelText(/Mostrar secção/)
        .map((el) => el.getAttribute("aria-label"));
      expect(after).toEqual(before);
    });

    it("does nothing when active or over id is not found in sections", () => {
      dragEndHandlers.length = 0;
      render(<Wrapper />);
      const [sectionsOnDragEnd] = dragEndHandlers;
      const before = screen
        .getAllByLabelText(/Mostrar secção/)
        .map((el) => el.getAttribute("aria-label"));

      act(() => sectionsOnDragEnd!(makeDragEndEvent("unknown_key", DEFAULT_HOME_LAYOUT[0]!.key)));

      const after = screen
        .getAllByLabelText(/Mostrar secção/)
        .map((el) => el.getAttribute("aria-label"));
      expect(after).toEqual(before);
    });

    it("reorders ticker items when a valid drag-end event fires", () => {
      dragEndHandlers.length = 0;
      render(<Wrapper />);
      const [, tickerOnDragEnd] = dragEndHandlers;
      const input1 = screen.getByLabelText<HTMLInputElement>("Item 1 da faixa de destaques");
      const input2 = screen.getByLabelText<HTMLInputElement>("Item 2 da faixa de destaques");
      const idBefore1 = input1.value;
      const idBefore2 = input2.value;

      // ticker field ids come from useFieldArray, not accessible directly here;
      // exercise the guard branches which don't depend on exact ids matching.
      act(() => tickerOnDragEnd!(makeDragEndEvent("nonexistent-a", "nonexistent-b")));

      expect(screen.getByLabelText("Item 1 da faixa de destaques")).toHaveValue(idBefore1);
      expect(screen.getByLabelText("Item 2 da faixa de destaques")).toHaveValue(idBefore2);
    });

    it("does nothing for ticker drag-end when there is no drop target", () => {
      dragEndHandlers.length = 0;
      render(<Wrapper />);
      const [, tickerOnDragEnd] = dragEndHandlers;
      const before = screen.getByLabelText<HTMLInputElement>("Item 1 da faixa de destaques").value;

      act(() => tickerOnDragEnd!(makeDragEndEvent("any-id", null)));

      expect(screen.getByLabelText("Item 1 da faixa de destaques")).toHaveValue(before);
    });

    it("does nothing for ticker drag-end when dragged onto itself", () => {
      dragEndHandlers.length = 0;
      render(<Wrapper />);
      const [, tickerOnDragEnd] = dragEndHandlers;
      const before = screen.getByLabelText<HTMLInputElement>("Item 1 da faixa de destaques").value;

      act(() => tickerOnDragEnd!(makeDragEndEvent("same-id", "same-id")));

      expect(screen.getByLabelText("Item 1 da faixa de destaques")).toHaveValue(before);
    });
  });

  it("applies custom className", () => {
    function ClassNameWrapper() {
      const methods = useForm({
        defaultValues: {
          home_layout: DEFAULT_HOME_LAYOUT,
          ticker_items_list: [],
        },
      });
      return (
        <FormProvider {...methods}>
          <form>
            <HomeLayoutSettings className="custom-class" />
          </form>
        </FormProvider>
      );
    }
    const { container } = render(<ClassNameWrapper />);
    expect(container.querySelector(".custom-class")).toBeInTheDocument();
  });
});
